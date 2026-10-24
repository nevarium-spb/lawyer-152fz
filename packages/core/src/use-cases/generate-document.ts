import { LEGAL_DISCLAIMER } from '../domain/audit-report';
import type { NormId } from '../domain/norm-id';
import { operatorProfileSchema } from '../domain/operator-profile';
import type { DocumentTemplates, TemplateInfo } from '../ports';
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
}

export interface GenerateDocumentDeps {
  readonly templates: DocumentTemplates;
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
        operatorProfileSchema,
        rawProfile,
        'Профиль оператора заполнен не полностью',
      );
      if (!profile.ok) return profile;

      const body = deps.templates.render(templateId, profile.value);
      if (!body.ok) return body;

      return ok({
        templateId,
        title: info.title,
        normRefs: info.normRefs,
        markdown: `${body.value.trimEnd()}\n\n---\n\n_${LEGAL_DISCLAIMER}_\n`,
      });
    },
  };
}
