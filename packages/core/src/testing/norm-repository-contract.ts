import { describe, expect, it } from 'vitest';

import { KB_VERSION_PATTERN } from '../domain/audit-report';
import type { Norm } from '../domain/norm';
import { normId } from '../domain/norm-id';
import type { NormRepository } from '../ports';
import { makeNorm } from './fixtures';

const CONTRACT_NORMS: readonly Norm[] = [
  makeNorm(),
  makeNorm({
    id: '152-fz/art-18/part-5',
    heading: 'Статья 18 (тестовая)',
    text: 'Локализация баз данных граждан — тестовый текст.',
  }),
  makeNorm({
    id: 'koap/art-13.11/part-1',
    act: 'koap',
    heading: 'Статья 13.11 КоАП (тестовая)',
    text: 'Штраф за нарушение порядка обработки персональных данных — тестовый текст.',
  }),
];

/**
 * Контракт порта NormRepository. Любая реализация (фейк, packages/knowledge)
 * обязана пройти эти тесты — так фейк и настоящая база ведут себя одинаково.
 */
export function describeNormRepositoryContract(
  name: string,
  create: (norms: readonly Norm[]) => NormRepository | Promise<NormRepository>,
): void {
  describe(`контракт NormRepository: ${name}`, () => {
    const repository = () => create(CONTRACT_NORMS);

    it('get возвращает норму по идентификатору', async () => {
      const result = await (await repository()).get(normId('152-fz/art-18/part-5'));
      expect(result.ok && result.value.heading).toBe('Статья 18 (тестовая)');
    });

    it('get отсутствующей нормы — not-found', async () => {
      const result = await (await repository()).get(normId('152-fz/art-99'));
      expect(!result.ok && result.error).toMatchObject({ kind: 'not-found', id: '152-fz/art-99' });
    });

    it('search находит норму по словам из текста', async () => {
      const hits = await (await repository()).search({ text: 'локализация баз', limit: 5 });
      expect(hits[0]?.id).toBe('152-fz/art-18/part-5');
      expect(hits[0]?.editionDate).toBe('2025-01-01');
    });

    it('search учитывает фильтр актов', async () => {
      const hits = await (
        await repository()
      ).search({ text: 'персональных данных', acts: ['koap'], limit: 5 });
      expect(hits.map((hit) => hit.id)).toEqual(['koap/art-13.11/part-1']);
    });

    it('search соблюдает limit и сортирует по убыванию релевантности', async () => {
      const hits = await (await repository()).search({ text: 'тестовый текст', limit: 2 });
      expect(hits.length).toBeLessThanOrEqual(2);
      const scores = hits.map((hit) => hit.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });

    it('search по бессмысленному запросу — пустой список', async () => {
      expect(await (await repository()).search({ text: 'zzzqqqxx', limit: 5 })).toEqual([]);
    });

    it('kbVersion в формате kb-ГГГГ.ММ.ДД', async () => {
      expect((await repository()).kbVersion).toMatch(KB_VERSION_PATTERN);
    });
  });
}
