import { parseWith } from '@lawyer-152fz/core';
import type { Result, ValidationError } from '@lawyer-152fz/core';
import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * Конфигурация сервера из переменных окружения (T3.1).
 * Частные сети разрешены по умолчанию: в плагине пользователь проверяет и свой localhost.
 * В режиме бота флаг выставляется в false (ADR-0006).
 */
const envSchema = z.object({
  LAWYER_ALLOW_PRIVATE_NETWORKS: booleanFlag.default(true),
});

export interface ServerConfig {
  readonly allowPrivateNetworks: boolean;
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
): Result<ServerConfig, ValidationError> {
  const parsed = parseWith(envSchema, env, 'Некорректная конфигурация сервера');
  if (!parsed.ok) return parsed;
  return { ok: true, value: { allowPrivateNetworks: parsed.value.LAWYER_ALLOW_PRIVATE_NETWORKS } };
}
