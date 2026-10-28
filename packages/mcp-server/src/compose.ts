import {
  createAuditCodebase,
  createAuditHtml,
  createAuditSite,
  createLookupNorms,
  err,
  ok,
} from '@lawyer-152fz/core';
import type { Clock, Result, SourceFreshnessChecker, ValidationError } from '@lawyer-152fz/core';
import { buildKnowledgeBase, createNormRepository } from '@lawyer-152fz/knowledge';
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
import { describeKnowledgeBase, registerKbInfo } from './kb-info';
import type { KbInfo } from './kb-info';
import { SERVER_INSTRUCTIONS } from './instructions';
import { registerNormTools } from './tools';
import { SERVER_NAME, SERVER_VERSION } from './version';

/** До T6.6 актуальность не проверяется — честно «неизвестно», а не «актуально» (ADR-0003). */
const pendingFreshness = (clock: Clock): SourceFreshnessChecker => ({
  check: (norm) =>
    Promise.resolve({
      id: norm.id,
      status: 'unknown',
      checkedAt: clock.now().toISOString(),
      detail: 'Проверка актуальности по официальному источнику появится в версии 0.3',
    }),
});

const systemClock: Clock = { now: () => new Date() };

export interface ComposedServer {
  readonly server: McpServer;
  readonly kbInfo: KbInfo;
}

/**
 * Точка сборки (ADR-0002): база норм → репозиторий → сценарии ядра → MCP-инструменты.
 * Единственное место, которое знает обо всех пакетах сразу.
 */
export interface ComposeOptions {
  /** Разрешить аудит адресов частных сетей (свой localhost в плагине); в боте — false (ADR-0006). */
  readonly allowPrivateNetworks?: boolean;
  /** Подмена загрузчика страниц — для тестов без сети. */
  readonly pageLoader?: PageLoader;
}

export function composeServer(
  files: readonly KnowledgeFile[],
  clock: Clock = systemClock,
  options: ComposeOptions = {},
): Result<ComposedServer, ValidationError> {
  const knowledgeBase = buildKnowledgeBase(files);
  if (!knowledgeBase.ok) return err(knowledgeBase.error);

  const norms = createNormRepository(knowledgeBase.value);
  const lookup = createLookupNorms({ norms, freshness: pendingFreshness(clock), clock });
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

  return ok({ server, kbInfo });
}
