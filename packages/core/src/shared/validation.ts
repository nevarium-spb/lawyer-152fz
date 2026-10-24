import { z } from 'zod';

import { validationError } from './errors';
import type { ValidationError } from './errors';
import { err, ok } from './result';
import type { Result } from './result';

/**
 * Русские сообщения по умолчанию — только для разбора через `parseWith`.
 * Глобальная конфигурация zod не меняется: ядро не навязывает её потребителям.
 * Собственные сообщения схем имеют приоритет над локалью.
 */
const russianLocale = z.locales.ru();

/** Разбирает недоверенный вход по схеме; все проблемы собираются за один вызов. */
export function parseWith<S extends z.ZodType>(
  schema: S,
  input: unknown,
  message: string,
): Result<z.output<S>, ValidationError> {
  const parsed = schema.safeParse(input, { error: russianLocale.localeError });
  if (parsed.success) return ok(parsed.data);

  return err(
    validationError(
      message,
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    ),
  );
}
