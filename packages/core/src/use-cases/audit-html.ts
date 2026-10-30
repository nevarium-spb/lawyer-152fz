import { z } from 'zod';

import type { SiteRule } from '../domain/audit-rule';
import { createAuditReport, describeSiteCoverage } from '../domain/audit-report';
import type { AuditReport } from '../domain/audit-report';
import type { Clock, NormRepository, PageAnalyzer } from '../ports';
import type { ValidationError } from '../shared/errors';
import { ok } from '../shared/result';
import type { Result } from '../shared/result';
import { parseWith } from '../shared/validation';
import { runRules } from './run-rules';

/** Предел HTML, который хост может передать: больше — почти наверняка не одна страница. */
export const MAX_HTML_LENGTH = 3_000_000;

export const HOST_DOM_NOTE =
  'HTML передан хостом: cookie из заголовков ответа сервера и сетевые запросы скриптов не проверены';
export const EMPTY_SPA_NOTE =
  'переданный HTML — пустая оболочка SPA: передайте DOM после отрисовки страницы (document.documentElement.outerHTML)';

const auditHtmlInputSchema = z.object({
  url: z.url({
    protocol: /^https?$/,
    error: 'Адрес страницы — ссылка вида https://example.ru/contacts',
  }),
  html: z
    .string({ error: 'Передайте HTML страницы' })
    .min(1, 'Передайте HTML страницы')
    .max(MAX_HTML_LENGTH, 'HTML больше 3 млн символов — передайте одну страницу'),
});

export interface AuditHtmlDeps {
  readonly analyzer: PageAnalyzer;
  readonly rules: readonly SiteRule[];
  readonly norms: Pick<NormRepository, 'kbVersion'>;
  readonly clock: Clock;
}

export type AuditHtml = (input: unknown) => Promise<Result<AuditReport, ValidationError>>;

/**
 * Аудит страницы по HTML, который передал хост — обычно DOM SPA из браузера (ADR-0010).
 * Сеть не используется: `url` нужен для доказательств и проверки HTTPS.
 */
export function createAuditHtml(deps: AuditHtmlDeps): AuditHtml {
  return (input) => {
    const parsed = parseWith(auditHtmlInputSchema, input, 'Некорректные параметры аудита HTML');
    if (!parsed.ok) return Promise.resolve(parsed);

    const { url, html } = parsed.value;
    const page = deps.analyzer.analyze({ url, html });
    const notChecked = [HOST_DOM_NOTE, ...(page.renderedByScript ? [EMPTY_SPA_NOTE] : [])];
    const outcome = runRules(deps.rules, { rootUrl: url, pages: [page], notChecked });

    return Promise.resolve(
      ok(
        createAuditReport(
          { type: 'site', url },
          outcome.findings,
          [...notChecked, ...outcome.notChecked],
          { kbVersion: deps.norms.kbVersion, now: deps.clock.now() },
          [describeSiteCoverage([page])],
        ),
      ),
    );
  };
}
