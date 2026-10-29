import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEMPLATE_FILE_EXTENSION } from './templates';
import type { TemplateFile } from './templates';

/** Каталог шаблонов пакета. */
export const TEMPLATES_DIR = fileURLToPath(new URL('../templates', import.meta.url));

/** Читает файлы шаблонов из каталога — для запуска из исходников и для сборки бандла. */
export async function readTemplateFiles(dir: string = TEMPLATES_DIR): Promise<TemplateFile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(TEMPLATE_FILE_EXTENSION));
  return Promise.all(
    names.map(async (name) => ({ path: name, content: await readFile(join(dir, name), 'utf8') })),
  );
}
