import { err, normSchema, ok, parseWith, validationError } from '@lawyer-152fz/core';
import type { Norm, Result, ValidationError, ValidationIssue } from '@lawyer-152fz/core';

import { actMetaSchema } from './act-meta';
import type { ActMeta } from './act-meta';
import { sha256 } from './hashing';
import { NORM_FILE_EXTENSION, parseNormFile } from './norm-file';
import { findNumberingProblem, splitNumbered } from './structure';

/** Файл базы: путь относительно `data/` с прямыми слешами и содержимое. */
export interface KnowledgeFile {
  readonly path: string;
  readonly content: string;
}

export interface KnowledgeBase {
  readonly acts: readonly ActMeta[];
  /** Все нормы: статьи, их части и пункты постановлений. */
  readonly norms: readonly Norm[];
  /** Версия базы по дате последней сверки, например `kb-2026.10.25`. */
  readonly kbVersion: string;
}

/**
 * Собирает базу из файлов `data/` (чистая функция — без I/O, пригодна для бандла).
 * Все проблемы собираются за один проход, с указанием файла.
 */
export function buildKnowledgeBase(
  files: readonly KnowledgeFile[],
): Result<KnowledgeBase, ValidationError> {
  const issues: ValidationIssue[] = [];
  const acts = new Map<string, ActMeta>();
  const norms = new Map<string, Norm>();

  const addIssue = (path: string, message: string) => issues.push({ path, message });
  const addNorm = (path: string, norm: Norm) => {
    if (norms.has(norm.id)) addIssue(path, `повтор идентификатора нормы ${norm.id}`);
    else norms.set(norm.id, norm);
  };

  for (const file of files.filter((f) => f.path.endsWith('/act.json'))) {
    const meta = parseWith(actMetaSchema, safeJson(file.content), 'act.json некорректен');
    if (!meta.ok) meta.error.issues.forEach((i) => addIssue(file.path, `${i.path}: ${i.message}`));
    else if (actDirOf(file.path) !== meta.value.id)
      addIssue(file.path, `id «${meta.value.id}» не совпадает с каталогом`);
    else acts.set(meta.value.id, meta.value);
  }

  for (const file of files.filter((f) => f.path.endsWith(NORM_FILE_EXTENSION))) {
    const parsed = parseNormFile(file.content);
    if (!parsed) {
      addIssue(file.path, 'нет YAML-заголовка между строками ---');
      continue;
    }

    // Справочные пометки портала (`notes`) в норму не входят: схема отбрасывает незнакомые поля.
    const norm = parseWith(normSchema, { ...asRecord(parsed.data), text: parsed.text }, '');
    if (!norm.ok) {
      norm.error.issues.forEach((i) => addIssue(file.path, `${i.path}: ${i.message}`));
      continue;
    }

    const article = norm.value;
    const act = acts.get(article.act);
    if (actDirOf(file.path) !== article.act) {
      addIssue(file.path, `акт «${article.act}» не совпадает с каталогом`);
      continue;
    }
    if (!act) {
      addIssue(file.path, `нет корректного act.json для акта «${article.act}»`);
      continue;
    }
    if (sha256(article.text) !== article.sha256) {
      addIssue(file.path, 'sha256 не совпадает с текстом: файл изменён вручную или повреждён');
      continue;
    }

    addNorm(file.path, article);
    if (act.kind === 'decree') continue;

    const parts = splitNumbered(article.text);
    const problem = findNumberingProblem(parts);
    if (problem) addIssue(file.path, problem);

    for (const part of parts) {
      addNorm(file.path, {
        ...article,
        id: `${article.id}/part-${part.number}` as Norm['id'],
        heading: `${article.heading}, часть ${part.number}`,
        text: part.text,
        sha256: sha256(part.text),
      });
    }
  }

  if (norms.size === 0) addIssue('data/', 'база норм пуста');
  if (issues.length > 0) return err(validationError('База норм некорректна', issues));

  const allNorms = [...norms.values()];
  const lastVerified =
    allNorms
      .map((n) => n.verifiedAt)
      .sort()
      .at(-1) ?? '';
  return ok({
    acts: [...acts.values()],
    norms: allNorms,
    kbVersion: `kb-${lastVerified.replaceAll('-', '.')}`,
  });
}

const actDirOf = (path: string): string => path.split('/')[0] ?? '';

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
