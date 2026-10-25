import { describe, expect, it } from 'vitest';

import { sha256 } from './hashing';
import { buildKnowledgeBase } from './knowledge-base';
import type { KnowledgeFile } from './knowledge-base';
import { serializeNormFile } from './norm-file';

const SOURCE = 'http://actual.pravo.gov.ru/content/content.html#hash=test';

const actFile = (id: string, kind: 'law' | 'decree' = 'law'): KnowledgeFile => ({
  path: `${id}/act.json`,
  content: JSON.stringify({
    id,
    title: `Тестовый акт ${id}`,
    kind,
    officialDocHash: 'a'.repeat(64),
    redactionId: 1,
    editionDate: '2026-07-26',
    sourceUrl: SOURCE,
    retrievedAt: '2026-10-25',
  }),
});

const normFile = (
  act: string,
  unit: string,
  text: string,
  overrides: Record<string, unknown> = {},
): KnowledgeFile => ({
  path: `${act}/${unit}.txt`,
  content: serializeNormFile(
    {
      id: `${act}/${unit}`,
      act,
      heading: `Тест ${unit}`,
      editionDate: '2026-07-26',
      sourceUrl: SOURCE,
      verifiedAt: '2026-10-25',
      sha256: sha256(text),
      ...overrides,
    },
    text,
  ),
});

const ARTICLE = '1. Первая часть.\n\n1.1. Дробная часть.\n\n2. Вторая часть:\n\n1) пункт.';

describe('buildKnowledgeBase', () => {
  it('собирает статью и выводит её части с собственными id, заголовками и хешами', () => {
    const result = buildKnowledgeBase([
      actFile('test-law'),
      normFile('test-law', 'art-9', ARTICLE),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.norms.map((n) => n.id)).toEqual([
      'test-law/art-9',
      'test-law/art-9/part-1',
      'test-law/art-9/part-1.1',
      'test-law/art-9/part-2',
    ]);
    const part2 = result.value.norms[3];
    expect(part2?.heading).toBe('Тест art-9, часть 2');
    expect(part2?.text).toBe('2. Вторая часть:\n\n1) пункт.');
    expect(part2?.sha256).toBe(sha256('2. Вторая часть:\n\n1) пункт.'));
    expect(result.value.kbVersion).toBe('kb-2026.10.25');
  });

  it('пункты постановления на части не делятся', () => {
    const result = buildKnowledgeBase([
      actFile('pp-1', 'decree'),
      normFile('pp-1', 'item-7', '7. Пункт:\n\nа) подпункт.'),
    ]);
    expect(result.ok && result.value.norms.map((n) => n.id)).toEqual(['pp-1/item-7']);
  });

  it('kbVersion — по самой поздней дате сверки', () => {
    const result = buildKnowledgeBase([
      actFile('test-law'),
      normFile('test-law', 'art-1', 'Текст.', { verifiedAt: '2026-10-20' }),
      normFile('test-law', 'art-2', 'Текст.', { verifiedAt: '2026-10-27' }),
    ]);
    expect(result.ok && result.value.kbVersion).toBe('kb-2026.10.27');
  });

  it('собирает все проблемы за один проход, с путями файлов', () => {
    const result = buildKnowledgeBase([
      actFile('test-law'),
      normFile('test-law', 'art-1', 'Текст.', { sha256: 'b'.repeat(64) }),
      normFile('test-law', 'art-2', '2. Вторая.\n\n1. Первая.'),
      normFile('other', 'art-3', 'Текст.'),
      { path: 'test-law/art-4.txt', content: 'без заголовка' },
      { path: 'broken/act.json', content: '{не json' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'broken/act.json' }),
        {
          path: 'test-law/art-1.txt',
          message: 'sha256 не совпадает с текстом: файл изменён вручную или повреждён',
        },
        { path: 'test-law/art-2.txt', message: 'нарушен порядок нумерации: 2 → 1' },
        { path: 'other/art-3.txt', message: 'нет корректного act.json для акта «other»' },
        { path: 'test-law/art-4.txt', message: 'нет YAML-заголовка между строками ---' },
      ]),
    );
  });

  it('ловит несоответствие каталога и повтор идентификатора', () => {
    const moved = { ...normFile('test-law', 'art-1', 'Текст.'), path: 'misplaced/art-1.txt' };
    const result = buildKnowledgeBase([
      actFile('test-law'),
      { ...actFile('test-law'), path: 'wrong-dir/act.json' },
      normFile('test-law', 'art-1', 'Текст.'),
      { ...normFile('test-law', 'art-1', 'Текст.'), path: 'test-law/art-1-copy.txt' },
      moved,
    ]);
    expect(!result.ok && result.error.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        'id «test-law» не совпадает с каталогом',
        'повтор идентификатора нормы test-law/art-1',
        'акт «test-law» не совпадает с каталогом',
      ]),
    );
  });

  it('проверяет схему нормы и пустую базу', () => {
    const invalid = buildKnowledgeBase([
      actFile('test-law'),
      normFile('test-law', 'art-1', 'Текст.', { sourceUrl: 'https://www.consultant.ru/x' }),
    ]);
    expect(!invalid.ok && invalid.error.issues[0]?.message).toContain(
      'sourceUrl: Источник — ссылка на официальный портал',
    );
    expect(!buildKnowledgeBase([]).ok).toBe(true);
  });
});
