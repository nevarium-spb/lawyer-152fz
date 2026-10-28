import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { err, forbidden, ok, sourceUnavailable } from '@lawyer-152fz/core';
import type { ForbiddenError, Result, SourceUnavailableError } from '@lawyer-152fz/core';

import type { AddressPolicy } from './address-policy';
import { decodeHtml } from './decode-html';
import { nodeHttpTransport } from './http-transport';
import type { HttpTransport, ResolvedAddress } from './http-transport';

export const MAX_REDIRECTS = 5;
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;
export const LOAD_TIMEOUT_MS = 15_000;
export const USER_AGENT = 'Lawyer152FZ-Audit/0.2 (+https://github.com/nevarium-spb/lawyer-152fz)';

/** Загруженная страница. HTML и cookie — недоверенные данные проверяемого сайта (ADR-0006). */
export interface LoadedPage {
  /** Адрес после всех перенаправлений. */
  readonly url: string;
  readonly status: number;
  readonly html: string;
  /** Сырые заголовки Set-Cookie. */
  readonly setCookies: readonly string[];
  /** Адреса, с которых сервер перенаправил, по порядку. */
  readonly redirects: readonly string[];
}

export type PageLoadError = SourceUnavailableError | ForbiddenError;

export interface PageLoader {
  load(url: string): Promise<Result<LoadedPage, PageLoadError>>;
}

export type Resolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, order: 'verbatim' })).map(({ address, family }) => ({
    address,
    family: family === 6 ? 6 : 4,
  }));

export interface StaticPageLoaderDeps {
  readonly policy: AddressPolicy;
  readonly resolve?: Resolver;
  readonly transport?: HttpTransport;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

const REQUEST_HEADERS = {
  'user-agent': USER_AGENT,
  accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
  'accept-language': 'ru,en;q=0.5',
};

const isHtml = (contentType: string | undefined): boolean =>
  contentType === undefined || /^\s*(text\/html|application\/xhtml\+xml)\b/i.test(contentType);

const asArray = (value: string | string[] | undefined): readonly string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * Статическая загрузка страницы с SSRF-защитой (ADR-0006, T5.1):
 * только http(s); каждый адрес из DNS проверяется политикой, соединение — на проверенный IP;
 * каждый редирект проверяется заново; лимиты на число редиректов, размер и общее время.
 */
export function createStaticPageLoader(deps: StaticPageLoaderDeps): PageLoader {
  const resolve = deps.resolve ?? systemResolver;
  const transport = deps.transport ?? nodeHttpTransport;
  const maxBytes = deps.maxBytes ?? MAX_PAGE_BYTES;
  const timeoutMs = deps.timeoutMs ?? LOAD_TIMEOUT_MS;

  async function checkedAddress(url: URL): Promise<Result<ResolvedAddress, PageLoadError>> {
    const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
    const literal = isIP(host);
    let addresses: readonly ResolvedAddress[];
    if (literal !== 0) {
      addresses = [{ address: host, family: literal === 6 ? 6 : 4 }];
    } else {
      try {
        addresses = await resolve(host);
      } catch {
        return err(sourceUnavailable(url.origin, `не удалось найти адрес сервера ${host}`));
      }
    }

    const [first] = addresses;
    if (first === undefined) {
      return err(sourceUnavailable(url.origin, `у ${host} нет IP-адресов`));
    }
    // Проверяем все адреса: среди «круговых» DNS-ответов может прятаться частный.
    for (const { address } of addresses) {
      const allowed = deps.policy(address);
      if (!allowed.ok) return allowed;
    }
    return ok(first);
  }

  return {
    async load(input) {
      let url: URL;
      try {
        url = new URL(input);
      } catch {
        return err(forbidden(`«${input}» — не ссылка`));
      }
      const signal = AbortSignal.timeout(timeoutMs);
      const redirects: string[] = [];

      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return err(forbidden(`протокол ${url.protocol} не поддерживается — только http и https`));
        }
        if (url.username || url.password) {
          return err(forbidden('ссылки с логином и паролем не поддерживаются'));
        }

        const address = await checkedAddress(url);
        if (!address.ok) return address;

        const response = await transport({
          url,
          address: address.value,
          signal,
          maxBytes,
          headers: REQUEST_HEADERS,
        });
        if (!response.ok) return response;

        const { status, headers, body } = response.value;
        if (status >= 300 && status < 400 && headers.location) {
          redirects.push(url.href);
          url = new URL(headers.location, url);
          continue;
        }
        if (status >= 400) {
          return err(
            sourceUnavailable(url.origin, `сервер ответил ${String(status)} на ${url.href}`),
          );
        }
        if (!isHtml(headers['content-type'])) {
          return err(
            sourceUnavailable(
              url.origin,
              `по адресу ${url.href} не HTML-страница (${headers['content-type'] ?? ''})`,
            ),
          );
        }

        return ok({
          url: url.href,
          status,
          html: decodeHtml(body, headers['content-type']),
          setCookies: asArray(headers['set-cookie']),
          redirects,
        });
      }

      return err(
        sourceUnavailable(url.origin, `больше ${String(MAX_REDIRECTS)} перенаправлений подряд`),
      );
    },
  };
}
