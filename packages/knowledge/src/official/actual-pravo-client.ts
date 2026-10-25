import { err, ok, sourceUnavailable } from '@lawyer-152fz/core';
import type { Result, SourceUnavailableError } from '@lawyer-152fz/core';
import { z } from 'zod';

/**
 * Клиент «Тексты правовых актов с внесенными изменениями» официального портала
 * правовой информации (ADR-0011). Портал работает только по HTTP.
 */
export const ACTUAL_PRAVO_API = 'http://actual.pravo.gov.ru:8000/api/ebpi';

const REQUEST_TIMEOUT_MS = 60_000;

/** Ссылка на документ для людей — используется как `sourceUrl` норм. */
export const officialDocumentUrl = (docHash: string): string =>
  `http://actual.pravo.gov.ru/content/content.html#hash=${docHash}`;

// Ответы портала — недоверенные данные: проверяем форму, а не верим ей.
const redactionsResponseSchema = z.object({
  redactions: z
    .array(
      z.object({
        redid: z.number().int().positive(),
        reddate: z.string().regex(/^\d{8}$/),
        redcaption: z.string(),
      }),
    )
    .nullable(),
  error: z.string().nullish(),
});

const redtextResponseSchema = z.object({
  redtext: z.string().nullable(),
  error: z.string().nullish(),
});

export interface Redaction {
  readonly id: number;
  /** Дата начала действия редакции, ISO. */
  readonly date: string;
  readonly caption: string;
  /** Действующая сейчас редакция («актуальная»). */
  readonly isCurrent: boolean;
}

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ActualPravoClient {
  redactions(docHash: string): Promise<Result<readonly Redaction[], SourceUnavailableError>>;
  redactionHtml(redactionId: number): Promise<Result<string, SourceUnavailableError>>;
}

export function createActualPravoClient(fetchImpl: FetchLike = fetch): ActualPravoClient {
  const unavailable = (detail: string) => err(sourceUnavailable(ACTUAL_PRAVO_API, detail));

  async function getJson<S extends z.ZodType>(
    path: string,
    schema: S,
  ): Promise<Result<z.output<S>, SourceUnavailableError>> {
    let body: unknown;
    try {
      const response = await fetchImpl(`${ACTUAL_PRAVO_API}/${path}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return unavailable(`HTTP ${String(response.status)}`);
      body = await response.json();
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error));
    }

    const parsed = schema.safeParse(body);
    return parsed.success ? ok(parsed.data) : unavailable('неожиданный формат ответа');
  }

  return {
    async redactions(docHash) {
      const query = encodeURIComponent(JSON.stringify({ hash: docHash, ttl: 4 }));
      const response = await getJson(`redactions/?bpa=ebpi&t=${query}`, redactionsResponseSchema);
      if (!response.ok) return response;

      const { redactions, error } = response.value;
      if (error || !redactions) return unavailable(nonEmpty(error) ?? 'у документа нет редакций');

      return ok(
        redactions.map(({ redid, reddate, redcaption }) => ({
          id: redid,
          date: `${reddate.slice(0, 4)}-${reddate.slice(4, 6)}-${reddate.slice(6, 8)}`,
          caption: redcaption.trim(),
          isCurrent: redcaption.includes('актуальная'),
        })),
      );
    },

    async redactionHtml(redactionId) {
      const response = await getJson(
        `redtext?bpa=ebpi&t=${String(redactionId)}&ttl=0`,
        redtextResponseSchema,
      );
      if (!response.ok) return response;

      const { redtext, error } = response.value;
      return redtext && !error
        ? ok(redtext)
        : unavailable(nonEmpty(error) ?? 'текст редакции не получен');
    },
  };
}

/** Портал присылает `error: ""` в успешных ответах — пустая строка не сообщение. */
function nonEmpty(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  return text;
}

export const currentRedaction = (redactions: readonly Redaction[]): Redaction | undefined =>
  redactions.find((redaction) => redaction.isCurrent);
