/**
 * Дымовая проверка бандла (T3.4): запускаем его как настоящий процесс по stdio — так,
 * как это делает Claude Code, — и проверяем время старта и ответы инструментов.
 */
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** Требование ARCHITECTURE.md §9: старт MCP-сервера < 1 с. */
const MAX_STARTUP_MS = 1000;

const bundlePath = fileURLToPath(
  new URL('../../../plugins/lawyer-152fz/server/index.mjs', import.meta.url),
);
const say = (line: string) => process.stdout.write(`${line}\n`);
const fail = (message: string): never => {
  throw new Error(`Дымовая проверка не пройдена: ${message}`);
};

const { size } = await stat(bundlePath).catch(() =>
  fail(`нет бандла ${bundlePath} — запустите pnpm build:server`),
);

const startedAt = performance.now();
const client = new Client({ name: 'lawyer-152fz-smoke', version: '0.0.0' });
await client.connect(
  new StdioClientTransport({ command: process.execPath, args: [bundlePath], stderr: 'inherit' }),
);
const startupMs = Math.round(performance.now() - startedAt);

try {
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).join(', ');
  const expected =
    'search_norms, get_norm, check_norm_freshness, audit_site, audit_html, audit_codebase, list_document_templates, render_document';
  if (names !== expected) fail(`неожиданный набор инструментов: ${names}`);

  const search = await client.callTool({
    name: 'search_norms',
    arguments: { text: 'согласие на распространение', limit: 1 },
  });
  if (search.isError) fail('search_norms вернул ошибку');

  const norm = await client.callTool({ name: 'get_norm', arguments: { id: '152-fz/art-9' } });
  if (norm.isError) fail('get_norm вернул ошибку');

  // Шаблоны вшиты в бандл: пустой профиль даёт список недостающих полей, а не падение.
  const document = await client.callTool({
    name: 'render_document',
    arguments: { templateId: 'privacy-policy', profile: {} },
  });
  const documentText = (document.content as { text?: string }[])[0]?.text ?? '';
  if (!documentText.includes('- inn: ')) fail('render_document не перечислил недостающие поля');
} finally {
  await client.close();
}

say(
  `✔ Бандл ${(size / 1024 / 1024).toFixed(2)} МБ, старт ${String(startupMs)} мс, инструменты отвечают`,
);
if (startupMs > MAX_STARTUP_MS)
  fail(`старт ${String(startupMs)} мс дольше ${String(MAX_STARTUP_MS)} мс`);
