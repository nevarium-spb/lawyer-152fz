import type { FreshnessReport, SourceFreshnessChecker } from '@lawyer-152fz/core';
import { readTemplateFiles } from '@lawyer-152fz/documents';
import { readKnowledgeFiles } from '@lawyer-152fz/knowledge';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeAll, describe, expect, it } from 'vitest';

import { composeServer } from './compose';

/** Сверка без сети: ответ задан по идентификатору нормы, остальные — «неизвестно». */
const stubFreshness = (reports: Record<string, Omit<FreshnessReport, 'id' | 'checkedAt'>>) =>
  ({
    check: (norm) =>
      Promise.resolve({
        id: norm.id,
        checkedAt: '2026-10-29T10:00:00.000Z',
        ...(reports[norm.id] ?? { status: 'unknown', detail: 'Портал недоступен' }),
      }),
  }) satisfies SourceFreshnessChecker;

let client: Client;

beforeAll(async () => {
  const composed = composeServer(
    { knowledgeFiles: await readKnowledgeFiles(), templateFiles: await readTemplateFiles() },
    { now: () => new Date('2026-10-29T10:00:00Z') },
    {
      freshness: stubFreshness({
        '152-fz/art-9/part-1': {
          status: 'fresh',
          detail: 'Действующая редакция акта на портале — от 26.07.2026, как в базе.',
          sourceEditionDate: '2026-07-26',
          upcomingEditionDates: ['2027-03-01'],
        },
        'koap/art-13.11/part-1': {
          status: 'stale',
          detail: 'На портале действует редакция акта от 01.11.2026, в базе — от 01.10.2026.',
          sourceEditionDate: '2026-11-01',
        },
      }),
    },
  );
  if (!composed.ok) throw new Error(composed.error.message);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await composed.value.server.connect(serverTransport);
  client = new Client({ name: 'freshness-test', version: '0.0.0' });
  await client.connect(clientTransport);
});

type CallResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (result: CallResult) => (result.content as { text?: string }[])[0]?.text ?? '';
const check = (ids: unknown) =>
  client.callTool({ name: 'check_norm_freshness', arguments: { ids } });

describe('инструмент check_norm_freshness (T6.6)', () => {
  it('возвращает статус каждой нормы текстом и структурой', async () => {
    const result = await check(['152-fz/art-9/part-1', 'koap/art-13.11/part-1', 'pp-1119/item-13']);

    expect(result.isError).toBeFalsy();
    const { reports } = result.structuredContent as { reports: FreshnessReport[] };
    expect(reports.map((report) => [report.id, report.status])).toEqual([
      ['152-fz/art-9/part-1', 'fresh'],
      ['koap/art-13.11/part-1', 'stale'],
      ['pp-1119/item-13', 'unknown'],
    ]);
    expect(reports[0]?.upcomingEditionDates).toEqual(['2027-03-01']);

    const text = textOf(result);
    expect(text).toContain('152-fz/art-9/part-1 — актуальна');
    expect(text).toContain('koap/art-13.11/part-1 — в базе не действующая редакция');
    expect(text).toContain('pp-1119/item-13 — проверить не удалось');
    expect(text).toContain('не значит «актуальна»');
  });

  it('норма, которой нет в базе, — unknown, а не ошибка всего запроса', async () => {
    const result = await check(['152-fz/art-999']);
    const { reports } = result.structuredContent as { reports: FreshnessReport[] };
    expect(reports[0]?.status).toBe('unknown');
  });

  it('пустой список и неверный идентификатор — ошибка валидации на русском', async () => {
    const empty = await check([]);
    expect(empty.isError).toBe(true);
    expect(textOf(empty)).toContain('Укажите хотя бы одну норму');

    const malformed = await check(['Статья 9']);
    expect(malformed.isError).toBe(true);
    expect(textOf(malformed)).toContain('Некорректный список норм');
  });
});
