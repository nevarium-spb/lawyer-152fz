import { z } from 'zod';

import { ACT_ID_PATTERN, normIdSchema } from './norm-id';

/**
 * Официальные порталы, тексты с которых допустимы в базе (ADR-0003, ADR-0007).
 * Проверяется домен, а не протокол: actual.pravo.gov.ru работает только по HTTP,
 * а ссылка на коммерческую правовую систему не пройдёт и по HTTPS.
 */
export const OFFICIAL_SOURCE_HOSTS = ['pravo.gov.ru', 'kremlin.ru', 'government.ru', 'rkn.gov.ru'];

/**
 * Вторичные источники — только для актов, которых нет в официальных электронных
 * источниках (ADR-0012). Норма из такого источника помечается и раскрывается пользователю.
 */
export const SECONDARY_SOURCE_HOSTS = ['consultant.ru'];

export const SOURCE_TYPES = ['official', 'secondary'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

const hostPattern = (hosts: readonly string[]) =>
  new RegExp(
    `^(?:[a-z0-9-]+\\.)*(?:${hosts.map((host) => host.replaceAll('.', '\\.')).join('|')})$`,
  );

const OFFICIAL_HOST_PATTERN = hostPattern(OFFICIAL_SOURCE_HOSTS);
const SECONDARY_HOST_PATTERN = hostPattern(SECONDARY_SOURCE_HOSTS);

const OFFICIAL_SOURCE_MESSAGE = `Источник — ссылка на официальный портал: ${OFFICIAL_SOURCE_HOSTS.join(', ')}`;
const SECONDARY_SOURCE_MESSAGE = `Вторичный источник — ссылка на ${SECONDARY_SOURCE_HOSTS.join(', ')}`;

/** Ссылка на документ на официальном портале. */
export const officialSourceUrlSchema = z.url({
  protocol: /^https?$/,
  hostname: OFFICIAL_HOST_PATTERN,
  error: OFFICIAL_SOURCE_MESSAGE,
});

/** Ссылка на документ во вторичном источнике (ADR-0012). */
export const secondarySourceUrlSchema = z.url({
  protocol: /^https?$/,
  hostname: SECONDARY_HOST_PATTERN,
  error: SECONDARY_SOURCE_MESSAGE,
});

const hostOf = (url: string): string => new URL(url).hostname;

const isoDate = (label: string) => z.iso.date({ error: `${label} — дата в формате ГГГГ-ММ-ДД` });

export const actIdSchema = z
  .string()
  .regex(
    ACT_ID_PATTERN,
    'Идентификатор акта — строчные латинские буквы, цифры и дефисы, например 152-fz',
  );

/**
 * Норма права в базе знаний (ADR-0003). Текст не нормализуется схемой:
 * по нему считается sha256, и любое преобразование сломало бы сверку.
 */
export const normSchema = z
  .object({
    id: normIdSchema,
    act: actIdSchema,
    heading: z.string().trim().min(1, 'Укажите заголовок статьи'),
    text: z.string().refine((text) => text.trim().length > 0, 'Текст нормы пуст'),
    editionDate: isoDate('Дата редакции'),
    sourceType: z.enum(SOURCE_TYPES).default('official'),
    sourceUrl: z.url({ protocol: /^https?$/, error: 'Источник — ссылка http(s)' }),
    /** Реквизиты официальной публикации; обязательны для вторичного источника. */
    officialPublication: z.string().trim().min(1).optional(),
    /** До какой даты (не включая) действует акт, если срок в нём ограничен (приказ РКН № 18 — до 2027-09-01). */
    validUntil: isoDate('Срок действия').optional(),
    verifiedAt: isoDate('Дата сверки'),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/, 'sha256 — 64 шестнадцатеричных символа в нижнем регистре'),
  })
  .refine((norm) => norm.id.startsWith(`${norm.act}/`), {
    error: 'Акт в идентификаторе нормы не совпадает с полем act',
    path: ['act'],
  })
  .refine((norm) => norm.verifiedAt >= norm.editionDate, {
    error: 'Дата сверки не может быть раньше даты редакции',
    path: ['verifiedAt'],
  })
  .refine(
    (norm) => norm.sourceType !== 'official' || OFFICIAL_HOST_PATTERN.test(hostOf(norm.sourceUrl)),
    { error: OFFICIAL_SOURCE_MESSAGE, path: ['sourceUrl'] },
  )
  .refine(
    (norm) =>
      norm.sourceType !== 'secondary' || SECONDARY_HOST_PATTERN.test(hostOf(norm.sourceUrl)),
    { error: SECONDARY_SOURCE_MESSAGE, path: ['sourceUrl'] },
  )
  .refine((norm) => norm.sourceType !== 'secondary' || norm.officialPublication !== undefined, {
    error: 'Для вторичного источника укажите реквизиты официальной публикации',
    path: ['officialPublication'],
  });

export type Norm = z.output<typeof normSchema>;
export type NormInput = z.input<typeof normSchema>;
