import type { Norm } from '@lawyer-152fz/core';

/** Через сколько дней после сверки норма считается устаревшей и требует повторного импорта. */
export const MAX_VERIFICATION_AGE_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StaleNorm {
  readonly id: string;
  readonly verifiedAt: string;
  readonly ageDays: number;
}

/**
 * Нормы, сверенные с источником слишком давно. Закон меняется:
 * старая сверка — риск сослаться на утратившую силу редакцию (риск R6).
 */
export function findStaleNorms(
  norms: readonly { readonly id: string; readonly verifiedAt: Norm['verifiedAt'] }[],
  today: Date,
  maxAgeDays: number = MAX_VERIFICATION_AGE_DAYS,
): StaleNorm[] {
  return norms
    .map(({ id, verifiedAt }) => ({
      id,
      verifiedAt,
      ageDays: Math.floor((today.getTime() - Date.parse(verifiedAt)) / DAY_MS),
    }))
    .filter(({ ageDays }) => ageDays > maxAgeDays);
}
