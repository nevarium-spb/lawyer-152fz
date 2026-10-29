import { toExcerpt } from '@lawyer-152fz/core';
import type {
  ConsentKind,
  CookieSnapshot,
  FormField,
  FormSnapshot,
  PageAnalyzer,
  PageSnapshot,
  ThirdPartyResource,
} from '@lawyer-152fz/core';
import { load } from 'cheerio';

import { parseSetCookie } from './cookies';
import { personalDataKind } from './personal-data';
import { vendorByUrl, vendorsInInlineScript } from './vendors';

/** Подпись чекбокса, похожая на согласие на обработку ПДн или с политикой. */
const CONSENT_LABEL = /согла[сш]|consent|персональн|обработк|политик|privacy|accept/i;
/**
 * «Нажимая кнопку, вы соглашаетесь…» — уведомление вместо отдельного согласия.
 * Основа «согла[сш]»: «согласие», но «соглашаетесь».
 */
const CONSENT_NOTICE =
  /(?:нажима|отправля|оставля|кликая|заполня)[^.]{0,100}(?:согла[сш]|подтвержда)|даю согласие|соглашаетесь|согласие на обработку/i;
/** Конец предложения: точка, восклицательный или вопросительный знак перед пробелом или концом текста. */
const SENTENCE_END = /[.!?](?=\s|$)/;
const POLICY_TEXT = /политик|конфиденциальн|персональн\S* данн|privacy|personal data/i;
const POLICY_HREF = /privacy|policy|politika|politic|konfidenc|personal|pdn|soglasie|agreement/i;
const COOKIE_NOTICE =
  /(?:использ|применя|собира)\S*[^.]{0,80}(?:cookie|куки)|(?:cookie|куки)[^.]{0,60}(?:использ|соглас|принима)|файл\S* cookie/i;
const SPA_ROOTS =
  '#root, #app, #__next, #__nuxt, #q-app, #svelte, [data-reactroot], app-root, [ng-version]';
const NO_SCRIPT_HINT = /enable javascript|включите javascript|need javascript/i;
/** Почти пустая страница — меньше этого видимого текста при наличии корня SPA. */
const SPA_TEXT_THRESHOLD = 200;
/** Родитель формы считаем «рядом с формой», только если он небольшой — иначе это вся страница. */
const NEAR_TEXT_LIMIT = 2000;
const SKIP_LINK = /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|jpe?g|png|gif|webp|svg|mp4|mp3|avi)$/i;
const NOT_DATA_FIELDS = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'checkbox']);
const EXCERPT = 300;
const SELECTOR_ATTR = 40;

export interface PageInput {
  readonly url: string;
  readonly html: string;
  /** Заголовки Set-Cookie; у DOM из браузера (`audit_html`) их нет. */
  readonly setCookies?: readonly string[];
}

export interface PageLink {
  readonly url: string;
  readonly text: string;
}

