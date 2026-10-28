import { toExcerpt } from '@lawyer-152fz/core';
import type { Evidence, SourceFile } from '@lawyer-152fz/core';

/** Сколько строк показывать в доказательствах одной находки. */
export const MAX_EVIDENCE = 5;
const EXCERPT = 200;

export interface LineMatch {
  readonly file: SourceFile;
  /** Номер строки с единицы. */
  readonly line: number;
  readonly text: string;
}

/** Строки файла, подходящие под условие. */
export function matchingLines(file: SourceFile, test: (line: string) => boolean): LineMatch[] {
  return file.content
    .split(/\r?\n/)
    .flatMap((text, index) => (test(text) ? [{ file, line: index + 1, text }] : []));
}

export function fileEvidence({ file, line, text }: LineMatch): Evidence {
  return { type: 'file', path: file.path, line, untrustedExcerpt: toExcerpt(text, EXCERPT) };
}

const CODE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py|php|rb|go|java|kt|cs)$/;

/** Файл с программным кодом (не конфигурация и не разметка). */
export const isCode = (file: SourceFile) => CODE_EXTENSIONS.test(file.path);

/** « — в 3 файлах», если проблема повторяется. */
export function inFiles(count: number): string {
  return count > 1 ? ` — в ${String(count)} файлах` : '';
}
