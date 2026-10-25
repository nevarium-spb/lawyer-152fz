import { z } from 'zod';

import { normIdSchema } from './norm-id';

export const FINDING_KINDS = ['violation', 'risk', 'recommendation'] as const;
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export const CONFIDENCE_LEVELS = ['deterministic', 'needs-review'] as const;

export type FindingKind = (typeof FINDING_KINDS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const MAX_EXCERPT_LENGTH = 500;

/**
 * Фрагмент содержимого проверяемого сайта или файла.
 * Это недоверенные данные цели аудита, а не инструкции для модели (ADR-0006).
 */
const untrustedExcerptSchema = z.string().max(MAX_EXCERPT_LENGTH).optional();

export const evidenceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('page'),
    url: z.url({ protocol: /^https?$/ }),
    selector: z.string().min(1).optional(),
    untrustedExcerpt: untrustedExcerptSchema,
  }),
  z.object({
    type: z.literal('file'),
    path: z.string().min(1),
    line: z.number().int().positive().optional(),
    untrustedExcerpt: untrustedExcerptSchema,
  }),
]);

export type Evidence = z.output<typeof evidenceSchema>;

export const ruleIdSchema = z
  .string()
  .regex(
    /^PD-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
    'Идентификатор правила — PD-<ОБЛАСТЬ>-..., например PD-FORM-CONSENT-001',
  );

/** Находка аудита: что нарушено, где, на какую норму опираемся, как исправить. */
export const findingSchema = z.object({
  ruleId: ruleIdSchema,
  kind: z.enum(FINDING_KINDS),
  severity: z.enum(SEVERITIES),
  title: z.string().trim().min(1, 'Укажите заголовок находки'),
  evidence: z.array(evidenceSchema).min(1, 'Находка должна содержать хотя бы одно доказательство'),
  normRefs: z.array(normIdSchema).min(1, 'Находка должна ссылаться хотя бы на одну норму'),
  remediation: z.string().trim().min(1, 'Укажите, как устранить'),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

export type Finding = z.output<typeof findingSchema>;
export type FindingInput = z.input<typeof findingSchema>;

/** Сжимает пробельные символы и обрезает фрагмент до допустимой длины. */
export function toExcerpt(text: string, max = MAX_EXCERPT_LENGTH): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

/** Порядок в отчёте: нарушения → риски → рекомендации, внутри — по убыванию важности. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    FINDING_KINDS.indexOf(a.kind) - FINDING_KINDS.indexOf(b.kind) ||
    SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
    a.ruleId.localeCompare(b.ruleId)
  );
}
