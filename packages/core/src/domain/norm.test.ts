import { describe, expect, it } from 'vitest';

import { parseWith } from '../shared/validation';
import { normSchema } from './norm';

const valid = {
  id: '152-fz/art-9/part-1',
  act: '152-fz',
  heading: '  Статья 9 (тестовая)  ',
  text: '  Текст нормы для тестов.\n',
  editionDate: '2025-01-01',
  sourceUrl: 'https://example.org/norm',
  verifiedAt: '2026-10-24',
  sha256: 'a'.repeat(64),
};

const issuesOf = (input: unknown) => {
  const result = parseWith(normSchema, input, 'Норма некорректна');
  return result.ok ? [] : result.error.issues;
};

describe('схема нормы', () => {
  it('принимает корректную норму; заголовок обрезается, текст — нет', () => {
    const result = parseWith(normSchema, valid, 'Норма некорректна');
    expect(result.ok && result.value.heading).toBe('Статья 9 (тестовая)');
    expect(result.ok && result.value.text).toBe(valid.text);
  });

  it('требует https для официального источника', () => {
    expect(issuesOf({ ...valid, sourceUrl: 'http://example.org/norm' })).toContainEqual({
      path: 'sourceUrl',
      message: 'Официальный источник — https-ссылка',
    });
  });

  it('проверяет формат дат и хеша', () => {
    const paths = issuesOf({ ...valid, editionDate: '01.01.2025', sha256: 'XYZ' }).map(
      (i) => i.path,
    );
    expect(paths).toEqual(['editionDate', 'sha256']);
  });

  it('отвергает пустой текст', () => {
    expect(issuesOf({ ...valid, text: '   ' })).toContainEqual({
      path: 'text',
      message: 'Текст нормы пуст',
    });
  });

  it('акт в идентификаторе должен совпадать с полем act', () => {
    expect(issuesOf({ ...valid, act: 'koap' })).toContainEqual({
      path: 'act',
      message: 'Акт в идентификаторе нормы не совпадает с полем act',
    });
  });

  it('дата сверки не раньше даты редакции', () => {
    expect(issuesOf({ ...valid, verifiedAt: '2024-12-31' })).toContainEqual({
      path: 'verifiedAt',
      message: 'Дата сверки не может быть раньше даты редакции',
    });
  });
});
