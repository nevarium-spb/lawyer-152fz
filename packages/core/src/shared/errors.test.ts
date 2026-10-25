import { describe, expect, it } from 'vitest';

import { forbidden, notFound, sourceUnavailable, validationError } from './errors';

describe('доменные ошибки', () => {
  it('validationError хранит список проблем по полям', () => {
    const error = validationError('Профиль заполнен не полностью', [
      { path: 'inn', message: 'ИНН некорректен' },
    ]);
    expect(error).toEqual({
      kind: 'validation',
      message: 'Профиль заполнен не полностью',
      issues: [{ path: 'inn', message: 'ИНН некорректен' }],
    });
  });

  it('validationError без списка проблем — пустой список', () => {
    expect(validationError('Ошибка').issues).toEqual([]);
  });

  it('notFound формирует сообщение для нормы и для шаблона', () => {
    expect(notFound('norm', '152-fz/art-99')).toMatchObject({
      kind: 'not-found',
      entity: 'norm',
      id: '152-fz/art-99',
      message: 'Норма «152-fz/art-99» не найдена в базе',
    });
    expect(notFound('template', 'policy-x').message).toBe('Шаблон «policy-x» не найден');
  });

  it('sourceUnavailable указывает источник и причину', () => {
    expect(sourceUnavailable('https://example.ru', 'таймаут 10 с')).toEqual({
      kind: 'source-unavailable',
      source: 'https://example.ru',
      message: 'Источник https://example.ru недоступен: таймаут 10 с',
    });
  });

  it('forbidden объясняет причину отказа', () => {
    expect(forbidden('частные сети запрещены политикой')).toEqual({
      kind: 'forbidden',
      reason: 'частные сети запрещены политикой',
      message: 'Действие запрещено: частные сети запрещены политикой',
    });
  });
});
