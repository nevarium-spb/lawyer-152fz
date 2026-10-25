/**
 * @lawyer-152fz/rules — реестр правил аудита. Каждое правило — чистая функция без I/O.
 * Наполняется в вехе M5.
 */
import type { CodebaseRule, SiteRule } from '@lawyer-152fz/core';

/** Реестр правил аудита сайтов (ADR-0004): явный список, без сканирования папок. */
export const SITE_RULES: readonly SiteRule[] = [];

/** Реестр правил аудита исходников. */
export const CODEBASE_RULES: readonly CodebaseRule[] = [];
