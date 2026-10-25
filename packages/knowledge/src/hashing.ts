import { createHash } from 'node:crypto';

/** Переводы строк приводятся к LF: хеш нормы одинаков на Windows и Linux (T0.2). */
export const normalizeLineEndings = (text: string): string => text.replace(/\r\n?/g, '\n');

/** sha256 текста нормы в шестнадцатеричном виде. */
export function sha256(text: string): string {
  return createHash('sha256').update(normalizeLineEndings(text), 'utf8').digest('hex');
}
