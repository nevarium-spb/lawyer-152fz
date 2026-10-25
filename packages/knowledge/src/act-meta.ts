import { actIdSchema, officialSourceUrlSchema, secondarySourceUrlSchema } from '@lawyer-152fz/core';
import { z } from 'zod';

/**
 * Вид акта определяет нарезку: у законов и кодексов статьи делятся на части,
 * у постановлений нормы — пункты утверждённого документа.
 */
export const ACT_KINDS = ['law', 'code', 'decree'] as const;
export type ActKind = (typeof ACT_KINDS)[number];

/** Официальный источник — API актуальных редакций (ADR-0011). */
const officialSourceSchema = z.object({
  type: z.literal('official'),
  provider: z.literal('actual.pravo.gov.ru'),
  docHash: z.string().regex(/^[a-f0-9]{64}$/, 'docHash — 64 hex-символа'),
  /** Идентификатор редакции, из которой взят текст. */
  redactionId: z.number().int().positive(),
  url: officialSourceUrlSchema,
});

/** Вторичный источник — для актов, которых нет в официальных электронных источниках (ADR-0012). */
const secondarySourceSchema = z.object({
  type: z.literal('secondary'),
  provider: z.literal('consultant.ru'),
  documentId: z.string().regex(/^LAW_\d+$/, 'documentId — вида LAW_137356'),
  url: secondarySourceUrlSchema,
  officialPublication: z.string().trim().min(1, 'Укажите реквизиты официальной публикации'),
});

/** Метаданные акта — `data/<акт>/act.json`. */
export const actMetaSchema = z.object({
  id: actIdSchema,
  title: z.string().trim().min(1, 'Укажите полное название акта'),
  kind: z.enum(ACT_KINDS),
  editionDate: z.iso.date({ error: 'Дата редакции — ГГГГ-ММ-ДД' }),
  retrievedAt: z.iso.date({ error: 'Дата загрузки — ГГГГ-ММ-ДД' }),
  source: z.discriminatedUnion('type', [officialSourceSchema, secondarySourceSchema]),
});

export type ActMeta = z.output<typeof actMetaSchema>;
export type ActSourceMeta = ActMeta['source'];
