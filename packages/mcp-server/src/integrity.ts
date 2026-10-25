import type { NormId } from '@lawyer-152fz/core';

export interface NormReferencing {
  readonly id: string;
  readonly normRefs: readonly NormId[];
}

/**
 * Ссылочная целостность (T3.3): каждая норма, на которую ссылаются правила аудита и шаблоны,
 * должна существовать в базе. Проверка живёт в точке сборки, чтобы rules и documents
 * не зависели от knowledge (ADR-0002).
 */
export function findMissingNormRefs(
  items: readonly NormReferencing[],
  existing: ReadonlySet<string>,
): string[] {
  return items.flatMap((item) =>
    item.normRefs.filter((ref) => !existing.has(ref)).map((ref) => `${item.id} → ${ref}`),
  );
}
