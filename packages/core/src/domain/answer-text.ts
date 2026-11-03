/**
 * Разбор текста ответа юриста для машинной сверки: идентификаторы норм, ссылки словами,
 * цитаты, метки уверенности. Чистые функции без I/O. Разбор эвристический: он ищет то, что
 * можно проверить по базе, и не оценивает правильность толкования.
 */

export const ANSWER_LABELS = ['в норме', 'вывод', 'спорно', 'вне базы'] as const;
export type AnswerLabel = (typeof ANSWER_LABELS)[number];

const LABEL_SOURCE = '\\[(в норме|вывод|спорно|вне базы)\\]';
const MASK = { '.': '', '!': '', '?': '', ';': '' } as const;
const UNMASK = new Map<string, string>(Object.entries(MASK).map(([plain, mask]) => [mask, plain]));

const ID_PATTERN =
  /(?<![\w/.-])(\d+-fz|koap|pp-\d+)\/((?:art|item)-\d+(?:\.\d+)*(?:\/(?:part|item)-\d+(?:\.\d+)*)*)/g;

const ACT_BY_NAME: ReadonlyMap<string, string> = new Map([
  ['152фз', '152-fz'],
  ['коап', 'koap'],
]);

const PROSE_REF_PATTERN =
  /(?<![\p{L}])(?:ч\.\s*(\d+(?:\.\d+)*)\s*)?ст\.\s*(\d+(?:\.\d+)*)\s*(152[-‑–]?ФЗ|КоАП)/giu;

const ABBREVIATION_PATTERN = /(?<![\p{L}])(ст|ч|п|пп|абз|подп|руб|тыс|млн|млрд|г|гг|см)\./giu;

/** Идентификаторы норм в тексте, в порядке появления, без повторов. */
export function extractNormIds(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(ID_PATTERN)) found.add(`${match[1] ?? ''}/${match[2] ?? ''}`);
  return [...found];
}

export interface ProseRef {
  /** Ссылка как в тексте: «ч. 5 ст. 18 152-ФЗ». */
  readonly text: string;
  /** Идентификатор статьи или части, который она обозначает. */
  readonly id: string;
}

/** Ссылки словами вида «ч. 5 ст. 18 152-ФЗ» и «ст. 13.11 КоАП»: пункты внутри части не разбираются. */
export function extractProseRefs(text: string): ProseRef[] {
  const refs: ProseRef[] = [];
  for (const match of text.matchAll(PROSE_REF_PATTERN)) {
    const [whole, part, article, actName] = match;
    const act = ACT_BY_NAME.get((actName ?? '').toLowerCase().replace(/[-‑–]/gu, ''));
    if (act === undefined || article === undefined) continue;
    refs.push({
      text: whole,
      id: `${act}/art-${article}${part === undefined ? '' : `/part-${part}`}`,
    });
  }
  return refs;
}

export function extractLabels(text: string): AnswerLabel[] {
  return [...text.matchAll(new RegExp(LABEL_SOURCE, 'giu'))].map(
    (match) => (match[1] ?? '').toLowerCase() as AnswerLabel,
  );
}

export function stripLabels(text: string): string {
  return text.replace(new RegExp(LABEL_SOURCE, 'giu'), '');
}

/** Приведение к виду для сравнения: регистр, ё, пунктуация, пробелы не влияют; слова и цифры — да. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function containsText(haystack: string, needle: string): boolean {
  const target = normalizeForMatch(needle);
  return target !== '' && ` ${normalizeForMatch(haystack)} `.includes(` ${target} `);
}

export interface QuoteFragment {
  readonly text: string;
  readonly line: number;
}

const MIN_QUOTE_WORDS = 4;
/** Ссылка вроде «ч. 4 ст. 13.11 КоАП» в «ёлочках» цитатой не считается: в ней почти нет слов. */
const MIN_LONG_QUOTE_WORDS = 3;

/**
 * Цитаты в «ёлочках». Многоточие делит цитату на фрагменты, каждый проверяется отдельно.
 * Фрагменты короче четырёх слов («утечка», «оператор») цитатами не считаются.
 */
export function extractQuotes(lines: readonly string[]): QuoteFragment[] {
  const quotes: QuoteFragment[] = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/«([^«»]+)»/gu)) {
      for (const fragment of (match[1] ?? '').split(/…|\.{3}|\[\s*…\s*\]/u)) {
        const words = normalizeForMatch(fragment).split(' ').filter(Boolean);
        const longWords = words.filter((word) => word.length >= 3);
        if (words.length >= MIN_QUOTE_WORDS && longWords.length >= MIN_LONG_QUOTE_WORDS) {
          quotes.push({ text: fragment.trim(), line: index });
        }
      }
    }
  });
  return quotes;
}

/** Убирает разметку Markdown, которая мешает разбору: заголовки, маркеры списков, выделение, обратные кавычки. */
export function stripMarkdown(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|>+\s*|[-*+]\s+|\d+[.)]\s+)/u, '')
    .replace(/\*\*|__|`/gu, '')
    .replace(/^\s*_|_\s*$/gu, '')
    .trim();
}

function maskQuotedPunctuation(text: string): string {
  return text.replace(/«[^«»]*»/gu, (quoted) =>
    quoted.replace(/[.!?;]/gu, (char) => MASK[char as keyof typeof MASK]),
  );
}

function unmask(text: string): string {
  return text.replace(/[-]/gu, (char) => UNMASK.get(char) ?? char);
}

const LEADING_LABELS = new RegExp(`^(?:\\s*${LABEL_SOURCE})+\\.?`, 'iu');

/**
 * Делит строку на предложения. Точки в сокращениях («ст.», «ч.») и внутри «ёлочек» не разделяют.
 * Метка, стоящая после точки («… (`id`). [в норме] Дальше …»), относится к предыдущему предложению.
 * Строка, начинающаяся с метки, — одно утверждение целиком.
 */
export function splitStatements(line: string): string[] {
  const text = line.trim();
  if (text === '') return [];
  if (new RegExp(`^${LABEL_SOURCE}`, 'iu').test(text)) return [text];

  const protectedText = maskQuotedPunctuation(text).replace(
    ABBREVIATION_PATTERN,
    (_, abbreviation: string) => `${abbreviation}${MASK['.']}`,
  );
  const sentences: string[] = [];
  for (const chunk of protectedText.split(/(?<=[.!?])\s+/u)) {
    const sentence = unmask(chunk).trim();
    if (sentence === '') continue;
    const previous = sentences.length - 1;
    const leading = LEADING_LABELS.exec(sentence);
    if (leading && previous >= 0) {
      sentences[previous] = `${sentences[previous] ?? ''} ${leading[0].trim()}`;
      const rest = sentence.slice(leading[0].length).trim();
      if (rest !== '') sentences.push(rest);
    } else {
      sentences.push(sentence);
    }
  }
  return sentences;
}
