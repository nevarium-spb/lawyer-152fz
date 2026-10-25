import { err, notFound, ok } from '@lawyer-152fz/core';
import type { NormRepository } from '@lawyer-152fz/core';

import type { KnowledgeBase } from './knowledge-base';
import { createSearchIndex } from './search-index';

/** Адаптер порта `NormRepository` поверх собранной базы норм (ADR-0002, ADR-0003). */
export function createNormRepository(
  knowledgeBase: Pick<KnowledgeBase, 'norms' | 'kbVersion'>,
): NormRepository {
  const byId = new Map(knowledgeBase.norms.map((norm) => [norm.id, norm]));
  const index = createSearchIndex(knowledgeBase.norms);

  return {
    kbVersion: knowledgeBase.kbVersion,
    get: (id) => {
      const norm = byId.get(id);
      return Promise.resolve(norm ? ok(norm) : err(notFound('norm', id)));
    },
    search: (query) => Promise.resolve(index.search(query)),
  };
}
