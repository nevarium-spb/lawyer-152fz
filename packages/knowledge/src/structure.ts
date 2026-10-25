/** Абзац, открывающий часть: «1. …», «1.1. …». Пункты «1) …» и подпункты «а) …» частью не считаются. */
const NUMBERED_PARAGRAPH = /^(\d+(?:\.\d+)*)\.\s/;

/** «Примечание.» / «Примечания:» — со своей нумерацией 1, 2, …, которая не продолжает части. */
// Без \b: в JavaScript граница слова работает только для латиницы.
const NOTES_SECTION = /^Примечани[ея][.:\s]/;

export const PARAGRAPH_SEPARATOR = '\n\n';

export interface NumberedChild {
  readonly number: string;
  readonly text: string;
}

/**
 * Делит текст статьи на части по нумерованным абзацам.
 * Абзацы до первой части остаются только в статье; статья без частей даёт пустой список.
 * Примечания к статье (КоАП) частями не являются: с них нарезка заканчивается,
 * а сами примечания остаются в полном тексте статьи.
 */
export function splitNumbered(text: string): NumberedChild[] {
  const children: { number: string; paragraphs: string[] }[] = [];

  for (const paragraph of text.split(PARAGRAPH_SEPARATOR)) {
    if (NOTES_SECTION.test(paragraph)) break;
    const number = NUMBERED_PARAGRAPH.exec(paragraph)?.[1];
    if (number !== undefined) children.push({ number, paragraphs: [paragraph] });
    else children.at(-1)?.paragraphs.push(paragraph);
  }

  return children.map(({ number, paragraphs }) => ({
    number,
    text: paragraphs.join(PARAGRAPH_SEPARATOR),
  }));
}

const compareNumbers = (a: string, b: string): number => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

/**
 * Номера частей должны строго возрастать (1, 1.1, 2, …). Нарушение порядка
 * почти всегда означает ошибку разбора — например, нумерованный абзац внутри части.
 */
export function findNumberingProblem(children: readonly NumberedChild[]): string | undefined {
  for (let i = 1; i < children.length; i += 1) {
    const previous = children[i - 1];
    const current = children[i];
    if (previous && current && compareNumbers(previous.number, current.number) >= 0) {
      return `нарушен порядок нумерации: ${previous.number} → ${current.number}`;
    }
  }
  return undefined;
}
