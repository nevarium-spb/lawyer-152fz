/**
 * Дымовая проверка бандла (T3.4) и бюджеты производительности (T7.3): запускаем бандл как настоящий
 * процесс по stdio — так, как это делает Claude Code, — проверяем ответы инструментов и меряем
 * старт, аудит сайта, аудит кода и размер бандла. В CI метрики попадают в сводку job.
 */
import { appendFile, readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** Бюджеты ARCHITECTURE.md §9. */
const MAX_STARTUP_MS = 1000;
const MAX_SITE_AUDIT_MS = 30_000;
const MAX_CODEBASE_AUDIT_MS = 10_000;
const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;

/** Сайт для замера: главная и 10 страниц из HTML-фикстур сканера, каждая отвечает с задержкой «сети». */
const SITE_PAGES = 10;
const PAGE_LATENCY_MS = 150;

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const bundlePath = fromRoot('plugins/lawyer-152fz/server/index.mjs');
const say = (line: string) => process.stdout.write(`${line}\n`);
const fail = (message: string): never => {
  throw new Error(`Дымовая проверка не пройдена: ${message}`);
};

async function timed(action: () => Promise<void>): Promise<number> {
  const started = performance.now();
  await action();
  return Math.round(performance.now() - started);
}

/**
 * Локальный сайт: главная со ссылками на /p01…/p10, страницы — фикстуры сканера 01…10. Фикстуры
 * ссылаются на /policy, /contacts и т. п. — такие адреса отдают простую страницу, а не 404.
 */
async function startFixtureSite(): Promise<{ url: string; close: () => void }> {
  const fixtures = fromRoot('packages/scanner/test/fixtures/html');
  const fixtureNames = (await readdir(fixtures))
    .filter((name) => name.endsWith('.html'))
    .sort()
    .slice(0, SITE_PAGES);
  if (fixtureNames.length < SITE_PAGES) fail(`в ${fixtures} меньше ${String(SITE_PAGES)} фикстур`);

  const pages = new Map<string, string>();
  const links = fixtureNames.map((_, index) => `/p${String(index + 1).padStart(2, '0')}`);
  pages.set(
    '/',
    `<h1>Магазин</h1>${links.map((path) => `<a href="${path}">${path}</a>`).join(' ')}`,
  );
  for (const [index, name] of fixtureNames.entries()) {
    pages.set(links[index] ?? '', await readFile(`${fixtures}/${name}`, 'utf8'));
  }

  const server = createServer((request, response) => {
    const html = pages.get(request.url ?? '');
    void sleep(PAGE_LATENCY_MS).then(() => {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
      });
      response.end(html ?? '<h1>Страница сайта</h1>');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${String(port)}/`, close: () => server.close() };
}

const { size } = await stat(bundlePath).catch(() =>
  fail(`нет бандла ${bundlePath} — запустите pnpm build:server`),
);

const startedAt = performance.now();
const client = new Client({ name: 'lawyer-152fz-smoke', version: '0.0.0' });
await client.connect(
  new StdioClientTransport({ command: process.execPath, args: [bundlePath], stderr: 'inherit' }),
);
const startupMs = Math.round(performance.now() - startedAt);

let siteAuditMs: number;
let codebaseAuditMs: number;
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

  const site = await startFixtureSite();
  try {
    siteAuditMs = await timed(async () => {
      const audit = await client.callTool({
        name: 'audit_site',
        arguments: { url: site.url, maxPages: SITE_PAGES + 1 },
      });
      if (audit.isError) fail('audit_site вернул ошибку');
      const notChecked = (audit.structuredContent as { notChecked?: string[] }).notChecked ?? [];
      const failed = notChecked.filter((line) => line.includes('недоступен'));
      if (failed.length > 0) fail(`audit_site не загрузил страницы: ${failed.join('; ')}`);
    });
  } finally {
    site.close();
  }

  codebaseAuditMs = await timed(async () => {
    const audit = await client.callTool({
      name: 'audit_codebase',
      arguments: { path: fromRoot('packages') },
    });
    if (audit.isError) fail('audit_codebase вернул ошибку');
  });
} finally {
  await client.close();
}

const metrics = [
  ['Старт MCP-сервера', startupMs, MAX_STARTUP_MS],
  [`Аудит сайта, ${String(SITE_PAGES + 1)} страниц`, siteAuditMs, MAX_SITE_AUDIT_MS],
  ['Аудит кода (packages/)', codebaseAuditMs, MAX_CODEBASE_AUDIT_MS],
  ['Размер бандла', size, MAX_BUNDLE_BYTES],
] as const;
const show = (name: string, value: number) =>
  name === 'Размер бандла' ? `${(value / 1024 / 1024).toFixed(2)} МБ` : `${String(value)} мс`;

say('✔ Инструменты отвечают');
for (const [name, value, budget] of metrics) {
  say(
    `${value <= budget ? '✔' : '✖'} ${name}: ${show(name, value)} (бюджет ${show(name, budget)})`,
  );
}

const summary = process.env['GITHUB_STEP_SUMMARY'];
if (summary) {
  const rows = metrics.map(
    ([name, value, budget]) =>
      `| ${name} | ${show(name, value)} | ${show(name, budget)} | ${value <= budget ? '✅' : '❌'} |`,
  );
  const os = `${process.platform}, Node ${process.version}`;
  await appendFile(
    summary,
    [
      `### Производительность (T7.3) — ${os}`,
      '',
      '| Метрика | Значение | Бюджет | |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
      '',
    ].join('\n'),
  );
}

const over = metrics.filter(([, value, budget]) => value > budget);
if (over.length > 0) {
  fail(
    over
      .map(([name, value, budget]) => `${name} ${show(name, value)} больше ${show(name, budget)}`)
      .join('; '),
  );
}
