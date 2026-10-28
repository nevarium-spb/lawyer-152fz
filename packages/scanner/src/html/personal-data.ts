import type { PersonalDataKind } from '@lawyer-152fz/core';

/** Типы полей, которые не собирают ПДн сами по себе. */
const NOT_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'checkbox',
  'radio',
  'search',
  'range',
  'color',
  'file',
  'password',
]);

const BY_AUTOCOMPLETE: readonly (readonly [RegExp, PersonalDataKind])[] = [
  [/\b(?:name|given-name|family-name|additional-name|nickname)\b/, 'name'],
  [/\bemail\b/, 'email'],
  [/\btel(?:-national|-local)?\b/, 'phone'],
  [/\b(?:street-address|address-line\d|address-level\d|postal-code)\b/, 'address'],
  [/\bbday(?:-day|-month|-year)?\b/, 'birthdate'],
];

/** Целое русское слово: `\b` в JS не видит границ кириллических слов. */
const ru = (word: string) => `(?<![а-яё])${word}(?![а-яё])`;

/** Порядок важен: «адрес электронной почты» — это e-mail, а не адрес. */
const BY_TEXT: readonly (readonly [RegExp, PersonalDataKind])[] = [
  [/\be-?mail\b|почт/, 'email'],
  [/\b(?:tel|phone|mobile)\b|телефон|мобильн/, 'phone'],
  [new RegExp(`\\b(?:passport|snils|inn)\\b|паспорт|снилс|${ru('инн')}`), 'document'],
  [/\b(?:birth|bday|dob)\b|рожден/, 'birthdate'],
  [/\b(?:address|street|city)\b|адрес|улиц|город/, 'address'],
  [
    new RegExp(
      `\\b(?:name|fio|fullname|firstname|lastname|surname|patronymic)\\b|${ru('имя')}|${ru('фио')}|фамили|отчеств`,
    ),
    'name',
  ],
];

/** «Название компании», «тема сообщения» — не персональные данные, хотя в них есть слово «name». */
const NOT_PERSONAL = new RegExp(
  `compan|organi[sz]|организац|компани|назван|\\btitle\\b|subject|${ru('тема')}|промокод|coupon`,
);

export interface FieldDescription {
  readonly type: string;
  readonly autocomplete?: string | undefined;
  /** name, id, placeholder, aria-label, текст label — всё, что описывает поле. */
  readonly hints: readonly string[];
}

/** `your_name`, `userPhone[]` → слова через пробел, иначе `\b` их не разделит. */
const normalizeHints = (hints: readonly string[]): string =>
  hints
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_\-[\].:]+/g, ' ');

/** Вид персональных данных, которые собирает поле, или `undefined`. */
export function personalDataKind(field: FieldDescription): PersonalDataKind | undefined {
  const type = field.type.toLowerCase();
  if (NOT_INPUT_TYPES.has(type)) return undefined;
  if (type === 'email') return 'email';
  if (type === 'tel') return 'phone';

  const autocomplete = field.autocomplete?.toLowerCase() ?? '';
  const byAutocomplete = BY_AUTOCOMPLETE.find(([pattern]) => pattern.test(autocomplete));
  if (byAutocomplete) return byAutocomplete[1];

  const text = normalizeHints(field.hints);
  if (NOT_PERSONAL.test(text)) return undefined;
  return BY_TEXT.find(([pattern]) => pattern.test(text))?.[1];
}
