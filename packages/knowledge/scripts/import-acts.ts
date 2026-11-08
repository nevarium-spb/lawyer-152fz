/**
 * Импорт актов в `data/`.
 *
 *   pnpm kb:import            — все акты
 *   pnpm kb:import 152-fz     — один акт
 *
 * Источники: официальный портал actual.pravo.gov.ru (ADR-0011); для актов, которых там нет, —
 * официальный сайт Правительства government.ru (ADR-0014); КонсультантПлюс как вторичный источник
 * (ADR-0012) — запасной путь, сейчас ни одним актом не используется.
 * Скрипт перезаписывает файлы акта целиком:
 * изменения закона видны в git diff и проходят ревью в PR, как изменения кода (ADR-0003).
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createConsultantClient, consultantDocumentUrl } from '../src/consultant/consultant-client';
import { parseConsultantHtml } from '../src/consultant/consultant-html';
import { createGovernmentClient, governmentDocumentUrl } from '../src/government/government-client';
import { parseGovernmentHtml } from '../src/government/government-html';
import {
  DATA_DIR,
  NORM_FILE_EXTENSION,
  buildKnowledgeBase,
  readKnowledgeFiles,
  serializeNormFile,
  sha256,
} from '../src/index';
import type { ActKind, ActMeta } from '../src/index';
import {
  createActualPravoClient,
  currentRedaction,
  officialDocumentUrl,
} from '../src/official/actual-pravo-client';
import { extractArticles, extractDecreeItems } from '../src/official/extract';
import type { ExtractedUnit } from '../src/official/extract';
import type { OfficialParagraph } from '../src/official/official-html';
import { parseOfficialHtml } from '../src/official/official-html';

interface DecreeLayout {
  /** Заголовок утверждённого документа: пункты постановления до него не берутся. */
  readonly start: RegExp;
  readonly itemHeading: (item: string) => string;
}

interface ActBase {
  readonly id: string;
  readonly kind: ActKind;
  readonly title: string;
  readonly decree?: DecreeLayout;
}

interface OfficialAct extends ActBase {
  readonly provider: 'actual.pravo.gov.ru';
  readonly docHash: string;
  /** Для кодексов — только нужные статьи. */
  readonly onlyArticles?: readonly string[];
}

interface GovernmentAct extends ActBase {
  readonly provider: 'government.ru';
  /** Число из ссылки government.ru/docs/all/<id>/. */
  readonly documentId: string;
  /** Дата редакции: у сайта нет API редакций, берётся дата акта (акт не менялся). */
  readonly editionDate: string;
  /** Реквизиты печатной публикации — текст на сайте не заменяет официальное опубликование. */
  readonly officialPublication: string;
  readonly decree: DecreeLayout;
}

interface SecondaryAct extends ActBase {
  readonly provider: 'consultant.ru';
  readonly documentId: string;
  readonly section: string;
  /** Дата последней редакции: у вторичного источника её не получить из API. */
  readonly editionDate: string;
  /** Реквизиты официальной публикации — сверены по независимому источнику. */
  readonly officialPublication: string;
  readonly decree: DecreeLayout;
}

const ACTS: readonly (OfficialAct | GovernmentAct | SecondaryAct)[] = [
  {
    provider: 'actual.pravo.gov.ru',
    id: '152-fz',
    kind: 'law',
    title: 'Федеральный закон от 27.07.2006 № 152-ФЗ «О персональных данных»',
    docHash: '98490812b3409e2a8d78a11ca9010f434ea3d9250a11dbbdb78690cd5551bdd6',
  },
  {
    provider: 'actual.pravo.gov.ru',
    id: 'koap',
    kind: 'code',
    title: 'Кодекс Российской Федерации об административных правонарушениях от 30.12.2001 № 195-ФЗ',
    docHash: '6639c6c6580e8aa0bdf84170d25823669dfb6a4144b03da245ef4889f24765c0',
    onlyArticles: ['13.11'],
  },
  {
    provider: 'actual.pravo.gov.ru',
    id: 'pp-687',
    kind: 'decree',
    title:
      'Положение об особенностях обработки персональных данных, осуществляемой без использования средств автоматизации (утв. постановлением Правительства РФ от 15.09.2008 № 687)',
    docHash: '769a08b912ce64ea4a3bb70a97b6fc95617e9de77f0865edb76ee9928406a9cd',
    decree: {
      start: /^ПОЛОЖЕНИЕ/,
      itemHeading: (item) =>
        `Положение об обработке ПДн без средств автоматизации (ПП РФ № 687), пункт ${item}`,
    },
  },
  {
    // Нет на pravo.gov.ru: не менялось после 2022 г. (actual.pravo.gov.ru), а в 2012 г. постановления
    // Правительства на publication.pravo.gov.ru не публиковались. Текст — с официального сайта
    // Правительства (ADR-0014), реквизиты печатной публикации — ниже.
    provider: 'government.ru',
    id: 'pp-1119',
    kind: 'decree',
    title:
      'Требования к защите персональных данных при их обработке в информационных системах персональных данных (утв. постановлением Правительства РФ от 01.11.2012 № 1119)',
    documentId: '84743',
    editionDate: '2012-11-01',
    officialPublication:
      '«Российская газета», 07.11.2012, № 256; Собрание законодательства РФ, 05.11.2012, № 45, ст. 6257',
    decree: {
      start: /^ТРЕБОВАНИЯ/,
      itemHeading: (item) => `Требования к защите ПДн в ИСПДн (ПП РФ № 1119), пункт ${item}`,
    },
  },
];

