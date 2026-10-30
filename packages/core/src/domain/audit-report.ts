import { compareFindings } from './finding';
import type { Finding } from './finding';
import type { PageSnapshot } from './snapshots';

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
  /** Что аудит реально увидел: без этого «нарушений нет» нельзя отличить от «ничего не найдено». */
  readonly checked: readonly string[];
  /** Честный список того, что проверить не удалось. */
  readonly notChecked: readonly string[];
  readonly disclaimer: string;
}

export interface ReportContext {
  readonly kbVersion: string;
  readonly now: Date;
}

/** «Страниц: 10. Форм со сбором персональных данных: 6, из них с отдельной галочкой согласия: 6.» */
export function describeSiteCoverage(pages: readonly PageSnapshot[]): string {
  const forms = pages
    .flatMap((page) => page.forms)
    .filter((form) => form.fields.some((field) => field.personalData !== undefined));
  const withCheckbox = forms.filter((form) => form.consent === 'checkbox').length;
  return (
    `Страниц: ${String(pages.length)}. Форм со сбором персональных данных: ${String(forms.length)}` +
    (forms.length > 0 ? `, из них с отдельной галочкой согласия: ${String(withCheckbox)}.` : '.')
  );
}

export function createAuditReport(
  target: AuditTarget,
  findings: readonly Finding[],
  notChecked: readonly string[],
  context: ReportContext,
  checked: readonly string[] = [],
): AuditReport {
  return {
    target,
    generatedAt: context.now.toISOString(),
    kbVersion: context.kbVersion,
    findings: [...findings].sort(compareFindings),
    checked,
    notChecked: [...new Set(notChecked)],
    disclaimer: LEGAL_DISCLAIMER,
  };
}
