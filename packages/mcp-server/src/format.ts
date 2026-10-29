import type {
  DomainError,
  FreshnessReport,
  FreshnessStatus,
  Norm,
  NormSearchHit,
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
      : [`Источник: официальный портал правовой информации — ${norm.sourceUrl}`];

  return [
    norm.heading,
    `Идентификатор: ${norm.id}`,
    `Редакция от: ${norm.editionDate} · сверено с источником: ${norm.verifiedAt}`,
    ...source,
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

export function formatError(error: DomainError): string {
  if (error.kind !== 'validation' || error.issues.length === 0) return error.message;
  const issues = error.issues.map((issue) =>
    issue.path ? `- ${issue.path}: ${issue.message}` : `- ${issue.message}`,
  );
  return [error.message, ...issues].join('\n');
}