const actualPravo = createActualPravoClient();
const consultant = createConsultantClient();
const government = createGovernmentClient();
const today = new Date().toISOString().slice(0, 10);
const say = (line: string) => process.stdout.write(`${line}\n`);

interface Loaded {
  readonly paragraphs: readonly OfficialParagraph[];
  readonly editionDate: string;
  readonly caption: string;
  readonly source: ActMeta['source'];
}

async function loadOfficial(act: OfficialAct): Promise<Loaded> {
  const redactions = await actualPravo.redactions(act.docHash);
  if (!redactions.ok) throw new Error(redactions.error.message);

  const current = currentRedaction(redactions.value);
  if (!current) throw new Error(`${act.id}: нет актуальной редакции`);

  const html = await actualPravo.redactionHtml(current.id);
  if (!html.ok) throw new Error(html.error.message);

  return {
    paragraphs: parseOfficialHtml(html.value),
    editionDate: current.date,
    caption: `редакция ${current.caption}`,
    source: {
      type: 'official',
      provider: 'actual.pravo.gov.ru',
      docHash: act.docHash,
      redactionId: current.id,
      url: officialDocumentUrl(act.docHash),
    },
  };
}

async function loadGovernment(act: GovernmentAct): Promise<Loaded> {
  const html = await government.documentHtml(act.documentId);
  if (!html.ok) throw new Error(html.error.message);

  return {
    paragraphs: parseGovernmentHtml(html.value),
    editionDate: act.editionDate,
    caption: `официальный сайт Правительства РФ, редакция от ${act.editionDate}`,
    source: {
      type: 'official',
      provider: 'government.ru',
      documentId: act.documentId,
      url: governmentDocumentUrl(act.documentId),
      officialPublication: act.officialPublication,
    },
  };
}

async function loadSecondary(act: SecondaryAct): Promise<Loaded> {
  const html = await consultant.documentHtml(act.documentId, act.section);
  if (!html.ok) throw new Error(html.error.message);

  return {
    paragraphs: parseConsultantHtml(html.value),
    editionDate: act.editionDate,
    caption: `вторичный источник КонсультантПлюс, редакция от ${act.editionDate}`,
    source: {
      type: 'secondary',
      provider: 'consultant.ru',
      documentId: act.documentId,
      url: consultantDocumentUrl(act.documentId, act.section),
      officialPublication: act.officialPublication,
    },
  };
}

async function importAct(act: OfficialAct | GovernmentAct | SecondaryAct): Promise<void> {
  const loaded =
    act.provider === 'consultant.ru'
      ? await loadSecondary(act)
      : act.provider === 'government.ru'
        ? await loadGovernment(act)
        : await loadOfficial(act);

  const units: ExtractedUnit[] = act.decree
    ? extractDecreeItems(loaded.paragraphs, act.decree.start)
    : extractArticles(
        loaded.paragraphs,
        act.provider === 'actual.pravo.gov.ru' ? act.onlyArticles : undefined,
      );
  if (units.length === 0) throw new Error(`${act.id}: в тексте не найдено ни одной нормы`);

  const meta: ActMeta = {
    id: act.id,
    title: act.title,
    kind: act.kind,
    editionDate: loaded.editionDate,
    retrievedAt: today,
    source: loaded.source,
  };

  const dir = join(DATA_DIR, act.id);
  await mkdir(dir, { recursive: true });
  // Старые файлы норм удаляются: статья, исключённая из закона, не должна остаться в базе.
  for (const stale of (await readdir(dir)).filter((name) => /\.(?:txt|md)$/.test(name))) {
    await rm(join(dir, stale));
  }
  await writeFile(join(dir, 'act.json'), `${JSON.stringify(meta, null, 2)}\n`);

  const unitKind = act.decree ? 'item' : 'art';
  for (const unit of units) {
    const frontmatter = {
      id: `${act.id}/${unitKind}-${unit.number}`,
      act: act.id,
      heading: act.decree ? act.decree.itemHeading(unit.number) : unit.heading,
      editionDate: loaded.editionDate,
      sourceType: loaded.source.type,
      sourceUrl: loaded.source.url,
      ...('officialPublication' in loaded.source && {
        officialPublication: loaded.source.officialPublication,
      }),
      verifiedAt: today,
      sha256: sha256(unit.text),
      ...(unit.notes.length > 0 && { notes: unit.notes }),
    };
    await writeFile(
      join(dir, `${unitKind}-${unit.number}${NORM_FILE_EXTENSION}`),
      serializeNormFile(frontmatter, unit.text),
    );
  }

  say(`✔ ${act.id}: ${String(units.length)} норм, ${loaded.caption}`);
}

const selected = process.argv.slice(2);
const acts = selected.length > 0 ? ACTS.filter((act) => selected.includes(act.id)) : ACTS;
if (acts.length === 0) throw new Error(`Неизвестные акты: ${selected.join(', ')}`);

for (const act of acts) await importAct(act);

const knowledgeBase = buildKnowledgeBase(await readKnowledgeFiles());
if (!knowledgeBase.ok) {
  for (const issue of knowledgeBase.error.issues) say(`✖ ${issue.path}: ${issue.message}`);
  process.exitCode = 1;
} else {
  say(`База ${knowledgeBase.value.kbVersion}: ${String(knowledgeBase.value.norms.length)} норм`);
}
