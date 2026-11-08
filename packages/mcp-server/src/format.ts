import type {
  DomainError,
  FreshnessReport,
  FreshnessStatus,
  Norm,
  NormSearchHit,
  VerificationIssue,
  VerificationReport,
} from '@lawyer-152fz/core';

/**
 * Текстовые ответы инструментов для модели. Структурированные данные идут отдельно
 * (structuredContent), текст — то, что модель читает и пересказывает пользователю.
 */

export function formatSearchHits(hits: readonly NormSearchHit[], kbVersion: string): string {
  if (hits.length === 0) {
    return `Ничего не найдено (база ${kbVersion}). Переформулируйте запрос словами закона.`;
  }
  const lines = hits.map(
    (hit, index) =>
      `${String(index + 1)}. ${hit.id} — ${hit.heading} (редакция от ${hit.editionDate})\n   ${hit.snippet}`,
  );
  return [
    `Найдено норм: ${String(hits.length)} (база ${kbVersion}). Для цитаты получите полный текст через get_norm.`,
    '',
    ...lines,
  ].join('\n');
}

export function formatNorm(norm: Norm): string {
  const source =
    norm.sourceType === 'secondary'
      ? [
          `⚠ Вторичный источник (КонсультантПлюс): ${norm.sourceUrl}`,
          `Официальная публикация: ${norm.officialPublication ?? '—'}`,
          'При цитировании сообщите пользователю, что текст взят из вторичного источника (ADR-0012).',
        ]
      : norm.officialPublication === undefined
        ? [`Источник: официальный портал правовой информации — ${norm.sourceUrl}`]
        : /(^|\.)government\.ru$/.test(new URL(norm.sourceUrl).hostname)
          ? [
              `Источник: официальный сайт Правительства РФ — ${norm.sourceUrl} (текст на сайте, не официальное опубликование)`,
              `Официальная публикация: ${norm.officialPublication}`,
            ]
          : [
              `Источник: официальный портал опубликования — ${norm.sourceUrl} (на портале только скан; текст в базе набран по скану и сверен с копиями)`,
              `Официальная публикация: ${norm.officialPublication}`,
            ];
  const validity =
    norm.validUntil === undefined
      ? []
      : [
          `Акт действует до ${norm.validUntil.split('-').reverse().join('.')}: после этой даты применять его нельзя без проверки замены.`,
        ];

  return [
    norm.heading,
    `Идентификатор: ${norm.id}`,
    `Редакция от: ${norm.editionDate} · сверено с источником: ${norm.verifiedAt}`,
    ...source,
    ...validity,
    '',
    norm.text,
  ].join('\n');
}

const FRESHNESS_LABELS: Record<FreshnessStatus, string> = {
  fresh: 'актуальна',
  stale: 'в базе не действующая редакция',
  unknown: 'проверить не удалось',
};

export function formatFreshness(reports: readonly FreshnessReport[]): string {
  const lines = reports.map(
    (report) =>
      `- ${report.id} — ${FRESHNESS_LABELS[report.status]}.${report.detail ? ` ${report.detail}` : ''}`,
  );
  const unknownNote = reports.some((report) => report.status === 'unknown')
    ? ['', '«Проверить не удалось» не значит «актуальна»: так и скажите пользователю.']
    : [];
  return [
    `Сверка с официальным порталом actual.pravo.gov.ru, норм: ${String(reports.length)}.`,
    ...lines,
    ...unknownNote,
  ].join('\n');
}

export function formatVerification(report: VerificationReport): string {
  const errors = report.issues.filter((issue) => issue.severity === 'error');
  const warnings = report.issues.filter((issue) => issue.severity === 'warning');
  const line = (issue: VerificationIssue): string =>
    `- [${issue.code}] ${issue.message}${issue.excerpt ? `\n  «${issue.excerpt}»` : ''}`;
  const { checked } = report;
  return [
    report.ok
      ? 'Сверка пройдена: ошибок нет.'
      : `Сверка не пройдена: ошибок ${String(errors.length)}. Исправьте их и вызовите verify_answer снова.`,
    `Проверено: идентификаторов норм ${String(checked.normIds)}, цитат ${String(checked.quotes)}, ` +
      `утверждений с меткой ${String(checked.labeledStatements)}, без метки ${String(checked.unlabeledStatements)}.`,
    ...(errors.length > 0 ? ['', 'Ошибки:', ...errors.map(line)] : []),
    ...(warnings.length > 0
      ? ['', 'Предупреждения (проверьте вручную, не обязательно ошибки):', ...warnings.map(line)]
      : []),
    '',
    'Не проверяется:',
    ...report.notChecked.map((item) => `- ${item}`),
  ].join('\n');
}

export function formatError(error: DomainError): string {
  if (error.kind !== 'validation' || error.issues.length === 0) return error.message;
  const issues = error.issues.map((issue) =>
    issue.path ? `- ${issue.path}: ${issue.message}` : `- ${issue.message}`,
  );
  return [error.message, ...issues].join('\n');
}
