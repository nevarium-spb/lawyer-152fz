import { err, ok, sourceUnavailable } from '@lawyer-152fz/core';
import type { Result, SourceUnavailableError } from '@lawyer-152fz/core';

/**
 * Клиент официального сайта Правительства РФ (ADR-0014). Нужен для постановлений, которых нет
 * на pravo.gov.ru: страница документа `government.ru/docs/all/<id>/` содержит полный текст.
 * По одному документу, с честным User-Agent проекта.
 */
export const GOVERNMENT_BASE = 'https://government.ru';

/**
 * Загрузка идёт по HTTP: с рукопожатием TLS сайт из Node не отвечает (соединение сбрасывается),
 * как и у actual.pravo.gov.ru (ADR-0011). Целостность — ревью git diff и `sha256` пунктов.
 */
const FETCH_BASE = 'http://government.ru';

const REQUEST_TIMEOUT_MS = 60_000;
const USER_AGENT = 'lawyer-152fz (+https://github.com/nevarium-spb/lawyer-152fz)';

/** Ссылка на страницу документа для людей — используется как `sourceUrl` норм. */
export const governmentDocumentUrl = (documentId: string): string =>
  `${GOVERNMENT_BASE}/docs/all/${documentId}/`;

const fetchUrl = (documentId: string): string => `${FETCH_BASE}/docs/all/${documentId}/`;

export type TextFetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface GovernmentClient {
  documentHtml(documentId: string): Promise<Result<string, SourceUnavailableError>>;
}

export function createGovernmentClient(fetchImpl: TextFetchLike = fetch): GovernmentClient {
  return {
    async documentHtml(documentId) {
      const unavailable = (detail: string) => err(sourceUnavailable(GOVERNMENT_BASE, detail));
      try {
        const response = await fetchImpl(fetchUrl(documentId), {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { 'user-agent': USER_AGENT },
        });
        if (!response.ok) return unavailable(`HTTP ${String(response.status)}`);
        return ok(await response.text());
      } catch (error) {
        return unavailable(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
