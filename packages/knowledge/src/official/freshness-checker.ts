import type {
  Clock,
  FreshnessReport,
  FreshnessStatus,
  Norm,
  Result,
  SourceFreshnessChecker,
  SourceUnavailableError,
} from '@lawyer-152fz/core';

import { createActualPravoClient, currentRedaction } from './actual-pravo-client';
import type { ActualPravoClient, Redaction } from './actual-pravo-client';

/** Ответ нужен в диалоге: дольше ждать портал нет смысла — честнее вернуть «неизвестно». */
export const FRESHNESS_REQUEST_TIMEOUT_MS = 15_000;

/** Редакции меняются раз в месяцы; кеш избавляет от запроса на каждую норму одного акта. */
export const REDACTIONS_CACHE_TTL_MS = 10 * 60 * 1000;

export interface SourceFreshnessCheckerDeps {
  readonly clock: Clock;
  readonly client?: ActualPravoClient;
  readonly cacheTtlMs?: number;
}

type RedactionsResult = Result<readonly Redaction[], SourceUnavailableError>;

const DOC_HASH_PATTERN = /[#&?]hash=([a-f0-9]{64})(?:&|$)/;

const docHashOf = (sourceUrl: string): string | undefined => DOC_HASH_PATTERN.exec(sourceUrl)?.[1];

const ruDate = (iso: string): string => iso.split('-').reverse().join('.');

const isGovernmentSite = (url: string): boolean =>
  /(^|\.)government\.ru$/.test(new URL(url).hostname);

/**
 * Сверка редакции нормы с API актуальных редакций официального портала (T6.6, ADR-0011).
 * Сравнивается редакция акта целиком: портал не сообщает, какие статьи изменились.
 * Никогда не выдаёт «fresh» без ответа источника: недоступный портал, вторичный источник
 * или несогласованные данные — это «unknown» (ADR-0003).
 */
export function createSourceFreshnessChecker(
  deps: SourceFreshnessCheckerDeps,
): SourceFreshnessChecker {
  const client = deps.client ?? createActualPravoClient(fetch, FRESHNESS_REQUEST_TIMEOUT_MS);
  const ttlMs = deps.cacheTtlMs ?? REDACTIONS_CACHE_TTL_MS;
  const cache = new Map<
    string,
    { readonly at: number; readonly result: Promise<RedactionsResult> }
  >();

  function redactionsOf(docHash: string): Promise<RedactionsResult> {
    const now = deps.clock.now().getTime();
    const cached = cache.get(docHash);
    if (cached && now - cached.at < ttlMs) return cached.result;

    const result = client.redactions(docHash);
    cache.set(docHash, { at: now, result });
    // Ошибку не кешируем: портал часто «моргает», следующий вызов должен спросить заново.
    void result.then(
      (value) => {
        if (!value.ok) cache.delete(docHash);
      },
      () => cache.delete(docHash),
    );
    return result;
  }

  async function check(norm: Norm): Promise<FreshnessReport> {
    const report = (
      status: FreshnessStatus,
      detail: string,
      extra: Pick<FreshnessReport, 'sourceEditionDate' | 'upcomingEditionDates'> = {},
    ): FreshnessReport => ({
      id: norm.id,
      status,
      checkedAt: deps.clock.now().toISOString(),
      detail,
      ...extra,
    });

    if (norm.sourceType === 'secondary') {
      return report(
        'unknown',
        `Вторичный источник (КонсультантПлюс): у него нет API редакций, автоматически проверить нельзя. ` +
          `Текст сверен ${ruDate(norm.verifiedAt)}; официальная публикация — ${norm.officialPublication ?? 'не указана'}.`,
      );
    }

    if (
      norm.validUntil !== undefined &&
      deps.clock.now().toISOString().slice(0, 10) >= norm.validUntil
    ) {
      return report(
        'stale',
        `Срок действия акта истёк ${ruDate(norm.validUntil)}: нормы из него применять нельзя без проверки. ` +
          `Проверьте, не принят ли новый акт взамен: ${norm.sourceUrl}`,
      );
    }

    if (norm.officialPublication !== undefined) {
      const origin = isGovernmentSite(norm.sourceUrl)
        ? 'Текст с официального сайта Правительства РФ (government.ru): у него нет API редакций'
        : 'Акт опубликован на publication.pravo.gov.ru только сканом, текст в базе набран по скану: API редакций нет';
      const validity =
        norm.validUntil === undefined ? '' : ` Акт действует до ${ruDate(norm.validUntil)}.`;
      return report(
        'unknown',
        `${origin}, автоматически проверить нельзя. ` +
          `Текст сверен ${ruDate(norm.verifiedAt)}; официальная публикация — ${norm.officialPublication}.${validity}`,
      );
    }

    const docHash = docHashOf(norm.sourceUrl);
    if (!docHash) {
      return report(
        'unknown',
        `В ссылке на источник нет идентификатора документа портала — сверьте норму вручную: ${norm.sourceUrl}`,
      );
    }

    const redactions = await redactionsOf(docHash);
    if (!redactions.ok) {
      return report(
        'unknown',
        `${redactions.error.message}. Актуальность не подтверждена — повторите позже или сверьте вручную: ${norm.sourceUrl}`,
      );
    }

    const current = currentRedaction(redactions.value);
    if (!current) {
      return report(
        'unknown',
        `Портал не отметил действующую редакцию акта — сверьте норму вручную: ${norm.sourceUrl}`,
      );
    }

    const upcoming = redactions.value
      .map((redaction) => redaction.date)
      .filter((date) => date > current.date)
      .sort();
    const extra = {
      sourceEditionDate: current.date,
      ...(upcoming.length > 0 ? { upcomingEditionDates: upcoming } : {}),
    };
    const upcomingDates = upcoming.map(ruDate).join(', ');
    const upcomingNote =
      upcoming.length === 0
        ? ''
        : upcoming.length === 1
          ? ` Принята, но ещё не вступила в силу редакция с ${upcomingDates} — норма может измениться.`
          : ` Приняты, но ещё не вступили в силу редакции с ${upcomingDates} — норма может измениться.`;

    if (current.date === norm.editionDate) {
      return report(
        'fresh',
        `Действующая редакция акта на портале — от ${ruDate(current.date)}, как в базе.${upcomingNote}`,
        extra,
      );
    }
    if (current.date > norm.editionDate) {
      return report(
        'stale',
        `На портале действует редакция акта от ${ruDate(current.date)}, в базе — от ${ruDate(norm.editionDate)}. ` +
          `Проверяется акт целиком: изменилась ли эта норма, сверьте по источнику ${norm.sourceUrl} ` +
          `или обновите плагин.${upcomingNote}`,
        extra,
      );
    }
    return report(
      'unknown',
      `В базе редакция от ${ruDate(norm.editionDate)}, а портал считает действующей редакцию от ` +
        `${ruDate(current.date)} — данные не согласуются, сверьте вручную: ${norm.sourceUrl}`,
      extra,
    );
  }

  return {
    async check(norm) {
      try {
        return await check(norm);
      } catch {
        // Контракт порта: без исключений и без «fresh» наугад.
        return {
          id: norm.id,
          status: 'unknown',
          checkedAt: deps.clock.now().toISOString(),
          detail: 'Проверка актуальности не удалась',
        };
      }
    },
  };
}
