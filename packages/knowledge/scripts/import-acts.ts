/**
 * Импорт актов с официального портала actual.pravo.gov.ru в `data/` (ADR-0011).
 *
 *   pnpm kb:import            — все акты
 *   pnpm kb:import 152-fz     — один акт
 *
 * Скрипт перезаписывает файлы акта целиком: изменения закона видны в git diff
 * и проходят ревью в PR, как изменения кода (ADR-0003).
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
import { parseOfficialHtml } from '../src/official/official-html';

interface ActSource {
  readonly id: string;
  readonly kind: ActKind;
  readonly title: string;
  /** Идентификатор документа на actual.pravo.gov.ru. */
  readonly docHash: string;
  /** Для кодексов — только нужные статьи. */
  readonly onlyArticles?: readonly string[];
  /** Для постановлений — заголовок утверждённого документа и заголовок пункта. */
  readonly decree?: { readonly start: RegExp; readonly itemHeading: (item: string) => string };
}

const ACTS: readonly ActSource[] = [
  {
    id: '152-fz',
    kind: 'law',
    title: 'Федеральный закон от 27.07.2006 № 152-ФЗ «О персональных данных»',
    docHash: '98490812b3409e2a8d78a11ca9010f434ea3d9250a11dbbdb78690cd5551bdd6',
  },
  {
    id: 'koap',
    kind: 'code',
    title: 'Кодекс Российской Федерации об административных правонарушениях от 30.12.2001 № 195-ФЗ',
    docHash: '6639c6c6580e8aa0bdf84170d25823669dfb6a4144b03da245ef4889f24765c0',
    onlyArticles: ['13.11'],
  },
  {
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
];

const client = createActualPravoClient();
const today = new Date().toISOString().slice(0, 10);
const say = (line: string) => process.stdout.write(`${line}\n`);

async function importAct(act: ActSource): Promise<void> {
  const redactions = await client.redactions(act.docHash);
  if (!redactions.ok) throw new Error(redactions.error.message);

  const current = currentRedaction(redactions.value);
  if (!current) throw new Error(`${act.id}: нет актуальной редакции`);

  const html = await client.redactionHtml(current.id);
  if (!html.ok) throw new Error(html.error.message);

  const paragraphs = parseOfficialHtml(html.value);
  const units: ExtractedUnit[] = act.decree
    ? extractDecreeItems(paragraphs, act.decree.start)
    : extractArticles(paragraphs, act.onlyArticles);
  if (units.length === 0) throw new Error(`${act.id}: в тексте не найдено ни одной нормы`);

  const sourceUrl = officialDocumentUrl(act.docHash);
  const meta: ActMeta = {
    id: act.id,
    title: act.title,
    kind: act.kind,
    officialDocHash: act.docHash,
    redactionId: current.id,
    editionDate: current.date,
    sourceUrl,
    retrievedAt: today,
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
    const heading = act.decree ? act.decree.itemHeading(unit.number) : unit.heading;
    const frontmatter = {
      id: `${act.id}/${unitKind}-${unit.number}`,
      act: act.id,
      heading,
      editionDate: current.date,
      sourceUrl,
      verifiedAt: today,
      sha256: sha256(unit.text),
      ...(unit.notes.length > 0 && { notes: unit.notes }),
    };
    await writeFile(
      join(dir, `${unitKind}-${unit.number}${NORM_FILE_EXTENSION}`),
      serializeNormFile(frontmatter, unit.text),
    );
  }

  say(`✔ ${act.id}: ${String(units.length)} норм, редакция ${current.caption}`);
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
