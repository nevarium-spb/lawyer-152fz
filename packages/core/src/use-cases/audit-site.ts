import { z } from 'zod';

import type { SiteRule } from '../domain/audit-rule';
import { createAuditReport } from '../domain/audit-report';
import type { AuditReport } from '../domain/audit-report';
import type { Clock, NormRepository, SiteScanner } from '../ports';
import type { ForbiddenError, SourceUnavailableError, ValidationError } from '../shared/errors';
import { ok } from '../shared/result';
import type { Result } from '../shared/result';
import { parseWith } from '../shared/validation';
import { runRules } from './run-rules';

export const DEFAULT_MAX_PAGES = 10;
export const MAX_PAGES = 50;

const auditSiteInputSchema = z.object({
  url: z.url({ protocol: /^https?$/, error: 'Адрес сайта — ссылка вида https://example.ru' }),
  maxPages: z.number().int().min(1).max(MAX_PAGES).default(DEFAULT_MAX_PAGES),
  render: z.boolean().default(false),
});

export interface AuditSiteDeps {
  readonly scanner: SiteScanner;
  readonly rules: readonly SiteRule[];
  readonly norms: Pick<NormRepository, 'kbVersion'>;
  readonly clock: Clock;
}

export type AuditSite = (
  input: unknown,
) => Promise<Result<AuditReport, ValidationError | SourceUnavailableError | ForbiddenError>>;

export function createAuditSite(deps: AuditSiteDeps): AuditSite {
  return async (input) => {
    const parsed = parseWith(auditSiteInputSchema, input, 'Некорректные параметры аудита сайта');
    if (!parsed.ok) return parsed;

    const { url, maxPages, render } = parsed.value;
    const snapshot = await deps.scanner.scan(url, { maxPages, render });
    if (!snapshot.ok) return snapshot;

    const outcome = runRules(deps.rules, snapshot.value);
    return ok(
      createAuditReport(
        { type: 'site', url },
        outcome.findings,
        [...snapshot.value.notChecked, ...outcome.notChecked],
        { kbVersion: deps.norms.kbVersion, now: deps.clock.now() },
      ),
    );
  };
}
