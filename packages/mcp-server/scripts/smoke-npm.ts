/**
 * Пробная установка npm-пакета (T8.1): пакуем `dist/npm` как это сделает `npm publish`, проверяем
 * состав tarball, ставим его в пустой проект и запускаем установленный сервер по stdio — так,
 * как это сделает клиент после `npx -y @lawyer-152fz/mcp-server`. В реестр ничего не уходит.
 */
import { execSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const npmDir = fileURLToPath(new URL('../../../dist/npm', import.meta.url));
const PACKAGE_DIR = ['node_modules', '@lawyer-152fz', 'mcp-server'];
const EXPECTED_FILES = ['LICENSE', 'README.md', 'index.mjs', 'package.json'];
const EXPECTED_TOOLS =
  'search_norms, get_norm, check_norm_freshness, audit_site, audit_html, audit_codebase, list_document_templates, render_document, verify_answer';

const say = (line: string) => process.stdout.write(`${line}\n`);
function fail(message: string): never {
  throw new Error(`Проверка npm-пакета не пройдена: ${message}`);
}

await readFile(join(npmDir, 'package.json')).catch(() =>
  fail(`нет ${npmDir} — запустите pnpm build:npm`),
);

const work = await mkdtemp(join(tmpdir(), 'lawyer-152fz-npm-'));
try {
  const [packed] = JSON.parse(
    execSync(`npm pack --json --pack-destination "${work}"`, { cwd: npmDir, encoding: 'utf8' }),
  ) as { filename: string; files: { path: string }[] }[];
  if (!packed) fail('npm pack ничего не вернул');
  const files = packed.files.map((file) => file.path).sort();
  if (files.join() !== EXPECTED_FILES.join()) {
    fail(`в tarball лежит ${files.join(', ')}, ожидалось ${EXPECTED_FILES.join(', ')}`);
  }
  say(`✔ Tarball ${packed.filename}: ${files.join(', ')}`);

  const app = join(work, 'app');
  await mkdir(app);
  await writeFile(join(app, 'package.json'), '{ "private": true }\n');
  execSync(`npm install "${join(work, packed.filename)}" --no-audit --no-fund --ignore-scripts`, {
    cwd: app,
    stdio: 'pipe',
  });
  const installed = join(app, ...PACKAGE_DIR);

  const entry = await readFile(join(installed, 'index.mjs'), 'utf8');
  if (!entry.startsWith('#!/usr/bin/env node\n')) fail('в index.mjs нет shebang');
  const bins = await readdir(join(app, 'node_modules', '.bin'));
  if (!bins.some((name) => name.startsWith('lawyer-152fz-mcp'))) {
    fail(`команда lawyer-152fz-mcp не создана, в .bin: ${bins.join(', ')}`);
  }
  say('✔ Установка из tarball: команда создана, shebang на месте');

  const client = new Client({ name: 'lawyer-152fz-npm-smoke', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(installed, 'index.mjs')],
      stderr: 'inherit',
    }),
  );
  try {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).join(', ');
    if (names !== EXPECTED_TOOLS) fail(`неожиданный набор инструментов: ${names}`);
    const norm = await client.callTool({ name: 'get_norm', arguments: { id: '152-fz/art-9' } });
    if (norm.isError) fail('get_norm вернул ошибку');
  } finally {
    await client.close();
  }
  say('✔ Установленный сервер отвечает по stdio');
} finally {
  await rm(work, { recursive: true, force: true });
}
