import type { SpecialCategoryKind } from './snapshots';

const ru = (word: string) => `(?<![а-яё])${word}(?![а-яё])`;

/**
 * Слова, по которым текст указывает на специальные категории (ч. 1 ст. 10) и биометрию (ч. 1 ст. 11).
 * Слов намеренно немного: «жалоба», «национальность» в значении гражданства и подобные дают ложные срабатывания,
 * а находка всё равно помечается как требующая проверки.
 */
const SPECIAL_BY_TEXT: readonly (readonly [RegExp, SpecialCategoryKind])[] = [
  [
    new RegExp(
      `здоровь|диагноз|заболеван|болезн|симптом|беременн|инвалид|аллерг|анамнез|\\b(?:health|diagnos\\w*|symptoms?|disease|illness|pregnan\\w*|disabilit\\w*|allerg\\w*)\\b`,
    ),
    'health',
  ],
  [
    new RegExp(`${ru('национальность')}|этническ|${ru('раса')}|расов|\\b(?:ethnicity|race)\\b`),
    'race-nationality',
  ],
  [/политическ|\bpolitical\b/, 'political'],
  [/вероисповед|религи|мировоззрен|\breligio\w*/, 'religion-philosophy'],
  [/интимн|сексуальн|ориентаци|\bsexual\b/, 'intimate'],
  [/биометр|отпечат|\bbiometric\w*|\bfingerprint\b|\bface[\s-]?id\b/, 'biometric'],
];

/** Специальная категория или биометрия, на которую указывают слова текста, либо `undefined`. Это признак, а не факт. */
export function specialCategoryInText(text: string): SpecialCategoryKind | undefined {
  const normalized = text.toLowerCase();
  return SPECIAL_BY_TEXT.find(([pattern]) => pattern.test(normalized))?.[1];
}
