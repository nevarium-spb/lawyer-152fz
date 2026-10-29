import { ok } from '@lawyer-152fz/core';
import type { PageSnapshot, SiteScanner, SiteSnapshot } from '@lawyer-152fz/core';

import { analyzePage } from '../html/analyze-page';
import type { PageLink } from '../html/analyze-page';
import type { PageLoader } from '../network/static-page-loader';

/** Подсказка для SPA: что делать, если статическая загрузка видит пустую оболочку (ADR-0010). */
export const SPA_HINT =
  'страница отрисовывается скриптами (SPA) — формы и счётчики не видны статической загрузке. ' +
  'Откройте её в браузере и передайте DOM через audit_html или проверьте исходники через audit_codebase';

export const RENDER_UNAVAILABLE =
  'рендер страниц в браузере в этой версии не поддерживается (ADR-0010) — для SPA используйте audit_html';

export const SCRIPT_COOKIES_NOTE =
  'cookie и запросы, которые скрипты создают после загрузки страницы, статический анализ не видит';

/**
 * Страницы, где чаще всего собирают ПДн и где должна быть политика, — в начало очереди.
 * 0 — формы и заявки, 1 — контакты и политика, 2 — остальное.
 */
const FORM_PAGES =
  /заявк|запис|заказ|обратн|связ|регистр|оформ|корзин|оплат|подпис|order|checkout|cart|signup|register|feedback|booking|form|login|вход/i;
const INFO_PAGES =
  /контакт|contact|политик|конфиденциальн|персональн|privacy|policy|cookie|about|о нас|компани/i;

/** Путь ссылки для поиска слов; битое %-кодирование на сайте не должно ронять обход. */
function readablePath(url: string): string {
  const { pathname } = new URL(url);
  try {
    return decodeURI(pathname);
  } catch {
    return pathname;
  }
}

function priority(link: PageLink): number {
  const text = `${link.text} ${readablePath(link.url)}`;
  if (FORM_PAGES.test(text)) return 0;
  if (INFO_PAGES.test(text)) return 1;
  return 2;
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, '');
const pageKey = (url: string) => {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.href.replace(/\/$/, '');
};

export interface SiteScannerDeps {
  readonly loader: PageLoader;
}

/**
 * Обход сайта (T5.3): тот же домен, не больше `maxPages` страниц, страницы по одной.
 * Порядок детерминирован: приоритет страницы, затем порядок, в котором ссылка найдена.
 */
export function createSiteScanner(deps: SiteScannerDeps): SiteScanner {
  return {
    async scan(url, options) {
      const root = await deps.loader.load(url);
      if (!root.ok) return root;

      const notChecked: string[] = [];
      if (options.render) notChecked.push(RENDER_UNAVAILABLE);

      const siteHost = bareHost(new URL(root.value.url).hostname);
      const pages: PageSnapshot[] = [];
      const visited = new Set<string>([pageKey(url), pageKey(root.value.url)]);
      const queue: { link: PageLink; priority: number; order: number }[] = [];
      let discovered = 0;

      const enqueue = (links: readonly PageLink[]) => {
        for (const link of links) {
          const key = pageKey(link.url);
          if (visited.has(key)) continue;
          visited.add(key);
          queue.push({ link, priority: priority(link), order: discovered++ });
        }
        queue.sort((a, b) => a.priority - b.priority || a.order - b.order);
      };

      const first = analyzePage(root.value);
      pages.push(first.page);
      enqueue(first.links);

      const alreadyScanned = (url: string) =>
        pages.some((page) => pageKey(page.url) === pageKey(url));

      while (pages.length < options.maxPages) {
        const next = queue.shift();
        if (!next) break;
        // Страница могла попасть в снимок раньше — через редирект с другой ссылки.
        if (alreadyScanned(next.link.url)) continue;

        const loaded = await deps.loader.load(next.link.url);
        if (!loaded.ok) {
          notChecked.push(`${next.link.url}: ${loaded.error.message}`);
          continue;
        }
        if (bareHost(new URL(loaded.value.url).hostname) !== siteHost) {
          notChecked.push(`${next.link.url}: перенаправляет на другой сайт (${loaded.value.url})`);
          continue;
        }
        if (alreadyScanned(loaded.value.url)) continue;

        const analysis = analyzePage(loaded.value);
        pages.push(analysis.page);
        enqueue(analysis.links);
      }

      if (queue.length > 0) {
        notChecked.push(
          `ещё ${String(queue.length)} страниц сайта не проверены: лимит ${String(options.maxPages)} страниц`,
        );
      }
      for (const page of pages) {
        if (page.renderedByScript) notChecked.push(`${page.url}: ${SPA_HINT}`);
      }
      notChecked.push(SCRIPT_COOKIES_NOTE);

      const snapshot: SiteSnapshot = { rootUrl: root.value.url, pages, notChecked };
      return ok(snapshot);
    },
  };
}
