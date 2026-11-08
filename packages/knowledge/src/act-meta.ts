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

/**
 * Официальный сайт Правительства РФ — для постановлений, которых нет на pravo.gov.ru (ADR-0014).
 * Это текст на сайте органа, принявшего акт, а не официальное опубликование: реквизиты печатной
 * публикации хранятся рядом и обязательны.
 */
const governmentSourceSchema = z.object({
  type: z.literal('official'),
  provider: z.literal('government.ru'),
  documentId: z
    .string()
    .regex(/^\d+$/, 'documentId — число из ссылки government.ru/docs/all/<id>/'),
  url: officialSourceUrlSchema,
  officialPublication: z.string().trim().min(1, 'Укажите реквизиты официальной публикации'),
});

/**
 * Официальное опубликование на publication.pravo.gov.ru — для актов, опубликованных там только
 * сканом без текстового слоя (приказ Роскомнадзора № 18). Текст набран по скану и сверен с двумя
 * независимыми копиями; импортёра у такого акта нет (ADR-0015).
 */
const publicationSourceSchema = z.object({
  type: z.literal('official'),
  provider: z.literal('publication.pravo.gov.ru'),
  documentId: z.string().regex(/^\d{16}$/, 'documentId — номер опубликования из 16 цифр'),
  url: officialSourceUrlSchema,
  officialPublication: z.string().trim().min(1, 'Укажите реквизиты официальной публикации'),
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
  /** Срок действия акта, если он ограничен: с этой даты акт уже не действует. */
  validUntil: z.iso.date({ error: 'Срок действия — ГГГГ-ММ-ДД' }).optional(),
  retrievedAt: z.iso.date({ error: 'Дата загрузки — ГГГГ-ММ-ДД' }),
  source: z.discriminatedUnion('provider', [
    officialSourceSchema,
    governmentSourceSchema,
    publicationSourceSchema,
    secondarySourceSchema,
  ]),
});

export type ActMeta = z.output<typeof actMetaSchema>;
export type ActSourceMeta = ActMeta['source'];
