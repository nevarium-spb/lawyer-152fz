import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseWith } from './validation';

const schema = z.object({
  name: z.string({ error: 'Укажите имя' }).min(1, 'Укажите имя'),
  age: z.number().int().optional(),
  tags: z.array(z.string()).default([]),
});

describe('parseWith', () => {
  it('возвращает разобранные данные с применёнными значениями по умолчанию', () => {
    expect(parseWith(schema, { name: 'Анна' }, 'Ошибка')).toEqual({
      ok: true,
      value: { name: 'Анна', tags: [] },
    });
  });

  it('собирает все проблемы за один вызов, с путями полей', () => {
    const result = parseWith(schema, { age: 1.5 }, 'Данные некорректны');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.kind).toBe('validation');
    expect(result.error.message).toBe('Данные некорректны');
    expect(result.error.issues.map((i) => i.path)).toEqual(['name', 'age']);
  });

  it('собственное сообщение поля важнее стандартного', () => {
    const result = parseWith(schema, {}, 'Ошибка');
    expect(!result.ok && result.error.issues[0]?.message).toBe('Укажите имя');
  });

  it('стандартные сообщения — на русском, без глобальной настройки zod', () => {
    const result = parseWith(schema, { name: 'Анна', age: 'много' }, 'Ошибка');
    const message = !result.ok ? (result.error.issues[0]?.message ?? '') : '';
    expect(message).toMatch(/[а-яё]/i);
    expect(z.number().safeParse('x').error?.issues[0]?.message).toMatch(/^Invalid input/);
  });

  it('вложенный путь записывается через точку', () => {
    const nested = z.object({ person: z.object({ email: z.email('Некорректный e-mail') }) });
    const result = parseWith(nested, { person: { email: 'нет' } }, 'Ошибка');
    expect(!result.ok && result.error.issues[0]).toEqual({
      path: 'person.email',
      message: 'Некорректный e-mail',
    });
  });
});
