import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

import { err, ok, sourceUnavailable } from '@lawyer-152fz/core';
import type { Result, SourceUnavailableError } from '@lawyer-152fz/core';

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface HttpRequest {
  readonly url: URL;
  /** Адрес, уже проверенный политикой: соединение идёт только на него (защита от DNS rebinding). */
  readonly address: ResolvedAddress;
  readonly signal: AbortSignal;
  /** Предел тела после распаковки, байт. */
  readonly maxBytes: number;
  readonly headers: Readonly<Record<string, string>>;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

/** Один HTTP-запрос без перехода по редиректам: редиректы проверяет загрузчик. */
export type HttpTransport = (
  request: HttpRequest,
) => Promise<Result<HttpResponse, SourceUnavailableError>>;

/** Подставляет проверенный адрес вместо DNS: имя хоста остаётся для SNI, сертификата и заголовка Host. */
function pinnedLookup({ address, family }: ResolvedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

function decompress(
  body: Buffer,
  encoding: string | undefined,
  maxBytes: number,
): Result<Buffer, string> {
  const options = { maxOutputLength: maxBytes };
  try {
    switch (encoding?.trim().toLowerCase()) {
      case undefined:
      case '':
      case 'identity':
        return ok(body);
      case 'gzip':
      case 'x-gzip':
        return ok(gunzipSync(body, options));
      case 'deflate':
        return ok(inflateSync(body, options));
      case 'br':
        return ok(brotliDecompressSync(body, options));
      default:
        return err(`неподдерживаемое сжатие «${encoding ?? ''}»`);
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    return err(
      code === 'ERR_BUFFER_TOO_LARGE'
        ? `страница после распаковки больше ${String(maxBytes)} байт`
        : 'не удалось распаковать ответ',
    );
  }
}

export const nodeHttpTransport: HttpTransport = (request) =>
  new Promise((resolve) => {
    const source = request.url.origin;
    const fail = (detail: string) => {
      resolve(err(sourceUnavailable(source, detail)));
    };

    const options: RequestOptions = {
      method: 'GET',
      headers: { ...request.headers, 'accept-encoding': 'gzip, deflate, br' },
      signal: request.signal,
      lookup: pinnedLookup(request.address),
      agent: false,
    };
    const send = request.url.protocol === 'https:' ? httpsRequest : httpRequest;

    const req = send(request.url, options, (res) => {
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > request.maxBytes) {
        res.destroy();
        fail(`страница больше ${String(request.maxBytes)} байт`);
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > request.maxBytes) {
          res.destroy();
          fail(`страница больше ${String(request.maxBytes)} байт`);
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', () => {
        fail('соединение прервано');
      });
      res.on('end', () => {
        const body = decompress(
          Buffer.concat(chunks),
          res.headers['content-encoding'],
          request.maxBytes,
        );
        if (!body.ok) {
          fail(body.error);
          return;
        }
        resolve(ok({ status: res.statusCode ?? 0, headers: res.headers, body: body.value }));
      });
    });

    req.on('error', (error) => {
      fail(request.signal.aborted ? 'превышено время ожидания' : error.message);
    });
    req.end();
  });
