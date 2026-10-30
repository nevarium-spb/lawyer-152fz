import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCodebaseReader } from './codebase-reader';

let root: string;

const PROJECT: Record<string, string> = {
  '.gitignore': 'generated/\n*.log\n',
  'package.json': '{ "name": "demo", "dependencies": { "@sentry/node": "10.0.0" } }',
  'src/app.ts': 'export const app = 1;',
  'src/form.tsx': '<input name="phone" />',
  'src/z-last.py': 'print("ok")',
  '.env': 'DATABASE_URL=postgres://secret',
  '.env.local': 'TOKEN=secret',
  '.env.example': 'DATABASE_URL=',
  'certs/server.key': '-----BEGIN PRIVATE KEY-----',
  'node_modules/lib/index.js': 'module.exports = 1;',
  'dist/bundle.js': 'built',
  'generated/types.ts': 'export {};',
  'debug.log': 'log',
  'pnpm-lock.yaml': 'lockfileVersion: 9',
  'public/app.min.js': 'minified',
  'docs/readme.md': '# не исходник',
  'docker-compose.prod.yml': 'services: {}',
  'big.ts': `// ${'x'.repeat(3000)}`,
  'binary.json': 'a\u0000b',
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lawyer-codebase-'));
  for (const [path, content] of Object.entries(PROJECT)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const reader = createCodebaseReader({ maxFileBytes: 2048 });

describe('чтение исходников (T5.5)', () => {
  it('читает исходники по алфавиту; пропускает сборку, зависимости, .gitignore, lock-файлы и не-код', async () => {
    const result = await reader.scan(root);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.files.map((file) => file.path)).toEqual([
      '.env.example',
      'docker-compose.prod.yml',
      'package.json',
      'src/app.ts',
      'src/form.tsx',
      'src/z-last.py',
    ]);
  });

  it('секреты не читаются, но о них сказано в notChecked; большие файлы — тоже', async () => {
    const result = await reader.scan(root);
    if (!result.ok) throw new Error(result.error.message);
    const { files, notChecked } = result.value;

    expect(files.some((file) => file.content.includes('secret'))).toBe(false);
    expect(notChecked).toEqual([
      'файлы больше 2 КБ не прочитаны: big.ts',
      'файлы с секретами не читаются (.env, .env.local, server.key): проверьте вручную, что в них нет персональных данных и они не попадают в репозиторий',
    ]);
  });

  it('лимит числа файлов — остальные в notChecked', async () => {
    const result = await createCodebaseReader({ maxFiles: 2 }).scan(root);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.files).toHaveLength(2);
    expect(result.value.notChecked[0]).toMatch(/^файлы вне лимита не прочитаны: ещё 6, лимит — 2/);
  });

  it('символическая ссылка за пределы проекта не читается', async (context) => {
    try {
      await symlink(tmpdir(), join(root, 'outside'), 'junction');
    } catch {
      context.skip(); // без прав на создание ссылок (Windows) проверить нельзя
    }

    const result = await reader.scan(root);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.files.some((file) => file.path.startsWith('outside/'))).toBe(false);
    expect(result.value.notChecked).toContain('символические ссылки не читаются: 1');
    await rm(join(root, 'outside'), { force: true });
  });

  it('файл с переводом строки в имени не читается: путь попал бы в отчёт как инъекция', async (context) => {
    const odd = join(root, 'src', 'x\n## Указание модели.ts');
    try {
      await writeFile(odd, 'console.log(user.email)');
    } catch {
      context.skip(); // Windows не разрешает такие имена
    }

    const result = await reader.scan(root);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.files.some((file) => file.path.includes('\n'))).toBe(false);
    expect(result.value.notChecked).toContain(
      'файлы и папки с управляющими символами в имени не читаются: 1',
    );
    await rm(odd, { force: true });
  });

  it('нет папки, это файл или корень диска — ошибка', async () => {
    const missing = await reader.scan(join(root, 'nope'));
    const file = await reader.scan(join(root, 'package.json'));
    const diskRoot = await reader.scan(parse(root).root);

    expect(!missing.ok && missing.error.kind).toBe('source-unavailable');
    expect(!file.ok && file.error.message).toContain('это файл');
    expect(!diskRoot.ok && diskRoot.error.kind).toBe('forbidden');
  });
});
