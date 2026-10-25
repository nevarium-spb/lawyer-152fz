import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Result, ValidationError } from '@lawyer-152fz/core';

import { buildKnowledgeBase } from './knowledge-base';
import type { KnowledgeBase, KnowledgeFile } from './knowledge-base';

/** Каталог с корпусом норм пакета. */
export const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url));

/** Читает все файлы базы из каталога (`act.json` и `*.md`). */
export async function readKnowledgeFiles(dir: string = DATA_DIR): Promise<KnowledgeFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && (entry.name === 'act.json' || entry.name.endsWith('.md')))
    .map((entry) => join(entry.parentPath, entry.name));

  return Promise.all(
    files.map(async (file) => ({
      path: file.slice(dir.length + 1).replaceAll('\\', '/'),
      content: await readFile(file, 'utf8'),
    })),
  );
}

export async function loadKnowledgeBase(
  dir: string = DATA_DIR,
): Promise<Result<KnowledgeBase, ValidationError>> {
  return buildKnowledgeBase(await readKnowledgeFiles(dir));
}
