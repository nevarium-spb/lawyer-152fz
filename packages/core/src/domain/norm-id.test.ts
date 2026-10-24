import { describe, expect, it } from 'vitest';

import { formatNormId, normId, normIdSchema, parseNormId, parseNormRef } from './norm-id';

describe('идентификатор нормы', () => {
  it.each([
    ['152-fz/art-9', { act: '152-fz', article: '9' }],
    ['152-fz/art-18/part-5', { act: '152-fz', article: '18', part: 5 }],
    ['152-fz/art-18.1', { act: '152-fz', article: '18.1' }],
    ['koap/art-13.11/part-1', { act: 'koap', article: '13.11', part: 1 }],
    ['152-fz/art-6/part-1/item-5', { act: '152-fz', article: '6', part: 1, item: '5' }],
    ['pp-1119/item-13', { act: 'pp-1119', item: '13' }],
  ])('разбирает %s', (raw, expected) => {
    expect(parseNormRef(raw)).toEqual({ ok: true, value: expected });
  });

  it.each([
    '152/18',
    '152-fz',
    '152-FZ/art-18',
    '152-fz/part-1',
    '152-fz/art-018',
    '152-fz/art-18/part-0',
    '152-fz/art-18/',
    ' 152-fz/art-18',
    '',
  ])('отвергает «%s» с подсказкой формата', (raw) => {
    const result = parseNormId(raw);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('например 152-fz/art-18/part-5');
  });

  it('formatNormId и parseNormRef — взаимно обратные', () => {
    for (const raw of ['152-fz/art-18/part-5', 'pp-1119/item-13', '152-fz/art-6/part-1/item-5']) {
      const ref = parseNormRef(raw);
      expect(ref.ok && formatNormId(ref.value)).toBe(raw);
    }
  });

  it('normId бросает исключение на неверном литерале (ошибка программиста)', () => {
    expect(normId('152-fz/art-9')).toBe('152-fz/art-9');
    expect(() => normId('152/9')).toThrow('Неверный идентификатор нормы «152/9»');
    expect(() => formatNormId({ act: 'Bad Act', article: '1' })).toThrow();
  });

  it('схема zod сообщает исходное значение', () => {
    const parsed = normIdSchema.safeParse('ст. 18');
    expect(parsed.error?.issues[0]?.message).toContain('«ст. 18»');
  });
});
