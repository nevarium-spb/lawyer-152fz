import { z } from 'zod';

import { actIdSchema } from '../domain/norm';
import type { Norm } from '../domain/norm';
import { normIdSchema, parseNormId } from '../domain/norm-id';
import type { NormId } from '../domain/norm-id';
import type {
  Clock,
  FreshnessReport,
  NormRepository,
  NormSearchHit,
  SourceFreshnessChecker,
} from '../ports';
import type { NotFoundError, ValidationError } from '../shared/errors';
import { ok } from '../shared/result';
import type { Result } from '../shared/result';
import { parseWith } from '../shared/validation';

export const DEFAULT_SEARCH_LIMIT = 5;
export const MAX_SEARCH_LIMIT = 20;
export const MAX_FRESHNESS_BATCH = 20;

const searchInputSchema = z.object({
  text: z
    .string({ error: 'Укажите текст запроса' })
    .trim()
    .min(2, 'Запрос слишком короткий: нужно хотя бы 2 символа'),
  acts: z.array(actIdSchema).optional(),
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT),
});

const freshnessInputSchema = z
  .array(normIdSchema, { error: 'Передайте список идентификаторов норм' })
  .min(1, 'Укажите хотя бы одну норму')
  .max(MAX_FRESHNESS_BATCH, `Не больше ${String(MAX_FRESHNESS_BATCH)} норм за раз`);

export interface LookupNormsDeps {
  readonly norms: NormRepository;
  readonly freshness: SourceFreshnessChecker;
  readonly clock: Clock;
}

export interface LookupNorms {
  /** Поиск кандидатов. Для цитаты нужен полный текст из `get` (ADR-0001). */
  search(input: unknown): Promise<Result<readonly NormSearchHit[], ValidationError>>;
  get(id: string): Promise<Result<Norm, ValidationError | NotFoundError>>;
  checkFreshness(ids: unknown): Promise<Result<readonly FreshnessReport[], ValidationError>>;
}

export function createLookupNorms(deps: LookupNormsDeps): LookupNorms {
  const unknownStatus = (id: NormId, detail: string): FreshnessReport => ({
    id,
    status: 'unknown',
    checkedAt: deps.clock.now().toISOString(),
    detail,
  });

  const checkOne = async (id: NormId): Promise<FreshnessReport> => {
    const norm = await deps.norms.get(id);
    if (!norm.ok) return unknownStatus(id, norm.error.message);
    try {
      return await deps.freshness.check(norm.value);
    } catch {
      // Контракт порта запрещает исключения; если адаптер всё же упал — «неизвестно», а не «актуально».
      return unknownStatus(id, 'Проверка актуальности не удалась');
    }
  };

  return {
    async search(input) {
      const query = parseWith(searchInputSchema, input, 'Некорректный поисковый запрос');
      if (!query.ok) return query;
      return ok(await deps.norms.search(query.value));
    },

    async get(rawId) {
      const id = parseNormId(rawId);
      if (!id.ok) return id;
      return deps.norms.get(id.value);
    },

    async checkFreshness(rawIds) {
      const ids = parseWith(freshnessInputSchema, rawIds, 'Некорректный список норм');
      if (!ids.ok) return ids;
      return ok(await Promise.all([...new Set(ids.value)].map(checkOne)));
    },
  };
}
