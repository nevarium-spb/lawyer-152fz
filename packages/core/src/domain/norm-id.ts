import { z } from 'zod';

import { validationError } from '../shared/errors';
import type { ValidationError } from '../shared/errors';
import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

const ACT = '[a-z0-9]+(?:-[a-z0-9]+)*';
/** Номер статьи или пункта: 9, 18.1, 13.11. Без ведущих нулей — чтобы идентификатор был каноничным. */
const NUMBER = '[1-9]\\d*(?:\\.[1-9]\\d*)*';

const NORM_ID_PATTERN = new RegExp(
  `^(${ACT})(?:/art-(${NUMBER}))?(?:/part-(${NUMBER}))?(?:/item-(${NUMBER}))?$`,
);

export const ACT_ID_PATTERN = new RegExp(`^${ACT}$`);

export const NORM_ID_HINT =
  '<акт>/art-<статья>[/part-<часть>][/item-<пункт>] или <акт>/item-<пункт>, например 152-fz/art-18/part-5';

/**
 * Структурная ссылка на норму. У законов есть статьи и части,
 * у постановлений — только пункты (`pp-1119/item-13`).
 */
export interface NormRef {
  readonly act: string;
  readonly article?: string;
  /** Номер части; бывает дробным: часть 1.1 статьи 13.11 КоАП (в тексте — 1¹). */
  readonly part?: string;
  readonly item?: string;
}

function matchNormRef(raw: string): NormRef | undefined {
  const match = NORM_ID_PATTERN.exec(raw);
  if (!match) return undefined;

  const [, act, article, part, item] = match;
  if (act === undefined) return undefined;
  if (article === undefined && item === undefined) return undefined;
  if (part !== undefined && article === undefined) return undefined;

  return {
    act,
    ...(article !== undefined && { article }),
    ...(part !== undefined && { part }),
    ...(item !== undefined && { item }),
  };
}

const invalidMessage = (raw: string): string =>
  `Неверный идентификатор нормы «${raw}»: ожидается ${NORM_ID_HINT}`;

/** Схема идентификатора нормы. Результат — брендированная строка `NormId`. */
export const normIdSchema = z
  .string()
  .refine((raw) => matchNormRef(raw) !== undefined, {
    error: (issue) => invalidMessage(String(issue.input)),
  })
  .brand<'NormId'>();

/** Каноничный идентификатор нормы, например `152-fz/art-18/part-5`. */
export type NormId = z.output<typeof normIdSchema>;

export function parseNormRef(raw: string): Result<NormRef, ValidationError> {
  const ref = matchNormRef(raw);
  return ref ? ok(ref) : err(validationError(invalidMessage(raw)));
}

export function parseNormId(raw: string): Result<NormId, ValidationError> {
  return matchNormRef(raw) ? ok(raw as NormId) : err(validationError(invalidMessage(raw)));
}

/**
 * Идентификатор из литерала в коде (правила, шаблоны).
 * Неверный литерал — ошибка программиста, поэтому исключение, а не `Result`.
 */
export function normId(raw: string): NormId {
  const parsed = parseNormId(raw);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

export function formatNormId(ref: NormRef): NormId {
  const segments = [ref.act];
  if (ref.article !== undefined) segments.push(`art-${ref.article}`);
  if (ref.part !== undefined) segments.push(`part-${ref.part}`);
  if (ref.item !== undefined) segments.push(`item-${ref.item}`);
  return normId(segments.join('/'));
}
