import { describe, expect, it } from 'vitest';

import type { SourceFreshnessChecker } from '../ports';
import {
  createInMemoryNormRepository,
  createStubFreshnessChecker,
  fixedClock,
} from '../testing/fakes';
import { makeNorm } from '../testing/fixtures';
import { createLookupNorms } from './lookup-norms';

const norms = [
  makeNorm(),
  makeNorm({
    id: '152-fz/art-18/part-5',
    heading: 'Статья 18 (тестовая)',
    text: 'Локализация баз.',
  }),
];

const setup = (freshness: SourceFreshnessChecker = createStubFreshnessChecker()) =>
  createLookupNorms({ norms: createInMemoryNormRepository(norms), freshness, clock: fixedClock() });

describe('LookupNorms.search', () => {
  it('ищет по базе и применяет лимит по умолчанию', async () => {
    const result = await setup().search({ text: 'локализация' });
    expect(result.ok && result.value.map((h) => h.id)).toEqual(['152-fz/art-18/part-5']);
  });

  it('отвергает слишком короткий запрос и неверный акт — по-русски', async () => {
    const result = await setup().search({ text: 'а', acts: ['КоАП'] });
    expect(!result.ok && result.error.issues.map((i) => i.path)).toEqual(['text', 'acts.0']);
    expect(!result.ok && result.error.issues[0]?.message).toBe(
      'Запрос слишком короткий: нужно хотя бы 2 символа',
    );
  });

  it('ограничивает limit сверху', async () => {
    const result = await setup().search({ text: 'статья', limit: 100 });
    expect(!result.ok && result.error.issues[0]?.path).toBe('limit');
  });
});

describe('LookupNorms.get', () => {
  it('возвращает норму по идентификатору', async () => {
    const result = await setup().get('152-fz/art-18/part-5');
    expect(result.ok && result.value.heading).toBe('Статья 18 (тестовая)');
  });

  it('неверный идентификатор — ошибка валидации с подсказкой формата', async () => {
    const result = await setup().get('ст. 18');
    expect(!result.ok && result.error.kind).toBe('validation');
  });

  it('отсутствующая норма — not-found', async () => {
    const result = await setup().get('152-fz/art-99');
    expect(!result.ok && result.error.kind).toBe('not-found');
  });
});

describe('LookupNorms.checkFreshness', () => {
  it('отдаёт статусы адаптера, а для отсутствующих норм — unknown', async () => {
    const result = await setup(
      createStubFreshnessChecker({ '152-fz/art-18/part-5': 'stale' }),
    ).checkFreshness(['152-fz/art-9/part-1', '152-fz/art-18/part-5', '152-fz/art-99']);

    expect(result.ok && result.value.map((r) => [r.id, r.status])).toEqual([
      ['152-fz/art-9/part-1', 'fresh'],
      ['152-fz/art-18/part-5', 'stale'],
      ['152-fz/art-99', 'unknown'],
    ]);
    expect(result.ok && result.value[2]?.detail).toBe('Норма «152-fz/art-99» не найдена в базе');
  });

  it('убирает повторы', async () => {
    const result = await setup().checkFreshness(['152-fz/art-9/part-1', '152-fz/art-9/part-1']);
    expect(result.ok && result.value).toHaveLength(1);
  });

  it('упавший адаптер даёт unknown, а не fresh', async () => {
    const throwing: SourceFreshnessChecker = {
      check: () => Promise.reject(new Error('сеть')),
    };
    const result = await setup(throwing).checkFreshness(['152-fz/art-9/part-1']);
    expect(result.ok && result.value[0]).toMatchObject({
      status: 'unknown',
      detail: 'Проверка актуальности не удалась',
    });
  });

  it('пустой список и неверный идентификатор — ошибки валидации', async () => {
    const empty = await setup().checkFreshness([]);
    const invalid = await setup().checkFreshness(['ст. 9']);
    expect(!empty.ok && empty.error.issues[0]?.message).toBe('Укажите хотя бы одну норму');
    expect(!invalid.ok && invalid.error.issues[0]?.path).toBe('0');
  });
});