export interface PageAnalysis {
  readonly page: PageSnapshot;
  /** Ссылки на страницы того же сайта — для обхода. */
  readonly links: readonly PageLink[];
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** Разбор HTML страницы в снимок для правил аудита (T5.2). Чистая функция: сеть не трогает. */
export function analyzePage(input: PageInput): PageAnalysis {
  const base = new URL(input.url);
  const $ = load(input.html);
  $('template').remove();

  const absolute = (href: string | undefined): URL | undefined => {
    if (href === undefined || href.trim() === '') return undefined;
    try {
      return new URL(href.trim(), base);
    } catch {
      return undefined;
    }
  };
  /** Видимый текст; между элементами — пробел, иначе «формы?Напишите» и «ГлавнаяПлатформа» слипаются. */
  const visibleText = (selection: ReturnType<typeof $>) => {
    const copy = selection.clone();
    copy.find('script, style, noscript').remove();
    copy.find('*').after(' ');
    return copy.text().replace(/\s+/g, ' ').trim();
  };
  const isFirstParty = (url: URL) => {
    const host = bareHost(url.hostname);
    const own = bareHost(base.hostname);
    return host === own || host.endsWith(`.${own}`);
  };

  // ─── Поля и согласие ───────────────────────────────────────────────────────

  const labelOf = (field: ReturnType<typeof $>): string => {
    const id = field.attr('id');
    const byFor = id
      ? $('label')
          .filter((_, label) => $(label).attr('for') === id)
          .first()
      : undefined;
    // Первая непустая подпись: <label for>, обёртка <label>, aria-label, placeholder.
    const candidates = [
      byFor && byFor.length > 0 ? visibleText(byFor) : undefined,
      visibleText(field.closest('label')),
      field.attr('aria-label'),
      field.attr('placeholder'),
    ];
    return candidates.find((text) => text !== undefined && text.trim() !== '')?.trim() ?? '';
  };

  const describeFields = (fields: ReturnType<typeof $>): FormField[] =>
    fields.toArray().flatMap((element) => {
      const field = $(element);
      const tag = (field.prop('tagName') ?? '').toLowerCase();
      const type = tag === 'input' ? (field.attr('type') ?? 'text').toLowerCase() : tag;
      if (NOT_DATA_FIELDS.has(type)) return [];
      const label = labelOf(field);
      const name = field.attr('name') ?? field.attr('id') ?? '';
      const personalData = personalDataKind({
        type,
        autocomplete: field.attr('autocomplete'),
        hints: [
          name,
          field.attr('id') ?? '',
          field.attr('placeholder') ?? '',
          field.attr('aria-label') ?? '',
          label,
        ],
      });
      return [
        {
          name: name || '(без имени)',
          type,
          ...(label ? { label: toExcerpt(label, 120) } : {}),
          ...(personalData ? { personalData } : {}),
        },
      ];
    });

  const consentOf = (
    scope: ReturnType<typeof $>,
    nearText: string,
  ): { consent: ConsentKind; consentText?: string } => {
    for (const element of scope.find('input').toArray()) {
      const checkbox = $(element);
      if ((checkbox.attr('type') ?? '').toLowerCase() !== 'checkbox') continue;
      const label = labelOf(checkbox) || visibleText(checkbox.parent());
      if (!CONSENT_LABEL.test(label)) continue;
      return {
        consent: checkbox.attr('checked') === undefined ? 'checkbox' : 'prechecked-checkbox',
        consentText: toExcerpt(label, EXCERPT),
      };
    }
    // Текст родителя уже включает форму — берём его, иначе текст самой формы.
    const text = nearText || visibleText(scope);
    const notice = CONSENT_NOTICE.exec(text);
    if (!notice) return { consent: 'none' };
    // Только само предложение-уведомление, без соседнего текста страницы.
    const sentence = text.slice(notice.index);
    const end = SENTENCE_END.exec(sentence);
    return {
      consent: 'notice-only',
      consentText: toExcerpt(end ? sentence.slice(0, end.index + 1) : sentence, EXCERPT),
    };
  };

  const isPolicyLink = (anchor: ReturnType<typeof $>): boolean => {
    const url = absolute(anchor.attr('href'));
    return (
      POLICY_TEXT.test(visibleText(anchor)) || (url !== undefined && POLICY_HREF.test(url.pathname))
    );
  };

  // ─── Формы ─────────────────────────────────────────────────────────────────

  const forms: FormSnapshot[] = $('form')
    .toArray()
    .map((element, index) => {
      const form = $(element);
      const parent = form.parent();
      const parentIsNear =
        !parent.is('body, html') && visibleText(parent).length <= NEAR_TEXT_LIMIT;
      const near = parentIsNear ? parent : form;

      // id и name пишет автор сайта, а селектор в отчёте стоит вне пометки «данные цели аудита» (ADR-0006):
      // одна строка и короткая длина, чтобы в нём не поместилась инструкция.
      const attr = (value: string | undefined) =>
        value === undefined || value.trim() === '' ? undefined : toExcerpt(value, SELECTOR_ATTR);
      const id = attr(form.attr('id'));
      const name = attr(form.attr('name'));
      const selector = id
        ? `form#${id}`
        : name
          ? `form[name="${name}"]`
          : `форма №${String(index + 1)}`;
      const actionUrl = absolute(form.attr('action'));

      return {
        selector,
        action: actionUrl && /^https?:$/.test(actionUrl.protocol) ? actionUrl.href : base.href,
        method: (form.attr('method') ?? '').toLowerCase() === 'post' ? 'post' : 'get',
        fields: describeFields(form.find('input, select, textarea')),
        ...consentOf(form, parentIsNear ? visibleText(parent) : ''),
        hasPolicyLink: near
          .find('a[href]')
          .toArray()
          .some((anchor) => isPolicyLink($(anchor))),
      } satisfies FormSnapshot;
    });

  // Поля без <form> — частый случай в SPA: собираем их в одну условную форму.
  const orphanFields = describeFields(
    $('input, select, textarea').filter((_, element) => $(element).closest('form').length === 0),
  );

  const allPolicyLinks = $('a[href]')
    .toArray()
    .filter((anchor) => isPolicyLink($(anchor)))
    .map((anchor) => absolute($(anchor).attr('href'))?.href)
    .filter((href): href is string => href !== undefined);
  const policyLinks = [...new Set(allPolicyLinks)];

  if (orphanFields.some((field) => field.personalData !== undefined)) {
    const outsideForms = $('body').clone();
    outsideForms.find('form').remove();
    forms.push({
      selector: 'поля вне <form>',
      action: base.href,
      method: 'post',
      fields: orphanFields,
      ...consentOf(outsideForms, ''),
      hasPolicyLink: policyLinks.length > 0,
    });
  }

  // ─── Сторонние сервисы ─────────────────────────────────────────────────────

  const thirdParties: ThirdPartyResource[] = [];
  const seen = new Set<string>();
  const addResource = (resource: ThirdPartyResource) => {
    const key = `${resource.kind}|${resource.vendor ?? ''}|${resource.url ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    thirdParties.push(resource);
  };
  const addByUrl = (
    kind: ThirdPartyResource['kind'],
    src: string | undefined,
    onlyKnown: boolean,
  ) => {
    const url = absolute(src);
    if (!url || !/^https?:$/.test(url.protocol) || isFirstParty(url)) return;
    const vendor = vendorByUrl(url);
    if (vendor) addResource({ kind, url: url.href, ...vendor });
    else if (!onlyKnown)
      addResource({ kind, url: url.href, category: 'other', jurisdiction: 'unknown' });
  };

  // Форма, которая отправляет данные на чужой адрес, — тоже сторонний сервис (Mailchimp, HubSpot…).
  for (const form of forms) {
    const action = new URL(form.action);
    if (isFirstParty(action)) continue;
    const vendor = vendorByUrl(action);
    addResource({
      kind: 'form-action',
      url: action.href,
      ...(vendor ?? { category: 'forms' as const, jurisdiction: 'unknown' as const }),
    });
  }

  $('script').each((_, element) => {
    const script = $(element);
    const src = script.attr('src');
    if (src !== undefined) {
      addByUrl('script', src, false);
      return;
    }
    if ((script.attr('type') ?? '').includes('json')) return;
    for (const vendor of vendorsInInlineScript(script.text()))
      addResource({ kind: 'inline-script', ...vendor });
  });
  $('iframe[src]').each((_, element) => {
    addByUrl('iframe', $(element).attr('src'), false);
  });
  // Стили и шрифты со стороннего сервера (Google Fonts) тоже получают IP посетителя; CDN без сигнатур не считаем.
  $('link[href]').each((_, element) => {
    const link = $(element);
    if (/\bstylesheet\b/i.test(link.attr('rel') ?? ''))
      addByUrl('stylesheet', link.attr('href'), true);
  });
  $('img[src]').each((_, element) => {
    addByUrl('pixel', $(element).attr('src'), true);
  });
  // Пиксели счётчиков часто лежат в <noscript>, а его содержимое парсер видит как текст.
  $('noscript').each((_, element) => {
    const inner = load($(element).text());
    inner('img[src]').each((__, image) => {
      addByUrl('pixel', inner(image).attr('src'), true);
    });
  });

  // ─── Cookie, уведомление, SPA, ссылки ──────────────────────────────────────

  const cookies: CookieSnapshot[] = (input.setCookies ?? [])
    .map((header) => parseSetCookie(header, base.hostname))
    .filter((cookie): cookie is CookieSnapshot => cookie !== undefined);

  const bodyText = visibleText($('body'));
  const hasCookieNotice =
    COOKIE_NOTICE.test(bodyText) ||
    $('[id], [class]')
      .toArray()
      .some((element) =>
        /cookie/i.test(`${$(element).attr('id') ?? ''} ${$(element).attr('class') ?? ''}`),
      );

  const renderedByScript =
    forms.length === 0 &&
    bodyText.length < SPA_TEXT_THRESHOLD &&
    ($(SPA_ROOTS).length > 0 ||
      $('script[type="module"]').length > 0 ||
      NO_SCRIPT_HINT.test($('noscript').text()));

  const links: PageLink[] = [];
  const linked = new Set<string>([base.href.replace(/#.*$/, '')]);
  $('a[href]').each((_, element) => {
    const anchor = $(element);
    const url = absolute(anchor.attr('href'));
    if (
      !url ||
      !/^https?:$/.test(url.protocol) ||
      bareHost(url.hostname) !== bareHost(base.hostname)
    )
      return;
    url.hash = '';
    if (SKIP_LINK.test(url.pathname) || linked.has(url.href)) return;
    linked.add(url.href);
    links.push({ url: url.href, text: toExcerpt(visibleText(anchor), 120) });
  });

  return {
    page: {
      url: base.href,
      isHttps: base.protocol === 'https:',
      forms,
      thirdParties,
      cookies,
      policyLinks,
      hasCookieNotice,
      renderedByScript,
    },
    links,
  };
}

/** Порт ядра для `audit_html`: разбор DOM, который передал хост (ADR-0010). */
export const pageAnalyzer: PageAnalyzer = {
  analyze: (page) => analyzePage(page).page,
};
