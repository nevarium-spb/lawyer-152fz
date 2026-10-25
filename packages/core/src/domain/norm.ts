import { z } from 'zod';

import { ACT_ID_PATTERN, normIdSchema } from './norm-id';

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
    sourceUrl: z.url({ protocol: /^https$/, error: 'Официальный источник — https-ссылка' }),
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
