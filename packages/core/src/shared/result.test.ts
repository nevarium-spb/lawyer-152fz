import { describe, expect, it } from 'vitest';

import { err, ok } from './result';
import type { Result } from './result';

describe('Result', () => {
  it('ok несёт значение', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('err несёт ошибку', () => {
    expect(err('сбой')).toEqual({ ok: false, error: 'сбой' });
  });

  it('сужает тип по полю ok', () => {
    const divide = (a: number, b: number): Result<number, string> =>
      b === 0 ? err('деление на ноль') : ok(a / b);

    const good = divide(6, 3);
    const bad = divide(1, 0);

    expect(good.ok && good.value).toBe(2);
    expect(!bad.ok && bad.error).toBe('деление на ноль');
  });
});
