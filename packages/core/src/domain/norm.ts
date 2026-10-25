import { z } from 'zod';

import { ACT_ID_PATTERN, normIdSchema } from './norm-id';

/**
 * Официальные порталы, тексты с которых допустимы в базе (ADR-0003, ADR-0007).
 * Проверяется домен, а не протокол: actual.pravo.gov.ru работает только по HTTP,
 * а ссылка на коммерческую правовую систему не пройдёт и по HTTPS.
 */
export const OFFICIAL_SOURCE_HOSTS = ['pravo.gov.ru', 'kremlin.ru', 'government.ru', 'rkn.gov.ru'];

const OFFICIAL_HOST_PATTERN = new RegExp(
  `^(?:[a-z0-9-]+\\.)*(?:${OFFICIAL_SOURCE_HOSTS.map((host) => host.replaceAll('.', '\\.')).join('|')})$`,
);

/** Ссылка на документ на официальном портале. */
export const officialSourceUrlSchema = z.url({
  protocol: /^https?$/,
  hostname: OFFICIAL_HOST_PATTERN,
  error: `Источник — ссылка на официальный портал: ${OFFICIAL_SOURCE_HOSTS.join(', ')}`,
});

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
    sourceUrl: officialSourceUrlSchema,
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
  });

export type Norm = z.output<typeof normSchema>;
export type NormInput = z.input<typeof normSchema>;
