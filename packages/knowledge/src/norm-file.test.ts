import { describe, expect, it } from 'vitest';

import { parseNormFile, serializeNormFile } from './norm-file';

const data = { id: '152-fz/art-9', heading: 'Статья 9 (тестовая)', notes: ['(В редакции …)'] };
const text = '1. Первая часть.\n\n2. Вторая часть:\n\n1) пункт.';

describe('файл нормы', () => {
  it('сериализация и разбор взаимно обратны', () => {
    expect(parseNormFile(serializeNormFile(data, text))).toEqual({ data, text });
  });

  it('понимает CRLF (файл, сохранённый на Windows)', () => {
    const crlf = serializeNormFile(data, text).replace(/\n/g, '\r\n');
    expect(parseNormFile(crlf)?.text).toBe(text);
  });

  it.each([
    ['без заголовка', 'Просто текст'],
    ['незакрытый заголовок', '---\nid: x\nтекст'],
  ])('%s → undefined', (_case, content) => {
    expect(parseNormFile(content)).toBeUndefined();
  });
});
