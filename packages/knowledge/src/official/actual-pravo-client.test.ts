import { describe, expect, it } from 'vitest';

import {
  createActualPravoClient,
  currentRedaction,
  officialDocumentUrl,
} from './actual-pravo-client';
import type { FetchLike } from './actual-pravo-client';

const respond =
  (body: unknown, status = 200): FetchLike =>
  () =>
    Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(body) });

const HASH = 'a'.repeat(64);

describe('клиент actual.pravo.gov.ru', () => {
  it('получает редакции, переводит даты в ISO и отмечает актуальную', async () => {
    const client = createActualPravoClient(
      respond({
        redactions: [
          { redid: 3, reddate: '20270301', redcaption: ' на 01.03.2027, не вступившая в силу ' },
          { redid: 2, reddate: '20260726', redcaption: 'с 26.07.2026, актуальная' },
          { redid: 1, reddate: '20250901', redcaption: 'на 01.09.2025, недействующая' },
        ],
      }),
    );
    const result = await client.redactions(HASH);
    expect(result.ok && result.value.map((r) => [r.id, r.date, r.isCurrent])).toEqual([
      [3, '2027-03-01', false],
      [2, '2026-07-26', true],
      [1, '2025-09-01', false],
    ]);
    expect(result.ok && currentRedaction(result.value)?.id).toBe(2);
  });

  it('передаёт запрос в формате портала', async () => {
    const urls: string[] = [];
    const client = createActualPravoClient((url) => {
      urls.push(url);
      return respond({ redtext: '<p>текст</p>' })(url, { signal: AbortSignal.timeout(1) });
    });
    await client.redactionHtml(495372);
    expect(urls).toEqual([
      'http://actual.pravo.gov.ru:8000/api/ebpi/redtext?bpa=ebpi&t=495372&ttl=0',
    ]);
  });

  it.each([
    ['ошибка сети', () => Promise.reject(new Error('ECONNRESET')), 'ECONNRESET'],
    ['HTTP 500', respond({}, 500), 'HTTP 500'],
    ['чужой формат', respond({ data: [] }), 'неожиданный формат ответа'],
    [
      'ошибка портала',
      respond({ redactions: null, error: 'Не заданы параметры акта' }),
      'Не заданы параметры акта',
    ],
  ])('%s → source-unavailable', async (_case, fetchImpl, detail) => {
    const result = await createActualPravoClient(fetchImpl).redactions(HASH);
    expect(!result.ok && result.error.kind).toBe('source-unavailable');
    expect(!result.ok && result.error.message).toContain(detail);
  });

  it('пустой текст редакции — ошибка', async () => {
    const result = await createActualPravoClient(respond({ redtext: null })).redactionHtml(1);
    expect(!result.ok && result.error.message).toContain('текст редакции не получен');
  });

  it('ссылка на документ — официальный портал', () => {
    expect(officialDocumentUrl(HASH)).toBe(
      `http://actual.pravo.gov.ru/content/content.html#hash=${HASH}`,
    );
  });
});
