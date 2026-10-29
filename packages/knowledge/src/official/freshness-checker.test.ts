import { err, ok, sourceUnavailable } from '@lawyer-152fz/core';
import type { Clock } from '@lawyer-152fz/core';
import { makeNorm } from '@lawyer-152fz/core/testing';
import { describe, expect, it } from 'vitest';

import type { ActualPravoClient, Redaction } from './actual-pravo-client';
import { createSourceFreshnessChecker } from './freshness-checker';

const HASH = 'b'.repeat(64);
const officialNorm = (editionDate = '2026-07-26') =>
  makeNorm({
    editionDate,
    sourceUrl: `http://actual.pravo.gov.ru/content/content.html#hash=${HASH}`,
  });

const redaction = (id: number, date: string, isCurrent = false): Redaction => ({
  id,
  date,
  caption: isCurrent ? `с ${date}, актуальная` : `на ${date}`,
  isCurrent,
});

/** Часы, которые тест двигает вперёд вручную. */
function movableClock(start = '2026-10-29T10:00:00Z') {
  let now = new Date(start);
  const clock: Clock = { now: () => now };
  return { clock, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

/** Клиент портала с заданным ответом; считает запросы редакций. */
function stubClient(respond: () => ReturnType<ActualPravoClient['redactions']>) {
  const calls: string[] = [];
  const client: ActualPravoClient = {
    redactions: (docHash) => {
      calls.push(docHash);
      return respond();
    },
    redactionHtml: () => Promise.reject(new Error('не используется')),
  };
  return { client, calls };
}

const PORTAL = [
  redaction(3, '2027-03-01'),
  redaction(2, '2026-07-26', true),
  redaction(1, '2025-09-01'),
];

describe('проверка актуальности по actual.pravo.gov.ru (T6.6)', () => {
  it('редакция в базе совпадает с действующей → fresh, будущие редакции названы', async () => {
    const { client, calls } = stubClient(() => Promise.resolve(ok(PORTAL)));
    const checker = createSourceFreshnessChecker({ client, clock: movableClock().clock });

    const report = await checker.check(officialNorm());

    expect(calls).toEqual([HASH]);
    expect(report).toMatchObject({
      id: '152-fz/art-9/part-1',
      status: 'fresh',
      checkedAt: '2026-10-29T10:00:00.000Z',
      sourceEditionDate: '2026-07-26',
      upcomingEditionDates: ['2027-03-01'],
    });
    expect(report.detail).toContain('от 26.07.2026, как в базе');
    expect(report.detail).toContain('не вступила в силу редакция с 01.03.2027');
  });

  it('на портале действует более новая редакция → stale с обеими датами', async () => {
    const { client } = stubClient(() =>
      Promise.resolve(ok([redaction(2, '2026-07-26', true), redaction(1, '2025-09-01')])),
    );
    const report = await createSourceFreshnessChecker({
      client,
      clock: movableClock().clock,
    }).check(officialNorm('2025-09-01'));

    expect(report.status).toBe('stale');
    expect(report.sourceEditionDate).toBe('2026-07-26');
    expect(report.upcomingEditionDates).toBeUndefined();
    expect(report.detail).toContain('от 26.07.2026, в базе — от 01.09.2025');
  });

  it('несколько будущих редакций — по возрастанию дат и во множественном числе', async () => {
    const { client } = stubClient(() =>
      Promise.resolve(
        ok([
          redaction(4, '2027-01-23'),
          redaction(3, '2026-11-03'),
          redaction(2, '2026-10-01', true),
        ]),
      ),
    );
    const report = await createSourceFreshnessChecker({
      client,
      clock: movableClock().clock,
    }).check(officialNorm('2026-10-01'));

    expect(report.upcomingEditionDates).toEqual(['2026-11-03', '2027-01-23']);
    expect(report.detail).toContain('не вступили в силу редакции с 03.11.2026, 23.01.2027');
  });

  it.each([
    [
      'портал недоступен',
      () => Promise.resolve(err(sourceUnavailable('actual.pravo.gov.ru', 'ETIMEDOUT'))),
      'ETIMEDOUT',
    ],
    [
      'портал не отметил действующую редакцию',
      () => Promise.resolve(ok([redaction(1, '2026-07-26')])),
      'не отметил действующую редакцию',
    ],
    [
      'в базе редакция новее действующей',
      () => Promise.resolve(ok([redaction(1, '2025-09-01', true)])),
      'не согласуются',
    ],
    [
      'клиент нарушил контракт и бросил исключение',
      () => Promise.reject(new Error('сбой')),
      'не удалась',
    ],
  ])('%s → unknown, а не fresh', async (_case, respond, detail) => {
    const { client } = stubClient(respond);
    const report = await createSourceFreshnessChecker({
      client,
      clock: movableClock().clock,
    }).check(officialNorm());

    expect(report.status).toBe('unknown');
    expect(report.detail).toContain(detail);
  });

  it('вторичный источник не проверяется автоматически → unknown без запроса к порталу', async () => {
    const { client, calls } = stubClient(() => Promise.resolve(ok(PORTAL)));
    const report = await createSourceFreshnessChecker({
      client,
      clock: movableClock().clock,
    }).check(
      makeNorm({
        id: 'pp-1119/item-13',
        act: 'pp-1119',
        sourceType: 'secondary',
        sourceUrl: 'https://www.consultant.ru/document/cons_doc_LAW_137356/',
        officialPublication: '«Российская газета», 07.11.2012, № 256',
      }),
    );

    expect(calls).toEqual([]);
    expect(report.status).toBe('unknown');
    expect(report.detail).toContain('КонсультантПлюс');
    expect(report.detail).toContain('«Российская газета», 07.11.2012, № 256');
  });

  it('ссылка без идентификатора документа → unknown без запроса к порталу', async () => {
    const { client, calls } = stubClient(() => Promise.resolve(ok(PORTAL)));
    const report = await createSourceFreshnessChecker({
      client,
      clock: movableClock().clock,
    }).check(makeNorm({ sourceUrl: 'http://pravo.gov.ru/proxy/ips/?docbody=&nd=102108261' }));

    expect(calls).toEqual([]);
    expect(report.status).toBe('unknown');
  });

  it('нормы одного акта проверяются одним запросом, пока не истёк кеш', async () => {
    const { client, calls } = stubClient(() => Promise.resolve(ok(PORTAL)));
    const { clock, advance } = movableClock();
    const checker = createSourceFreshnessChecker({ client, clock, cacheTtlMs: 60_000 });

    await Promise.all(
      [officialNorm(), officialNorm(), officialNorm()].map((norm) => checker.check(norm)),
    );
    expect(calls).toHaveLength(1);

    advance(60_000);
    await checker.check(officialNorm());
    expect(calls).toHaveLength(2);
  });

  it('ошибку портала не кеширует: следующий вызов спрашивает заново', async () => {
    let available = false;
    const { client, calls } = stubClient(() =>
      Promise.resolve(
        available ? ok(PORTAL) : err(sourceUnavailable('actual.pravo.gov.ru', 'HTTP 502')),
      ),
    );
    const checker = createSourceFreshnessChecker({ client, clock: movableClock().clock });

    expect((await checker.check(officialNorm())).status).toBe('unknown');
    available = true;
    expect((await checker.check(officialNorm())).status).toBe('fresh');
    expect(calls).toHaveLength(2);
  });
});
