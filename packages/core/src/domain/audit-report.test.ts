import { describe, expect, it } from 'vitest';

import { makeFinding } from '../testing/fixtures';
import { LEGAL_DISCLAIMER, createAuditReport } from './audit-report';

describe('createAuditReport', () => {
  const context = { kbVersion: 'kb-2026.10.24', now: new Date('2026-10-24T10:00:00Z') };

  it('упорядочивает находки, убирает дубли «не проверено», добавляет дисклеймер', () => {
    const report = createAuditReport(
      { type: 'site', url: 'https://example.ru' },
      [
        makeFinding({ ruleId: 'PD-REC', kind: 'recommendation' }),
        makeFinding({ ruleId: 'PD-VIOL', kind: 'violation' }),
      ],
      ['страницы за авторизацией', 'страницы за авторизацией'],
      context,
    );

    expect(report).toMatchObject({
      target: { type: 'site', url: 'https://example.ru' },
      generatedAt: '2026-10-24T10:00:00.000Z',
      kbVersion: 'kb-2026.10.24',
      notChecked: ['страницы за авторизацией'],
      disclaimer: LEGAL_DISCLAIMER,
    });
    expect(report.findings.map((f) => f.ruleId)).toEqual(['PD-VIOL', 'PD-REC']);
  });

  it('не мутирует переданный массив находок', () => {
    const findings = [makeFinding({ ruleId: 'PD-B' }), makeFinding({ ruleId: 'PD-A' })];
    createAuditReport({ type: 'codebase', path: '/repo' }, findings, [], context);
    expect(findings.map((f) => f.ruleId)).toEqual(['PD-B', 'PD-A']);
  });
});
