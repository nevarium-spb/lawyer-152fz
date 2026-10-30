import type { Dirent } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, extname, join, parse } from 'node:path';

import { err, forbidden, ok, sourceUnavailable } from '@lawyer-152fz/core';
import type { CodebaseScanner, SourceFile } from '@lawyer-152fz/core';
import ignore from 'ignore';

export const MAX_FILES = 2000;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/** Сборка, зависимости, кэши — не исходники проекта. */
const SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.vercel',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'bin',
  'obj',
]);

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.vue',
  '.svelte',
  '.astro',
  '.py',
  '.php',
  '.rb',
  '.go',
  '.java',
  '.kt',
  '.cs',
  '.html',
  '.htm',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.conf',
  '.cfg',
  '.tf',
  '.sql',
  '.properties',
  '.xml',
  '.sh',
  '.prisma',
]);
const TEXT_FILE_NAMES = new Set([
  'Dockerfile',
  'requirements.txt',
  'Gemfile',
  'go.mod',
  'Procfile',
]);
const ENV_TEMPLATES = new Set(['.env.example', '.env.sample', '.env.template']);
const LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'composer.lock',
  'poetry.lock',
  'Gemfile.lock',
  'go.sum',
]);

const CONTROL_CHARS = /\p{Cc}/u;

/** Файлы с секретами не читаем никогда: их содержимое не должно попасть в контекст модели (ADR-0006). */
const isSecretFile = (name: string) =>
  (/^\.env(?:\..+)?$/.test(name) && !ENV_TEMPLATES.has(name)) ||
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(name) ||
  /^id_(?:rsa|ed25519|ecdsa)/.test(name);

const isSourceFile = (name: string) =>
  !LOCKFILES.has(name) &&
  !/\.min\.(?:js|css)$/.test(name) &&
  (TEXT_EXTENSIONS.has(extname(name).toLowerCase()) ||
    TEXT_FILE_NAMES.has(name) ||
    ENV_TEMPLATES.has(name) ||
    /^docker-compose.*\.ya?ml$/.test(name));

export interface CodebaseReaderLimits {
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
  readonly maxTotalBytes?: number;
}

/**
 * Чтение исходников проекта для аудита (T5.5). Только чтение: в проект ничего не пишется (ADR-0006).
 * Учитывает корневой `.gitignore`, пропускает сборку, зависимости, секреты и бинарные файлы;
 * обход детерминирован (имена по алфавиту), символические ссылки не читаются.
 */
export function createCodebaseReader(limits: CodebaseReaderLimits = {}): CodebaseScanner {
  const maxFiles = limits.maxFiles ?? MAX_FILES;
  const maxFileBytes = limits.maxFileBytes ?? MAX_FILE_BYTES;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_TOTAL_BYTES;

  return {
    async scan(path) {
      let root: string;
      try {
        root = await realpath(path);
        if (!(await stat(root)).isDirectory()) {
          return err(sourceUnavailable(path, 'это файл, а не папка проекта'));
        }
      } catch {
        return err(sourceUnavailable(path, 'папка не найдена или недоступна'));
      }
      if (parse(root).root === root) {
        return err(forbidden(`корень диска ${root} — укажите папку проекта`));
      }

      const ignored = ignore();
      try {
        ignored.add(await readFile(join(root, '.gitignore'), 'utf8'));
      } catch {
        // .gitignore нет — читаем всё, кроме стандартных исключений
      }

      const files: SourceFile[] = [];
      const tooLarge: string[] = [];
      const secrets: string[] = [];
      let overLimit = 0;
      let totalBytes = 0;
      let symlinks = 0;
      let oddNames = 0;
      let unreadable = 0;

      const walk = async (dir: string, relDir: string): Promise<void> => {
        let entries: Dirent[];
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

        for (const entry of entries) {
          const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
          // Путь стоит в отчёте вне пометки «данные цели аудита»: имя с переводом строки — канал инъекции.
          if (CONTROL_CHARS.test(entry.name)) {
            oddNames++;
            continue;
          }
          if (entry.isSymbolicLink()) {
            symlinks++;
            continue;
          }
          if (entry.isDirectory()) {
            if (!SKIPPED_DIRS.has(entry.name) && !ignored.ignores(`${rel}/`)) {
              await walk(join(dir, entry.name), rel);
            }
            continue;
          }
          if (!entry.isFile() || ignored.ignores(rel)) continue;
          if (isSecretFile(entry.name)) {
            secrets.push(rel);
            continue;
          }
          if (!isSourceFile(entry.name)) continue;

          const full = join(dir, entry.name);
          let size: number;
          try {
            ({ size } = await stat(full));
          } catch {
            unreadable++;
            continue;
          }
          if (size > maxFileBytes) {
            tooLarge.push(rel);
            continue;
          }
          if (files.length >= maxFiles || totalBytes + size > maxTotalBytes) {
            overLimit++;
            continue;
          }
          let content: string;
          try {
            content = await readFile(full, 'utf8');
          } catch {
            unreadable++;
            continue;
          }
          if (content.includes('\u0000')) continue;
          totalBytes += size;
          files.push({ path: rel, content });
        }
      };
      await walk(root, '');

      const notChecked: string[] = [];
      if (overLimit > 0) {
        notChecked.push(
          `файлы вне лимита не прочитаны: ещё ${String(overLimit)}, лимит — ${String(maxFiles)} файлов или ${String(Math.round(maxTotalBytes / 1024 / 1024))} МБ`,
        );
      }
      if (tooLarge.length > 0) {
        notChecked.push(
          `файлы больше ${String(Math.round(maxFileBytes / 1024))} КБ не прочитаны: ${tooLarge.slice(0, 10).join(', ')}${tooLarge.length > 10 ? ' и др.' : ''}`,
        );
      }
      if (secrets.length > 0) {
        notChecked.push(
          `файлы с секретами не читаются (${secrets
            .slice(0, 5)
            .map((file) => basename(file))
            .join(', ')}): ` +
            'проверьте вручную, что в них нет персональных данных и они не попадают в репозиторий',
        );
      }
      if (symlinks > 0) notChecked.push(`символические ссылки не читаются: ${String(symlinks)}`);
      if (oddNames > 0) {
        notChecked.push(
          `файлы и папки с управляющими символами в имени не читаются: ${String(oddNames)}`,
        );
      }
      if (unreadable > 0) notChecked.push(`нет доступа к файлам: ${String(unreadable)}`);

      return ok({ rootPath: root, files, notChecked });
    },
  };
}
