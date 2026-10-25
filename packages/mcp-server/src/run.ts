import type { KnowledgeFile } from '@lawyer-152fz/knowledge';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { composeServer } from './compose';
import { loadConfig } from './config';

/**
 * Запуск по stdio. stdout занят протоколом MCP — диагностика только в stderr.
 * Некорректная база или конфигурация — немедленный выход с понятной причиной.
 */
export async function runStdioServer(files: readonly KnowledgeFile[]): Promise<void> {
  const config = loadConfig(process.env);
  if (!config.ok) fail(config.error.message, config.error.issues);

  const composed = composeServer(files);
  if (!composed.ok) fail(composed.error.message, composed.error.issues);

  await composed.value.server.connect(new StdioServerTransport());
}

function fail(message: string, issues: readonly { path: string; message: string }[]): never {
  console.error(`lawyer-152fz: ${message}`);
  for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
  process.exit(1);
}
