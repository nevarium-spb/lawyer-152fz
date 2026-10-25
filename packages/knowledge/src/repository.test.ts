import { normId } from '@lawyer-152fz/core';
import { describeNormRepositoryContract } from '@lawyer-152fz/core/testing';
import { describe, expect, it } from 'vitest';

import { loadKnowledgeBase } from './load-from-dir';
import { createNormRepository } from './repository';

// Тот же контракт, что проходит фейк из core: настоящая база ведёт себя так же (критерий T2.5).
describeNormRepositoryContract('база норм knowledge', (norms) =>
  createNormRepository({ norms, kbVersion: 'kb-2026.10.25' }),
);

describe('репозиторий на настоящей базе', () => {
  it('отдаёт часть статьи с официальным источником и датой редакции', async () => {
    const knowledgeBase = await loadKnowledgeBase();
    if (!knowledgeBase.ok) throw new Error(knowledgeBase.error.message);

    const repository = createNormRepository(knowledgeBase.value);
    const result = await repository.get(normId('152-fz/art-18/part-5'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.heading).toBe(
      'Статья 18. Обязанности оператора при сборе персональных данных, часть 5',
    );
    expect(result.value.text).toMatch(/^5\. При сборе персональных данных/);
    expect(result.value.sourceUrl).toMatch(/^http:\/\/actual\.pravo\.gov\.ru\//);
    expect(repository.kbVersion).toMatch(/^kb-\d{4}\.\d{2}\.\d{2}$/);
  });
});
