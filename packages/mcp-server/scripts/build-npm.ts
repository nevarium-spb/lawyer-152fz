/**
 * Сборка npm-пакета `@lawyer-152fz/mcp-server` (T8.1, ADR-0005): тот же бандл, что у плагина,
 * плюс манифест для npm. Исходный пакет в монорепозитории остаётся `private` — публикуется
 * только собранная папка `dist/npm`, в которой нет ни workspace-зависимостей, ни исходников.
 */
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const fromPackage = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const NPM_DIR = fromRoot('dist/npm');
const BUNDLE_PATH = fromRoot('plugins/lawyer-152fz/server/index.mjs');
const REPOSITORY = 'https://github.com/nevarium-spb/lawyer-152fz';

/** Имя команды, которую npm кладёт в `node_modules/.bin`; `npx` запускает единственный bin сам. */
const BIN_NAME = 'lawyer-152fz-mcp';

const source = JSON.parse(await readFile(fromPackage('package.json'), 'utf8')) as {
  name: string;
  version: string;
  license: string;
};

const bundle = await readFile(BUNDLE_PATH, 'utf8').catch(() => {
  throw new Error(`Нет бандла ${BUNDLE_PATH} — сначала запустите pnpm build:server`);
});

await rm(NPM_DIR, { recursive: true, force: true });
await mkdir(NPM_DIR, { recursive: true });

// Без shebang npm не сделает bin исполняемым на Linux и macOS. Сам бандл плагина не меняем.
await writeFile(`${NPM_DIR}/index.mjs`, `#!/usr/bin/env node\n${bundle}`);
await copyFile(fromRoot('LICENSE'), `${NPM_DIR}/LICENSE`);
await copyFile(fromPackage('npm/README.md'), `${NPM_DIR}/README.md`);

const manifest = {
  name: source.name,
  version: source.version,
  description:
    'MCP-сервер по 152-ФЗ «О персональных данных» и работе с Роскомнадзором: нормы с датами редакций, аудит сайта и кода, шаблоны документов.',
  license: source.license,
  type: 'module',
  bin: { [BIN_NAME]: './index.mjs' },
  files: ['index.mjs', 'README.md', 'LICENSE'],
  engines: { node: '>=26' },
  keywords: ['mcp', '152-фз', 'персональные данные', 'роскомнадзор', 'compliance'],
  repository: { type: 'git', url: `git+${REPOSITORY}.git` },
  homepage: `${REPOSITORY}#readme`,
  bugs: { url: `${REPOSITORY}/issues` },
  publishConfig: { access: 'public', provenance: true },
};
await writeFile(`${NPM_DIR}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);

const { size } = await stat(`${NPM_DIR}/index.mjs`);
process.stdout.write(
  `✔ npm-пакет ${manifest.name}@${manifest.version} собран в ${NPM_DIR}: ${(size / 1024 / 1024).toFixed(2)} МБ\n`,
);
