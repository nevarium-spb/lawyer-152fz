import { err, ok, sourceUnavailable } from '@lawyer-152fz/core';
import type { Result, SourceUnavailableError } from '@lawyer-152fz/core';

/**
 * Клиент КонсультантПлюс — вторичный источник (ADR-0012). Используется только для актов,
 * которых нет в официальных электронных источниках, по одному документу, с честным User-Agent.
 */
export const CONSULTANT_BASE = 'https://www.consultant.ru';

const REQUEST_TIMEOUT_MS = 60_000;
const USER_AGENT = 'lawyer-152fz (+https://github.com/nevarium-spb/lawyer-152fz)';

/** Ссылка на документ или его раздел — используется как `sourceUrl` норм. */
export const consultantDocumentUrl = (documentId: string, section?: string): string =>
  `${CONSULTANT_BASE}/document/cons_doc_${documentId}/${section ? `${section}/` : ''}`;

export type TextFetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface ConsultantClient {
  documentHtml(
    documentId: string,
    section?: string,
  ): Promise<Result<string, SourceUnavailableError>>;
}

export function createConsultantClient(fetchImpl: TextFetchLike = fetch): ConsultantClient {
  return {
    async documentHtml(documentId, section) {
      const unavailable = (detail: string) => err(sourceUnavailable(CONSULTANT_BASE, detail));
      try {
        const response = await fetchImpl(consultantDocumentUrl(documentId, section), {
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
