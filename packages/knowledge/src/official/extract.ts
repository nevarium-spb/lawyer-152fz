import { PARAGRAPH_SEPARATOR } from '../structure';
import type { OfficialParagraph } from './official-html';

/** Статья закона или пункт постановления, извлечённые из официального текста. */
export interface ExtractedUnit {
  readonly number: string;
  /** Заголовок статьи («Статья 18. …»); у пунктов постановления пуст — его задаёт импорт. */
  readonly heading: string;
  readonly text: string;
  readonly notes: readonly string[];
}

const ARTICLE_HEADING = /^Статья (\d+(?:\.\d+)*)\./;
const ITEM_START = /^(\d+(?:\.\d+)*)\.\s/;
/** Подпись руководителя — конец текста акта. */
const SIGNATURE_CLASS = 'Y';
/** Пометка к статье целиком: «(Дополнение статьей …)», «(Наименование в редакции …)». */
const ARTICLE_NOTE_CLASS = 'P';
/** Заголовки разделов и глав внутри документа. */
const SECTION_CLASSES = new Set(['H', 'C']);

interface Draft {
  number: string;
  heading: string;
  paragraphs: string[];
  notes: string[];
}

const finish = ({ number, heading, paragraphs, notes }: Draft): ExtractedUnit => ({
  number,
  heading,
  // У утратившей силу статьи текста нет — остаётся пометка «(Утратила силу …)».
  text: paragraphs.length > 0 ? paragraphs.join(PARAGRAPH_SEPARATOR) : notes.join(' '),
  notes,
});

/** Статьи закона или кодекса; `only` — номера нужных статей (например, `['13.11']`). */
export function extractArticles(
  paragraphs: readonly OfficialParagraph[],
  only?: readonly string[],
): ExtractedUnit[] {
  const drafts: Draft[] = [];
  let current: Draft | undefined;

  for (const paragraph of paragraphs) {
    if (paragraph.cls === SIGNATURE_CLASS) break;
    if (paragraph.cls === ARTICLE_NOTE_CLASS) {
      current?.notes.push(paragraph.text, ...paragraph.notes);
      continue;
    }

    const number = paragraph.cls === 'H' ? ARTICLE_HEADING.exec(paragraph.text)?.[1] : undefined;
    if (number !== undefined) {
      current = { number, heading: paragraph.text, paragraphs: [], notes: [...paragraph.notes] };
      drafts.push(current);
      continue;
    }
    if (SECTION_CLASSES.has(paragraph.cls)) {
      current = undefined; // глава или раздел закрывает статью
      continue;
    }
    if (!current) continue;

    if (paragraph.text) current.paragraphs.push(paragraph.text);
    current.notes.push(...paragraph.notes);
  }

  return drafts.filter((draft) => !only || only.includes(draft.number)).map(finish);
}

/**
 * Пункты документа, утверждённого постановлением (Положение, Требования).
 * `start` — заголовок документа; пункты постановления до него не берутся.
 */
export function extractDecreeItems(
  paragraphs: readonly OfficialParagraph[],
  start: RegExp,
): ExtractedUnit[] {
  const drafts: Draft[] = [];
  let started = false;
  let current: Draft | undefined;

  for (const paragraph of paragraphs) {
    if (!started) {
      started = start.test(paragraph.text);
      continue;
    }
    if (paragraph.cls === SIGNATURE_CLASS || /^_{3,}$/.test(paragraph.text)) break;
    if (paragraph.cls === ARTICLE_NOTE_CLASS) {
      current?.notes.push(paragraph.text, ...paragraph.notes);
      continue;
    }
    if (SECTION_CLASSES.has(paragraph.cls)) continue;

    const number = ITEM_START.exec(paragraph.text)?.[1];
    if (number !== undefined) {
      current = { number, heading: '', paragraphs: [paragraph.text], notes: [...paragraph.notes] };
      drafts.push(current);
      continue;
    }
    if (!current) continue;

    if (paragraph.text) current.paragraphs.push(paragraph.text);
    current.notes.push(...paragraph.notes);
  }

  return drafts.map(finish);
}
