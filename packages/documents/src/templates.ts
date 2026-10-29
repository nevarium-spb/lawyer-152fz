import {
  err,
  normIdSchema,
  notFound,
  ok,
  operatorProfileSchema,
  PROFILE_SECTIONS,
  profileSectionFields,
  validationError,
} from '@lawyer-152fz/core';
import type {
  DocumentTemplates,
  OperatorProfileInput,
  ProfileSection,
  RenderContext,
  Result,
  TemplateInfo,
  ValidationError,
} from '@lawyer-152fz/core';
import { parse } from 'yaml';
import { z } from 'zod';

import { FULL_REFERENCE_PROFILE, MINIMAL_REFERENCE_PROFILE } from './reference-profiles';
import { compileTemplate, renderTemplate } from './renderer';
import type { CompiledTemplate } from './renderer';
import { buildView } from './view';

/** Файл шаблона: `<id>.md` с YAML-заголовком между строками `---` (ADR-0013). */
export interface TemplateFile {
  readonly path: string;
  readonly content: string;
}

export const TEMPLATE_FILE_EXTENSION = '.md';

const metaSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  normRefs: z.array(normIdSchema).min(1),
  requires: z.array(z.enum(PROFILE_SECTIONS)).default([]),
});

const TEMPLATE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n\n?/;
const REFERENCE_CONTEXT: RenderContext = { date: '2026-11-02' };

interface LoadedTemplate {
  readonly info: TemplateInfo;
  readonly compiled: CompiledTemplate;
}

/**
 * Эталонный профиль для шаблона: поля объявленных разделов — из полного эталона,
 * необъявленных — убраны, чтобы метка раздела без `requires` была ошибкой загрузки.
 */
export function referenceProfileFor(
  base: OperatorProfileInput,
  requires: readonly ProfileSection[],
): OperatorProfileInput {
  const profile: Record<string, unknown> = { ...base };
  for (const section of PROFILE_SECTIONS) {
    for (const field of profileSectionFields(section)) {
      profile[field] = requires.includes(section)
        ? (profile[field] ?? FULL_REFERENCE_PROFILE[field as keyof OperatorProfileInput])
        : undefined;
    }
  }
  return profile as OperatorProfileInput;
}

function loadTemplate(file: TemplateFile): Result<LoadedTemplate, string> {
  const id = file.path.slice(0, -TEMPLATE_FILE_EXTENSION.length);
  if (!file.path.endsWith(TEMPLATE_FILE_EXTENSION) || !TEMPLATE_ID.test(id)) {
    return err('имя файла — латиница в нижнем регистре через дефис и расширение .md');
  }

  const content = file.content.replaceAll('\r\n', '\n');
  const frontMatter = FRONT_MATTER.exec(content);
  if (!frontMatter) return err('нет YAML-заголовка между строками ---');

  const meta = metaSchema.safeParse(parse(frontMatter[1] ?? ''));
  if (!meta.success) {
    return err(meta.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }

  try {
    const compiled = compileTemplate(content.slice(frontMatter[0].length));
    for (const base of [FULL_REFERENCE_PROFILE, MINIMAL_REFERENCE_PROFILE]) {
      const reference = operatorProfileSchema.parse(referenceProfileFor(base, meta.data.requires));
      renderTemplate(compiled, buildView(reference, REFERENCE_CONTEXT));
    }
    return ok({ info: { id, ...meta.data }, compiled });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Загружает шаблоны и проверяет каждый: заголовок, синтаксис, все метки — на эталонных профилях
 * с объявленными разделами и без них. Ошибки всех файлов собираются разом.
 */
export function createDocumentTemplates(
  files: readonly TemplateFile[],
): Result<DocumentTemplates, ValidationError> {
  const loaded: LoadedTemplate[] = [];
  const issues: { path: string; message: string }[] = [];
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const result = loadTemplate(file);
    if (result.ok) loaded.push(result.value);
    else issues.push({ path: file.path, message: result.error });
  }
  if (issues.length > 0) return err(validationError('Шаблоны документов некорректны', issues));

  return ok({
    list: () => loaded.map((template) => template.info),
    render(id, profile, context) {
      const template = loaded.find((candidate) => candidate.info.id === id);
      if (!template) return err(notFound('template', id));
      return ok(renderTemplate(template.compiled, buildView(profile, context)));
    },
  });
}
