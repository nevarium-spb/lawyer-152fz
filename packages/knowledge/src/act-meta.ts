import { actIdSchema, officialSourceUrlSchema } from '@lawyer-152fz/core';
import { z } from 'zod';

/**
 * Вид акта определяет нарезку: у законов и кодексов статьи делятся на части,
 * у постановлений нормы — пункты утверждённого документа.
 */
export const ACT_KINDS = ['law', 'code', 'decree'] as const;
export type ActKind = (typeof ACT_KINDS)[number];

/** Метаданные акта — `data/<акт>/act.json`. */
export const actMetaSchema = z.object({
  id: actIdSchema,
  title: z.string().trim().min(1, 'Укажите полное название акта'),
  kind: z.enum(ACT_KINDS),
  /** Идентификатор документа на actual.pravo.gov.ru. */
  officialDocHash: z.string().regex(/^[a-f0-9]{64}$/, 'officialDocHash — 64 hex-символа'),
  /** Идентификатор редакции, из которой взят текст. */
  redactionId: z.number().int().positive(),
  editionDate: z.iso.date({ error: 'Дата редакции — ГГГГ-ММ-ДД' }),
  sourceUrl: officialSourceUrlSchema,
  retrievedAt: z.iso.date({ error: 'Дата загрузки — ГГГГ-ММ-ДД' }),
});

export type ActMeta = z.output<typeof actMetaSchema>;
