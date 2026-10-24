/**
 * Проверка реквизитов по контрольным суммам: опечатка в ИНН или ОГРН
 * не должна попасть в уведомление для Роскомнадзора.
 */

const DIGITS_ONLY = /^\d+$/;

const INN10_WEIGHTS = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_WEIGHTS_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_WEIGHTS_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function innCheckDigit(digits: readonly number[], weights: readonly number[]): number {
  const sum = weights.reduce((acc, weight, index) => acc + weight * (digits[index] ?? 0), 0);
  return (sum % 11) % 10;
}

/** ИНН юрлица (10 цифр) или физлица/ИП (12 цифр). */
export function isValidInn(value: string): boolean {
  if (!DIGITS_ONLY.test(value)) return false;
  const digits = Array.from(value, Number);

  if (digits.length === 10) return innCheckDigit(digits, INN10_WEIGHTS) === digits[9];
  if (digits.length === 12) {
    return (
      innCheckDigit(digits, INN12_WEIGHTS_11) === digits[10] &&
      innCheckDigit(digits, INN12_WEIGHTS_12) === digits[11]
    );
  }
  return false;
}

/** Остаток от деления длинного числа-строки без потери точности. */
function remainder(digits: string, divisor: number): number {
  let acc = 0;
  for (const ch of digits) acc = (acc * 10 + Number(ch)) % divisor;
  return acc;
}

/** ОГРН юрлица (13 цифр) или ОГРНИП (15 цифр). */
export function isValidOgrn(value: string): boolean {
  if (!DIGITS_ONLY.test(value)) return false;

  if (value.length === 13) return remainder(value.slice(0, 12), 11) % 10 === Number(value[12]);
  if (value.length === 15) return remainder(value.slice(0, 14), 13) % 10 === Number(value[14]);
  return false;
}
