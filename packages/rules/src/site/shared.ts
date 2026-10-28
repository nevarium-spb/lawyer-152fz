import { toExcerpt } from '@lawyer-152fz/core';
import type {
  Evidence,
  FormSnapshot,
  PageSnapshot,
  PersonalDataKind,
  SiteSnapshot,
} from '@lawyer-152fz/core';

/** Сколько страниц показывать в доказательствах одной находки. */
export const MAX_EVIDENCE = 5;

const PERSONAL_DATA_LABELS: Record<PersonalDataKind, string> = {
  name: 'имя',
  phone: 'телефон',
  email: 'e-mail',
  address: 'адрес',
  birthdate: 'дату рождения',
  document: 'данные документов',
};

export function personalDataOf(form: FormSnapshot): PersonalDataKind[] {
  const kinds = form.fields.flatMap((field) => (field.personalData ? [field.personalData] : []));
  return [...new Set(kinds)];
}

/** «имя, телефон и e-mail» */
export function describePersonalData(kinds: readonly PersonalDataKind[]): string {
  const labels = kinds.map((kind) => PERSONAL_DATA_LABELS[kind]);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} и ${labels.at(-1) ?? ''}`;
}

export interface PersonalDataForm {
  readonly page: PageSnapshot;
  readonly form: FormSnapshot;
  readonly kinds: readonly PersonalDataKind[];
}

/** Формы, которые собирают персональные данные, по всем страницам. */
export function formsWithPersonalData(snapshot: SiteSnapshot): PersonalDataForm[] {
  return snapshot.pages.flatMap((page) =>
    page.forms.flatMap((form) => {
      const kinds = personalDataOf(form);
      return kinds.length > 0 ? [{ page, form, kinds }] : [];
    }),
  );
}

export function pageEvidence(page: PageSnapshot, selector?: string, excerpt?: string): Evidence {
  return {
    type: 'page',
    url: page.url,
    ...(selector ? { selector } : {}),
    ...(excerpt ? { untrustedExcerpt: toExcerpt(excerpt) } : {}),
  };
}

/** Поля формы для доказательства: «Ваше имя (Name), Телефон (Phone)». */
export function fieldsExcerpt(form: FormSnapshot): string {
  return form.fields
    .filter((field) => field.personalData)
    .map((field) => (field.label ? `${field.label} (${field.name})` : field.name))
    .join(', ');
}

/** Непустой список: группа всегда содержит хотя бы один элемент. */
export type NonEmpty<T> = readonly [T, ...T[]];

/** Группы с сохранением порядка первого появления. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): NonEmpty<T>[] {
  const groups = new Map<string, [T, ...T[]]>();
  for (const item of items) {
    const id = key(item);
    const group = groups.get(id);
    if (group) group.push(item);
    else groups.set(id, [item]);
  }
  return [...groups.values()];
}

/** « — на 3 страницах», если проблема повторяется. */
export function onPages(count: number): string {
  return count > 1 ? ` — на ${String(count)} страницах` : '';
}

/** Одна и та же форма на разных страницах (например, в подвале) — одна находка. */
export function formKey({ form, kinds }: PersonalDataForm): string {
  return [form.selector, form.action, form.consent, kinds.join(',')].join('|');
}
