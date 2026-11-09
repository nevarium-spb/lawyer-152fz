import type { DomainError, LookupNorms } from '@lawyer-152fz/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatError, formatFreshness, formatNorm, formatSearchHits } from './format';

/**
 * Схемы инструментов описывают поля для модели. Ограничения (длина запроса, лимит, формат id)
 * проверяет ядро — с русскими сообщениями, единообразно для плагина и бота.
 */
const searchHitShape = z.object({
  id: z.string(),
  heading: z.string(),
  snippet: z.string(),
  editionDate: z.string(),
  score: z.number(),
});

const normShape = z.object({
  id: z.string(),
  act: z.string(),
  heading: z.string(),
  text: z.string(),
  editionDate: z.string(),
  sourceType: z.enum(['official', 'secondary']),
  sourceUrl: z.string(),
  officialPublication: z.string().optional(),
  /** Срок действия акта (ГГГГ-ММ-ДД), если он ограничен: с этой даты акт не действует. */
  validUntil: z.string().optional(),
  verifiedAt: z.string(),
  /** Хеш текста: позволяет убедиться, что цитата совпадает с базой. */
  sha256: z.string(),
});

const freshnessShape = z.object({
  id: z.string(),
  status: z.enum(['fresh', 'stale', 'unknown']),
  checkedAt: z.string(),
  detail: z.string().optional(),
  sourceEditionDate: z.string().optional(),
  upcomingEditionDates: z.array(z.string()).optional(),
});

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

const errorResult = (error: DomainError) => ({
  isError: true,
  content: [{ type: 'text' as const, text: formatError(error) }],
});

export function registerNormTools(server: McpServer, lookup: LookupNorms, kbVersion: string): void {
  server.registerTool(
    'search_norms',
    {
      title: 'Поиск норм о персональных данных',
      description:
        'Ищет нормы 152-ФЗ, ст. 13.11 КоАП и постановлений Правительства о персональных данных ' +
        '(русская морфология, бытовые термины: «утечка», «локализация», «РКН»). Возвращает кандидатов ' +
        'с фрагментами. Цитировать можно только полный текст из get_norm. / Searches Russian ' +
        'personal-data law; call get_norm before quoting.',
      inputSchema: {
        text: z
          .string()
          .describe('Вопрос или ключевые слова на русском, например «согласие на распространение»'),
        acts: z
          .array(z.string())
          .optional()
          .describe(
            'Ограничить актами: 152-fz, koap, pp-687, pp-1119, rkn-order-18, rkn-order-178, rkn-order-179',
          ),
        limit: z.number().optional().describe('Сколько результатов вернуть: 1–20, по умолчанию 5'),
      },
      outputSchema: { kbVersion: z.string(), hits: z.array(searchHitShape) },
      annotations: READ_ONLY,
    },
    async (args) => {
      const result = await lookup.search(args);
      if (!result.ok) return errorResult(result.error);
      const hits = [...result.value];
      return {
        content: [{ type: 'text' as const, text: formatSearchHits(hits, kbVersion) }],
        structuredContent: { kbVersion, hits },
      };
    },
  );

  server.registerTool(
    'get_norm',
    {
      title: 'Полный текст нормы',
      description:
        'Возвращает полный текст нормы по идентификатору с датой редакции и источником. ' +
        'Единственный допустимый источник цитат (ADR-0001). / Returns the full norm text for quoting.',
      inputSchema: {
        id: z
          .string()
          .describe('Идентификатор нормы, например 152-fz/art-18/part-5 или pp-1119/item-13'),
      },
      outputSchema: { norm: normShape },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const result = await lookup.get(id);
      if (!result.ok) return errorResult(result.error);
      return {
        content: [{ type: 'text' as const, text: formatNorm(result.value) }],
        structuredContent: { norm: { ...result.value } },
      };
    },
  );

  server.registerTool(
    'check_norm_freshness',
    {
      title: 'Проверка актуальности норм',
      description:
        'Сверяет редакцию норм в базе с официальным порталом actual.pravo.gov.ru: fresh — действующая ' +
        'редакция совпадает, stale — на портале действует более новая, unknown — проверить не удалось ' +
        '(портал недоступен, вторичный источник). Называет принятые, но не вступившие в силу редакции. ' +
        '/ Checks norm editions against the official portal; unknown is never reported as fresh.',
      inputSchema: {
        ids: z
          .array(z.string())
          .describe(
            'Идентификаторы норм, 1–20, например ["152-fz/art-9/part-1", "koap/art-13.11"]',
          ),
      },
      outputSchema: { reports: z.array(freshnessShape) },
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ ids }) => {
      const result = await lookup.checkFreshness(ids);
      if (!result.ok) return errorResult(result.error);
      const reports = result.value.map((report) => ({ ...report }));
      return {
        content: [{ type: 'text' as const, text: formatFreshness(result.value) }],
        structuredContent: { reports },
      };
    },
  );
}
