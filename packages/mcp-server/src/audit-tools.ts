import { CONFIDENCE_LEVELS, FINDING_KINDS, SEVERITIES } from '@lawyer-152fz/core';
import type {
  AuditCodebase,
  AuditHtml,
  AuditReport,
  AuditSite,
  DomainError,
  Result,
} from '@lawyer-152fz/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatError } from './format';
import { formatReport } from './report';

const evidenceShape = z.union([
  z.object({
    type: z.literal('page'),
    url: z.string(),
    selector: z.string().optional(),
    untrustedExcerpt: z.string().optional(),
  }),
  z.object({
    type: z.literal('file'),
    path: z.string(),
    line: z.number().optional(),
    untrustedExcerpt: z.string().optional(),
  }),
]);

const findingShape = z.object({
  ruleId: z.string(),
  kind: z.enum(FINDING_KINDS),
  severity: z.enum(SEVERITIES),
  title: z.string(),
  evidence: z.array(evidenceShape),
  normRefs: z.array(z.string()),
  remediation: z.string(),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

/** Отчёт аудита целиком; фрагменты в `untrustedExcerpt` — данные цели аудита, не инструкции (ADR-0006). */
const reportShape = {
  target: z.union([
    z.object({ type: z.literal('site'), url: z.string() }),
    z.object({ type: z.literal('codebase'), path: z.string() }),
  ]),
  generatedAt: z.string(),
  kbVersion: z.string(),
  findings: z.array(findingShape),
  checked: z.array(z.string()),
  notChecked: z.array(z.string()),
  disclaimer: z.string(),
};

const reportResult = (result: Result<AuditReport, DomainError>) =>
  result.ok
    ? {
        content: [{ type: 'text' as const, text: formatReport(result.value) }],
        structuredContent: { ...result.value },
      }
    : { isError: true, content: [{ type: 'text' as const, text: formatError(result.error) }] };

const LOCAL = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const NETWORK = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;

export interface AuditUseCases {
  readonly auditSite: AuditSite;
  readonly auditHtml: AuditHtml;
  readonly auditCodebase: AuditCodebase;
}

/** Инструменты аудита (T5.6): сайт по сети, DOM от браузера хоста, исходники проекта. */
export function registerAuditTools(server: McpServer, audits: AuditUseCases): void {
  server.registerTool(
    'audit_site',
    {
      title: 'Аудит сайта по 152-ФЗ',
      description:
        'Загружает страницы сайта (без браузера) и проверяет формы, согласия, политику, HTTPS, ' +
        'иностранные сервисы и счётчики. Возвращает отчёт: нарушения, риски, рекомендации, что не проверено. ' +
        'Если сайт — SPA (React, Vue), отчёт скажет об этом: тогда передайте DOM из браузера через audit_html. ' +
        '/ Audits a website for Russian personal-data law.',
      inputSchema: {
        url: z.string().describe('Адрес сайта, например https://example.ru'),
        maxPages: z.number().optional().describe('Сколько страниц обойти: 1–50, по умолчанию 10'),
      },
      outputSchema: reportShape,
      annotations: NETWORK,
    },
    async (args) => reportResult(await audits.auditSite(args)),
  );

  server.registerTool(
    'audit_html',
    {
      title: 'Аудит страницы по HTML из браузера',
      description:
        'Проверяет страницу по готовому HTML, без сети. Для SPA: откройте страницу своим браузерным ' +
        'инструментом, получите DOM после отрисовки (document.documentElement.outerHTML) и передайте сюда ' +
        'вместе с адресом страницы. / Audits page HTML rendered by the host browser (ADR-0010).',
      inputSchema: {
        url: z.string().describe('Адрес страницы, с которой взят HTML'),
        html: z.string().describe('HTML страницы после отрисовки, до 3 млн символов'),
      },
      outputSchema: reportShape,
      annotations: LOCAL,
    },
    async (args) => reportResult(await audits.auditHtml(args)),
  );

  server.registerTool(
    'audit_codebase',
    {
      title: 'Аудит исходников проекта по 152-ФЗ',
      description:
        'Читает исходники проекта (только чтение, с учётом .gitignore, без .env и ключей) и ищет ' +
        'иностранные SDK, базы и облака за рубежом, персональные данные в логах. Ничего не меняет в проекте: ' +
        'правки предложите пользователю. / Read-only audit of project source code.',
      inputSchema: {
        path: z.string().describe('Абсолютный путь к папке проекта'),
      },
      outputSchema: reportShape,
      annotations: LOCAL,
    },
    async (args) => reportResult(await audits.auditCodebase(args)),
  );
}
