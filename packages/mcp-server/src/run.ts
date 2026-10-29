import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { composeServer } from './compose';
import type { ServerAssets } from './compose';
import { loadConfig } from './config';

/**
 * Запуск по stdio. stdout занят протоколом MCP — диагностика только в stderr.
 * Некорректная база, шаблоны или конфигурация — немедленный выход с понятной причиной.
 */
export async function runStdioServer(assets: ServerAssets): Promise<void> {
  const config = loadConfig(process.env);
  if (!config.ok) fail(config.error.message, config.error.issues);

  const composed = composeServer(assets, undefined, {
    allowPrivateNetworks: config.value.allowPrivateNetworks,
  });
  if (!composed.ok) fail(composed.error.message, composed.error.issues);

  await composed.value.server.connect(new StdioServerTransport());
}

function fail(message: string, issues: readonly { path: string; message: string }[]): never {
  console.error(`lawyer-152fz: ${message}`);
  for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
  process.exit(1);
}
