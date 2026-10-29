import {
  createAuditCodebase,
  createAuditHtml,
  createAuditSite,
  createGenerateDocument,
  createLookupNorms,
  err,
  ok,
} from '@lawyer-152fz/core';
import type { Clock, Result, SourceFreshnessChecker, ValidationError } from '@lawyer-152fz/core';
import { createDocumentTemplates } from '@lawyer-152fz/documents';
import type { TemplateFile } from '@lawyer-152fz/documents';
import {
  buildKnowledgeBase,
  createNormRepository,
  createSourceFreshnessChecker,
} from '@lawyer-152fz/knowledge';
import type { KnowledgeFile } from '@lawyer-152fz/knowledge';
import { CODEBASE_RULES, SITE_RULES } from '@lawyer-152fz/rules';
import {
  createAddressPolicy,
  createCodebaseReader,
  createSiteScanner,
  createStaticPageLoader,
  pageAnalyzer,
} from '@lawyer-152fz/scanner';
import type { PageLoader } from '@lawyer-152fz/scanner';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAuditTools } from './audit-tools';
import { registerDocumentTools } from './document-tools';
import { describeKnowledgeBase, registerKbInfo } from './kb-info';
import type { KbInfo } from './kb-info';
import { SERVER_INSTRUCTIONS } from './instructions';
import { registerNormTools } from './tools';
import { SERVER_NAME, SERVER_VERSION } from './version';

const systemClock: Clock = { now: () => new Date() };

/** Данные, вшитые в бандл или прочитанные с диска: база норм и шаблоны документов. */
export interface ServerAssets {
  readonly knowledgeFiles: readonly KnowledgeFile[];
  readonly templateFiles: readonly TemplateFile[];
}

export interface ComposedServer {
  readonly server: McpServer;
  readonly kbInfo: KbInfo;
}

/**
 * Точка сборки (ADR-0002): база норм и шаблоны → адаптеры → сценарии ядра → MCP-инструменты.
 * Единственное место, которое знает обо всех пакетах сразу.
 */
export interface ComposeOptions {
  /** Разрешить аудит адресов частных сетей (свой localhost в плагине); в боте — false (ADR-0006). */
  readonly allowPrivateNetworks?: boolean;
  /** Подмена загрузчика страниц — для тестов без сети. */
  readonly pageLoader?: PageLoader;
  /** Подмена сверки с официальным порталом — для тестов без сети. */
  readonly freshness?: SourceFreshnessChecker;
}

export function composeServer(
  assets: ServerAssets,
  clock: Clock = systemClock,
  options: ComposeOptions = {},
): Result<ComposedServer, ValidationError> {
  const knowledgeBase = buildKnowledgeBase(assets.knowledgeFiles);
  if (!knowledgeBase.ok) return err(knowledgeBase.error);
  const templates = createDocumentTemplates(assets.templateFiles);
  if (!templates.ok) return err(templates.error);

  const norms = createNormRepository(knowledgeBase.value);
  const freshness = options.freshness ?? createSourceFreshnessChecker({ clock });
  const lookup = createLookupNorms({ norms, freshness, clock });
  const kbInfo = describeKnowledgeBase(knowledgeBase.value);

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerNormTools(server, lookup, knowledgeBase.value.kbVersion);
  registerKbInfo(server, kbInfo);

  const loader =
    options.pageLoader ??
    createStaticPageLoader({
      policy: createAddressPolicy({ allowPrivateNetworks: options.allowPrivateNetworks ?? true }),
    });
  const auditDeps = { norms, clock };
  registerAuditTools(server, {
    auditSite: createAuditSite({
      ...auditDeps,
      scanner: createSiteScanner({ loader }),
      rules: SITE_RULES,
    }),
    auditHtml: createAuditHtml({ ...auditDeps, analyzer: pageAnalyzer, rules: SITE_RULES }),
    auditCodebase: createAuditCodebase({
      ...auditDeps,
      scanner: createCodebaseReader(),
      rules: CODEBASE_RULES,
    }),
  });
  registerDocumentTools(server, createGenerateDocument({ templates: templates.value, clock }));

  return ok({ server, kbInfo });
}
