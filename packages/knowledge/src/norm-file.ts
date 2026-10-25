import { parse, stringify } from 'yaml';

import { normalizeLineEndings } from './hashing';

/**
 * Файл нормы (ADR-0003): YAML-заголовок между `---` и текст нормы.
 * Абзацы текста разделены пустой строкой; текст хранится ровно так, как хешируется.
 */
export interface NormFileContent {
  readonly data: unknown;
  readonly text: string;
}

const DELIMITER = '---';

/**
 * Простой текст, а не Markdown: разметка исказила бы закон — «1. …» стал бы нумерованным
 * списком (и его перенумеровали бы рендер и форматировщик), «- …» — маркером списка.
 */
export const NORM_FILE_EXTENSION = '.txt';

export function serializeNormFile(data: Readonly<Record<string, unknown>>, text: string): string {
  return `${DELIMITER}\n${stringify(data, { lineWidth: 0 })}${DELIMITER}\n\n${text}\n`;
}

/** Разбирает файл нормы; `undefined`, если заголовка нет или он не закрыт. */
export function parseNormFile(content: string): NormFileContent | undefined {
  const normalized = normalizeLineEndings(content);
  if (!normalized.startsWith(`${DELIMITER}\n`)) return undefined;

  const end = normalized.indexOf(`\n${DELIMITER}\n`, DELIMITER.length);
  if (end === -1) return undefined;

  const header = normalized.slice(DELIMITER.length + 1, end + 1);
  const body = normalized.slice(end + DELIMITER.length + 2);
  return { data: parse(header) as unknown, text: body.replace(/^\n/, '').replace(/\n$/, '') };
}
