import { describe, expect, it } from 'vitest';

import type { SiteRule } from '../domain/audit-rule';
import { LEGAL_DISCLAIMER } from '../domain/audit-report';
import { normId } from '../domain/norm-id';
import type { PageSnapshot } from '../domain/snapshots';
import type { PageAnalyzer } from '../ports';
import { fixedClock } from '../testing/fakes';
import { makeFinding, makePage } from '../testing/fixtures';
import { EMPTY_SPA_NOTE, HOST_DOM_NOTE, MAX_HTML_LENGTH, createAuditHtml } from './audit-html';

const consentRule: SiteRule = {
  id: 'PD-TEST-001',
  title: 'Тестовое правило',
  normRefs: [normId('152-fz/art-9/part-1')],
  check: (snapshot) => (snapshot.pages[0]?.forms.length === 0 ? [] : [makeFinding()]),
};

function setup(page: Partial<PageSnapshot> = {}) {
  const analyzed: { url: string; html: string }[] = [];
  const analyzer: PageAnalyzer = {
    analyze: (input) => {
      analyzed.push(input);
      return makePage({ url: input.url, ...page });
    },
  };
  const auditHtml = createAuditHtml({
    analyzer,
    rules: [consentRule],
    norms: { kbVersion: 'kb-2026.10.25' },
    clock: fixedClock('2026-10-28T10:00:00Z'),
  });
  return { auditHtml, analyzed };
}

describe('AuditHtml (ADR-0010)', () => {
  it('разбирает переданный HTML без сети и собирает отчёт по правилам сайта', async () => {
    const form = {
      selector: 'form#lead',
      action: 'https://example.ru/lead',
      method: 'post' as const,
      fields: [],
      consent: 'none' as const,
      hasPolicyLink: false,
    };
    const { auditHtml, analyzed } = setup({ forms: [form] });

    const result = await auditHtml({ url: 'https://example.ru/contacts', html: '<form></form>' });

    expect(analyzed).toEqual([{ url: 'https://example.ru/contacts', html: '<form></form>' }]);
    expect(result).toEqual({
      ok: true,
      value: {
        target: { type: 'site', url: 'https://example.ru/contacts' },
        generatedAt: '2026-10-28T10:00:00.000Z',
        kbVersion: 'kb-2026.10.25',
        findings: [makeFinding()],
        notChecked: [HOST_DOM_NOTE],
        disclaimer: LEGAL_DISCLAIMER,
      },
    });
  });

  it('пустая оболочка SPA вместо отрисованного DOM — подсказка в notChecked', async () => {
    const { auditHtml } = setup({ renderedByScript: true });

    const result = await auditHtml({ url: 'https://example.ru/', html: '<div id="root"></div>' });

    expect(result.ok && result.value.notChecked).toEqual([HOST_DOM_NOTE, EMPTY_SPA_NOTE]);
  });

  it.each([
    [{ url: 'ftp://example.ru', html: '<p>' }, 'url'],
    [{ url: 'https://example.ru', html: '' }, 'html'],
    [{ url: 'https://example.ru', html: 'x'.repeat(MAX_HTML_LENGTH + 1) }, 'html'],
    [{ url: 'https://example.ru' }, 'html'],
  ])('некорректный вход — ошибка валидации на русском (%#)', async (input, field) => {
    const { auditHtml, analyzed } = setup();

    const result = await auditHtml(input);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues.map((issue) => issue.path)).toContain(field);
    expect(analyzed).toEqual([]);
  });
});
