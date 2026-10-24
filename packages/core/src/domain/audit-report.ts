import { compareFindings } from './finding';
import type { Finding } from './finding';

/** Единый дисклеймер для отчётов и документов — одинаковый в плагине и боте (ADR-0007). */
export const LEGAL_DISCLAIMER =
  'Результат носит справочный характер и не заменяет консультацию юриста.';

export const KB_VERSION_PATTERN = /^kb-\d{4}\.\d{2}\.\d{2}$/;

export type AuditTarget =
  | { readonly type: 'site'; readonly url: string }
  | { readonly type: 'codebase'; readonly path: string };

export interface AuditReport {
  readonly target: AuditTarget;
  /** Момент формирования отчёта, ISO 8601 UTC. */
  readonly generatedAt: string;
  /** Версия базы норм, по которой сделан вывод, например `kb-2026.10.24`. */
  readonly kbVersion: string;
  readonly findings: readonly Finding[];
  /** Честный список того, что проверить не удалось. */
  readonly notChecked: readonly string[];
  readonly disclaimer: string;
}

export interface ReportContext {
  readonly kbVersion: string;
  readonly now: Date;
}

export function createAuditReport(
  target: AuditTarget,
  findings: readonly Finding[],
  notChecked: readonly string[],
  context: ReportContext,
): AuditReport {
  return {
    target,
    generatedAt: context.now.toISOString(),
    kbVersion: context.kbVersion,
    findings: [...findings].sort(compareFindings),
    notChecked: [...new Set(notChecked)],
    disclaimer: LEGAL_DISCLAIMER,
  };
}
