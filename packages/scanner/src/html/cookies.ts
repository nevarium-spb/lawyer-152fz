import type { CookieSnapshot } from '@lawyer-152fz/core';

/** Имя и домен cookie из заголовка Set-Cookie. Значение не сохраняем: оно может содержать ПДн (ADR-0006). */
export function parseSetCookie(header: string, pageHost: string): CookieSnapshot | undefined {
  const [pair = '', ...attributes] = header.split(';');
  const name = pair.split('=')[0]?.trim() ?? '';
  if (!name) return undefined;

  const domain = attributes
    .map((attribute) => attribute.trim())
    .find((attribute) => /^domain=/i.test(attribute))
    ?.slice('domain='.length)
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
  // Пустой атрибут Domain= браузер игнорирует — cookie остаётся на хосте страницы.
  return { name, domain: domain === undefined || domain === '' ? pageHost : domain };
}
