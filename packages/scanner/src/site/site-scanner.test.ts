import { err, ok, sourceUnavailable } from '@lawyer-152fz/core';
import { describe, expect, it } from 'vitest';

import type { LoadedPage, PageLoader } from '../network/static-page-loader';
import {
  RENDER_UNAVAILABLE,
  SCRIPT_COOKIES_NOTE,
  SPA_HINT,
  createSiteScanner,
} from './site-scanner';

const ROOT = 'https://shop.ru/';

const nav = (...paths: string[]) => paths.map((path) => `<a href="${path}">${path}</a>`).join(' ');

/** Фикстурный сайт: 13 страниц, ссылки на каждой странице в разном порядке. */
const SITE: Record<string, string> = {
  'https://shop.ru/': `<h1>Магазин</h1>${nav('/blog/1', '/blog/2', '/catalog', '/contacts', '/order', '/privacy', '/about')}`,
  'https://shop.ru/blog/1': `<p>Статья 1</p>${nav('/blog/3', '/blog/4')}`,
  'https://shop.ru/blog/2': `<p>Статья 2</p>${nav('/blog/5')}`,
  'https://shop.ru/blog/3': '<p>Статья 3</p>',
  'https://shop.ru/blog/4': '<p>Статья 4</p>',
  'https://shop.ru/blog/5': '<p>Статья 5</p>',
  'https://shop.ru/catalog': `<p>Каталог</p>${nav('/catalog/tea', '/catalog/coffee', '/cart')}`,
  'https://shop.ru/catalog/tea': '<p>Чай</p>',
  'https://shop.ru/catalog/coffee': '<p>Кофе</p>',
  'https://shop.ru/cart': '<form method="post"><input name="phone"></form>',
  'https://shop.ru/contacts': '<form method="post"><input name="email"></form>',
  'https://shop.ru/order': '<form method="post"><input name="name"><input name="phone"></form>',
  'https://shop.ru/privacy': '<h1>Политика конфиденциальности</h1>',
  'https://shop.ru/about': '<p>О нас</p>',
};

function siteLoader(
  site: Record<string, string>,
  redirects: Record<string, string> = {},
  failing: readonly string[] = [],
): PageLoader & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    load(url) {
      requested.push(url);
      if (failing.includes(url))
        return Promise.resolve(err(sourceUnavailable(url, 'сервер ответил 500')));
      const finalUrl = redirects[url] ?? url;
      const html = site[finalUrl];
      if (html === undefined)
        return Promise.resolve(err(sourceUnavailable(url, 'сервер ответил 404')));
      const page: LoadedPage = { url: finalUrl, status: 200, html, setCookies: [], redirects: [] };
      return Promise.resolve(ok(page));
    },
  };
}

async function scan(loader: PageLoader, maxPages: number, render = false) {
  const result = await createSiteScanner({ loader }).scan(ROOT, { maxPages, render });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('обход сайта (T5.3)', () => {
  it('обход 10 страниц детерминирован: тот же порядок при каждом запуске', async () => {
    const first = await scan(siteLoader(SITE), 10);
    const second = await scan(siteLoader(SITE), 10);

    expect(first.pages).toHaveLength(10);
    expect(first.pages.map((page) => page.url)).toEqual(second.pages.map((page) => page.url));
    expect(first.notChecked).toEqual(second.notChecked);
    expect(first.notChecked).toContain('ещё 4 страниц сайта не проверены: лимит 10 страниц');
  });

  it('при маленьком лимите сначала страницы с формами, контакты и политика', async () => {
    const snapshot = await scan(siteLoader(SITE), 5);

    expect(snapshot.pages.map((page) => page.url)).toEqual([
      'https://shop.ru/',
      'https://shop.ru/order',
      'https://shop.ru/contacts',
      'https://shop.ru/privacy',
      'https://shop.ru/about',
    ]);
  });

  it('обходит весь маленький сайт без повторов и без пометки о лимите', async () => {
    const loader = siteLoader(SITE);

    const snapshot = await scan(loader, 50);

    expect(snapshot.pages).toHaveLength(Object.keys(SITE).length);
    expect(new Set(loader.requested).size).toBe(loader.requested.length);
    expect(snapshot.notChecked).toEqual([SCRIPT_COOKIES_NOTE]);
  });

  it('недоступная страница и уход на чужой сайт — в notChecked, обход продолжается', async () => {
    const loader = siteLoader(
      { ...SITE, 'https://other.ru/': '<p>чужой</p>' },
      { 'https://shop.ru/about': 'https://other.ru/' },
      ['https://shop.ru/contacts'],
    );

    const snapshot = await scan(loader, 50);

    expect(snapshot.notChecked).toEqual(
      expect.arrayContaining([
        'https://shop.ru/contacts: Источник https://shop.ru/contacts недоступен: сервер ответил 500',
        'https://shop.ru/about: перенаправляет на другой сайт (https://other.ru/)',
      ]),
    );
    expect(snapshot.pages.some((page) => page.url.startsWith('https://other.ru'))).toBe(false);
    expect(snapshot.pages.length).toBeGreaterThan(5);
  });

  it('редирект на уже проверенную страницу не создаёт дубль', async () => {
    const loader = siteLoader(
      {
        'https://shop.ru/': nav('/old-contacts', '/contacts'),
        'https://shop.ru/contacts': '<p>Контакты</p>',
      },
      { 'https://shop.ru/old-contacts': 'https://shop.ru/contacts' },
    );

    const snapshot = await scan(loader, 10);

    expect(snapshot.pages.map((page) => page.url)).toEqual([
      'https://shop.ru/',
      'https://shop.ru/contacts',
    ]);
  });

  it('недоступная главная — ошибка, а не пустой отчёт', async () => {
    const result = await createSiteScanner({ loader: siteLoader({}) }).scan(ROOT, {
      maxPages: 5,
      render: false,
    });

    expect(result.ok).toBe(false);
  });

  it('оболочка SPA и запрошенный рендер — подсказки в notChecked (ADR-0010)', async () => {
    const loader = siteLoader({
      'https://shop.ru/':
        '<div id="root"></div><script type="module" src="/assets/index.js"></script>',
    });

    const snapshot = await scan(loader, 5, true);

    expect(snapshot.notChecked).toEqual([
      RENDER_UNAVAILABLE,
      `https://shop.ru/: ${SPA_HINT}`,
      SCRIPT_COOKIES_NOTE,
    ]);
  });
});
