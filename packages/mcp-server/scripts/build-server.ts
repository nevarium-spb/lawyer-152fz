/**
 * Сборка MCP-сервера в один файл для плагина (T3.4, ADR-0005).
 * База норм и шаблоны документов проверяются и вшиваются через `define`: бандлу не нужны
 * ни диск, ни сеть.
 */
import { mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDocumentTemplates, readTemplateFiles } from '@lawyer-152fz/documents';
import { buildKnowledgeBase, readKnowledgeFiles } from '@lawyer-152fz/knowledge';
import { build } from 'esbuild';

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

export const BUNDLE_PATH = fromRoot('plugins/lawyer-152fz/server/index.mjs');
const ENTRY = fromRoot('packages/mcp-server/src/bundle-entry.ts');

const files = await readKnowledgeFiles();
const knowledgeBase = buildKnowledgeBase(files);
if (!knowledgeBase.ok) {
  throw new Error(`База норм некорректна — сборка остановлена: ${knowledgeBase.error.message}`);
}

const templateFiles = await readTemplateFiles();
const templates = createDocumentTemplates(templateFiles);
if (!templates.ok) {
  const issues = templates.error.issues.map((issue) => `${issue.path}: ${issue.message}`);
  throw new Error(`Шаблоны некорректны — сборка остановлена:\n${issues.join('\n')}`);
}

await mkdir(dirname(BUNDLE_PATH), { recursive: true });
await build({
  entryPoints: [ENTRY],
  outfile: BUNDLE_PATH,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  define: {
    __EMBEDDED_KNOWLEDGE_FILES__: JSON.stringify(files),
    __EMBEDDED_TEMPLATE_FILES__: JSON.stringify(templateFiles),
  },
  // CJS-зависимости (стеммер) внутри ESM-бандла вызывают require — даём его.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  legalComments: 'eof',
  logLevel: 'warning',
});

const { size } = await stat(BUNDLE_PATH);
process.stdout.write(
  `✔ Бандл ${BUNDLE_PATH}: ${(size / 1024 / 1024).toFixed(2)} МБ, база ${knowledgeBase.value.kbVersion} (${String(knowledgeBase.value.norms.length)} норм), шаблонов: ${String(templates.value.list().length)}\n`,
);
