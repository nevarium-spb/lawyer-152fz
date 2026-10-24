import { describe, expect, it } from 'vitest';

import type { SiteRule } from '../domain/audit-rule';
import { normId } from '../domain/norm-id';
import type { SiteSnapshot } from '../domain/snapshots';
import { forbidden } from '../shared/errors';
import type { ForbiddenError, SourceUnavailableError } from '../shared/errors';
import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { createStubSiteScanner, fixedClock } from '../testing/fakes';
import { makeFinding, makeSiteSnapshot } from '../testing/fixtures';
import { createAuditSite } from './audit-site';

const consentRule: SiteRule = {
  id: 'PD-TEST-001',
  title: 'Тестовое правило',
  normRefs: [normId('152-fz/art-9/part-1')],
  check: () => [makeFinding()],
};

const setup = (
  scanResult: Result<SiteSnapshot, SourceUnavailableError | ForbiddenError> = ok(
    makeSiteSnapshot({ notChecked: ['страницы за авторизацией'] }),
  ),
) => {
  const scanner = createStubSiteScanner(scanResult);
  const auditSite = createAuditSite({
    scanner,
    rules: [consentRule],
    norms: { kbVersion: 'kb-2026.10.24' },
    clock: fixedClock('2026-10-24T10:00:00Z'),
  });
  return { scanner, auditSite };
};

describe('AuditSite', () => {
  it('сканирует сайт, прогоняет правила и собирает отчёт', async () => {
    const { scanner, auditSite } = setup();
    const result = await auditSite({ url: 'https://example.ru' });

    expect(scanner.calls).toEqual([
      { target: 'https://example.ru', options: { maxPages: 10, render: false } },
    ]);
    expect(result.ok && result.value).toMatchObject({
      target: { type: 'site', url: 'https://example.ru' },
      kbVersion: 'kb-2026.10.24',
      generatedAt: '2026-10-24T10:00:00.000Z',
      notChecked: ['страницы за авторизацией'],
    });
    expect(result.ok && result.value.findings.map((f) => f.ruleId)).toEqual(['PD-TEST-001']);
  });

  it.each(['example.ru', 'ftp://example.ru', 'javascript:alert(1)'])(
    'отвергает адрес «%s», не обращаясь к сканеру',
    async (url) => {
      const { scanner, auditSite } = setup();
      const result = await auditSite({ url });
      expect(!result.ok && result.error.kind).toBe('validation');
      expect(scanner.calls).toEqual([]);
    },
  );

  it('ограничивает число страниц', async () => {
    const result = await setup().auditSite({ url: 'https://example.ru', maxPages: 500 });
    expect(!result.ok && result.error.kind === 'validation' && result.error.issues[0]?.path).toBe(
      'maxPages',
    );
  });

  it('пробрасывает отказ сканера (например, SSRF-политика)', async () => {
    const { auditSite } = setup(err(forbidden('частные сети запрещены')));
    const result = await auditSite({ url: 'http://192.168.0.1' });
    expect(!result.ok && result.error.kind).toBe('forbidden');
  });
});
