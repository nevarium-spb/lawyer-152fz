import { LEGAL_DISCLAIMER } from '../domain/audit-report';
import { documentWarnings } from '../domain/document-warnings';
import type { NormId } from '../domain/norm-id';
import { operatorProfileSchemaFor } from '../domain/operator-profile';
import type { Clock, DocumentTemplates, TemplateInfo } from '../ports';
import { notFound } from '../shared/errors';
import type { NotFoundError, ValidationError } from '../shared/errors';
import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { parseWith } from '../shared/validation';

export interface RenderedDocument {
  readonly templateId: string;
  readonly title: string;
  readonly normRefs: readonly NormId[];
  /** Markdown документа с дисклеймером в конце. */
  readonly markdown: string;
  /** Что показать пользователю при выдаче документа; в текст документа не входит. */
  readonly warnings: readonly string[];
}

export interface GenerateDocumentDeps {
  readonly templates: DocumentTemplates;
  readonly clock: Clock;
}

export interface GenerateDocument {
  list(): readonly TemplateInfo[];
  render(
    templateId: string,
    profile: unknown,
  ): Result<RenderedDocument, ValidationError | NotFoundError>;
}

export function createGenerateDocument(deps: GenerateDocumentDeps): GenerateDocument {
  return {
    list: () => deps.templates.list(),

    render(templateId, rawProfile) {
      // Сначала шаблон: незачем просить пользователя заполнять профиль для несуществующего документа.
      const info = deps.templates.list().find((template) => template.id === templateId);
      if (!info) return err(notFound('template', templateId));

      const profile = parseWith(
        operatorProfileSchemaFor(info.requires),
        rawProfile,
        `Для документа «${info.title}» профиль оператора заполнен не полностью`,
      );
      if (!profile.ok) return profile;

      const date = deps.clock.now().toISOString().slice(0, 10);
      const body = deps.templates.render(templateId, profile.value, { date });
      if (!body.ok) return body;

      return ok({
        templateId,
        title: info.title,
        normRefs: info.normRefs,
        markdown: `${body.value.trimEnd()}\n\n---\n\n_${LEGAL_DISCLAIMER}_\n`,
        warnings: documentWarnings(info.requires, profile.value, date),
      });
    },
  };
}
