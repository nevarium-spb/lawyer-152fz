import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { analyzePage } from './analyze-page';
import { parseSetCookie } from './cookies';
import { personalDataKind } from './personal-data';
import { vendorByUrl, vendorsInInlineScript } from './vendors';

const PAGE_URL = 'https://site.ru/page';
const fixture = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/html/${name}`, import.meta.url), 'utf8');
const analyze = (name: string) => analyzePage({ url: PAGE_URL, html: fixture(name) }).page;
const vendors = (page: ReturnType<typeof analyze>) =>
  page.thirdParties.map((resource) => resource.vendor);

describe('анализ страницы по фикстурам (T5.2)', () => {
  it('Tilda с галочкой согласия: поля ПДн, согласие, политика у формы, Метрика', () => {
    const page = analyze('01-tilda-consent.html');
    const [form] = page.forms;

    expect(form).toMatchObject({
      selector: 'form#form123',
      method: 'post',
      action: 'https://forms.tildacdn.com/procces/',
      consent: 'checkbox',
      hasPolicyLink: true,
    });
    expect(form?.fields.map((field) => field.personalData)).toEqual(['name', 'phone', 'email']);
    expect(form?.consentText).toContain('Я согласен на обработку персональных данных');
    expect(page.thirdParties).toEqual([
      {
        kind: 'inline-script',
        vendor: 'Яндекс Метрика',
        category: 'analytics',
        jurisdiction: 'ru',
      },
    ]);
    expect(page.policyLinks).toContain('https://site.ru/policy');
  });

  it('Tilda с текстом «Нажимая на кнопку…» — уведомление вместо согласия', () => {
    const [form] = analyze('02-tilda-notice.html').forms;

    expect(form?.consent).toBe('notice-only');
    expect(form?.consentText).toMatch(/^Нажимая на кнопку, вы даете согласие/);
    expect(form?.hasPolicyLink).toBe(true);
  });

  it('WordPress + Contact Form 7: галочка acceptance, GA4 через GTM, баннер cookie', () => {
    const page = analyze('03-wordpress-cf7.html');
    const [form] = page.forms;

    expect(form?.consent).toBe('checkbox');
    expect(form?.selector).toBe('форма №1');
    expect(form?.fields.filter((field) => field.personalData).map((field) => field.name)).toEqual([
      'your-name',
      'your-email',
      'your-tel',
    ]);
    expect(form?.hasPolicyLink).toBe(false);
    expect(vendors(page)).toEqual(['Google Tag Manager', 'Google Analytics']);
    expect(page.thirdParties.every((resource) => resource.jurisdiction === 'foreign')).toBe(true);
    expect(page.hasCookieNotice).toBe(true);
  });

  it('заранее отмеченная галочка и reCAPTCHA', () => {
    const page = analyze('04-wordpress-prechecked.html');

    expect(page.forms[0]?.consent).toBe('prechecked-checkbox');
    expect(page.forms[0]?.fields.map((field) => field.personalData)).toEqual([
      'name',
      'address',
      'phone',
    ]);
    expect(vendors(page)).toEqual(['Google reCAPTCHA']);
  });

  it('DOM React-приложения: поля без <form> собраны в условную форму, подписи из label for', () => {
    const page = analyze('05-react-rendered.html');
    const [form] = page.forms;

    expect(page.renderedByScript).toBe(false);
    expect(form?.selector).toBe('поля вне <form>');
    expect(form?.fields).toEqual([
      { name: 'fullName', type: 'text', label: 'ФИО пациента', personalData: 'name' },
      { name: 'birth', type: 'date', label: 'Дата рождения', personalData: 'birthdate' },
      { name: 'contactPhone', type: 'text', label: 'Контактный телефон', personalData: 'phone' },
    ]);
    expect(form?.consent).toBe('checkbox');
    expect(form?.hasPolicyLink).toBe(true);
  });

  it('оболочка SPA (Vite) распознана: форм нет, но это не «чисто», а «не видно»', () => {
    const page = analyze('06-spa-shell.html');

    expect(page.renderedByScript).toBe(true);
    expect(page.forms).toEqual([]);
  });

  it('форма поиска — без персональных данных; ссылки для обхода без файлов, якорей и чужих сайтов', () => {
    const { page, links } = analyzePage({ url: PAGE_URL, html: fixture('07-search-only.html') });

    expect(page.forms[0]?.fields).toEqual([
      { name: 'q', type: 'search', label: 'Поиск по каталогу' },
    ]);
    expect(page.forms[0]?.method).toBe('get');
    expect(links.map((link) => link.url)).toEqual([
      'https://site.ru/catalog/sad',
      'https://site.ru/catalog/dom',
      'https://site.ru/policy.html',
    ]);
    expect(links[0]?.text).toBe('Сад');
  });

  it('форма на HTTPS-странице отправляется по HTTP — адрес отправки сохранён', () => {
    const [form] = analyze('08-http-action.html').forms;

    expect(form?.action).toBe('http://crm.autoservis.ru/lead');
    expect(form?.fields.map((field) => field.personalData)).toEqual(['name', 'phone', undefined]);
  });

  it('иностранные сервисы: пиксель Meta в <noscript>, Hotjar, Google Forms, YouTube; Mailchimp без согласия', () => {
    const page = analyze('09-foreign-services.html');

    expect(page.thirdParties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'inline-script', vendor: 'Пиксель Meta (Facebook)' }),
        expect.objectContaining({ kind: 'pixel', vendor: 'Пиксель Meta (Facebook)' }),
        expect.objectContaining({ kind: 'inline-script', vendor: 'Hotjar' }),
        expect.objectContaining({ kind: 'iframe', vendor: 'Google Forms', category: 'forms' }),
        expect.objectContaining({ kind: 'iframe', vendor: 'YouTube' }),
        {
          kind: 'script',
          url: 'https://cdn.example-widgets.net/widget.js',
          category: 'other',
          jurisdiction: 'unknown',
        },
      ]),
    );
    // Своя картинка — не сторонний пиксель.
    expect(page.thirdParties.some((resource) => resource.url?.includes('logo.png'))).toBe(false);
    expect(page.forms[0]).toMatchObject({
      action: 'https://school.us21.list-manage.com/subscribe/post?u=abc&id=def',
      consent: 'none',
    });
  });

  it('виджет Битрикс24 без <form>: поля ПДн без согласия', () => {
    const page = analyze('10-bitrix-orphan.html');

    expect(vendors(page)).toEqual(['Битрикс24']);
    expect(page.forms).toEqual([
      expect.objectContaining({
        selector: 'поля вне <form>',
        consent: 'none',
        hasPolicyLink: false,
      }),
    ]);
  });

  it('подписка в подвале: политика есть на странице, но не у формы; JivoSite; баннер cookie по классу', () => {
    const page = analyze('11-footer-subscribe.html');

    expect(page.forms[0]).toMatchObject({ consent: 'none', hasPolicyLink: false });
    expect(page.policyLinks).toEqual(['https://site.ru/privacy-policy']);
    expect(page.thirdParties[0]).toMatchObject({
      vendor: 'JivoSite',
      url: 'https://code.jivosite.com/widget/AbCdEf',
    });
    expect(page.hasCookieNotice).toBe(true);
  });

  it('название компании и промокод — не ПДн; скрытые поля не попадают в список', () => {
    const [form] = analyze('12-login-company.html').forms;

    expect(form?.fields).toEqual([
      { name: 'companyName', type: 'text', label: 'Название компании' },
      { name: 'promo_code', type: 'text', label: 'Промокод' },
      { name: 'login', type: 'email', personalData: 'email' },
      { name: 'password', type: 'password' },
    ]);
  });

  it('cookie из заголовков ответа: имя и домен, без значения', () => {
    const { page } = analyzePage({
      url: 'https://www.site.ru/',
      html: '<p>Главная</p>',
      setCookies: ['_ym_uid=123; Domain=.site.ru; Path=/', 'PHPSESSID=abc; HttpOnly', '=пусто'],
    });

    expect(page.cookies).toEqual([
      { name: '_ym_uid', domain: 'site.ru' },
      { name: 'PHPSESSID', domain: 'www.site.ru' },
    ]);
    expect(page.isHttps).toBe(true);
  });

  it('страница по HTTP и битые ссылки не ломают разбор', () => {
    const { page, links } = analyzePage({
      url: 'http://site.ru/',
      html: '<a href="http://[broken">x</a><a href="javascript:void(0)">y</a><script src=""></script><form action="javascript:send()"><input name="email"></form>',
    });

    expect(page.isHttps).toBe(false);
    expect(page.forms[0]?.action).toBe('http://site.ru/');
    expect(links).toEqual([]);
  });
});

describe('классификация полей', () => {
  it.each([
    [{ type: 'email', hints: [] }, 'email'],
    [{ type: 'tel', hints: [] }, 'phone'],
    [{ type: 'text', autocomplete: 'given-name', hints: [] }, 'name'],
    [{ type: 'text', autocomplete: 'street-address', hints: [] }, 'address'],
    [{ type: 'text', autocomplete: 'bday', hints: [] }, 'birthdate'],
    [{ type: 'text', hints: ['userPhone'] }, 'phone'],
    [{ type: 'text', hints: ['your_name'] }, 'name'],
    [{ type: 'text', hints: ['Адрес электронной почты'] }, 'email'],
    [{ type: 'text', hints: ['Серия и номер паспорта'] }, 'document'],
    [{ type: 'text', hints: ['ИНН'] }, 'document'],
    [{ type: 'text', hints: ['Имя'] }, 'name'],
    [{ type: 'text', hints: ['Иннокентий'] }, undefined],
    [{ type: 'text', hints: ['Имя компании'] }, undefined],
    [{ type: 'text', hints: ['Тема сообщения'] }, undefined],
    [{ type: 'text', hints: ['telegram'] }, undefined],
    [{ type: 'hidden', hints: ['email'] }, undefined],
    [{ type: 'text', autocomplete: 'off', hints: ['comment'] }, undefined],
  ])('%o → %s', (field, expected) => {
    expect(personalDataKind(field)).toBe(expected);
  });
});

describe('сигнатуры сервисов и cookie', () => {
  it('узнаёт сервис по поддомену и пути, но не по похожему имени', () => {
    expect(vendorByUrl(new URL('https://region1.google-analytics.com/g/collect'))?.vendor).toBe(
      'Google Analytics',
    );
    expect(vendorByUrl(new URL('https://www.google.com/recaptcha/api.js'))?.vendor).toBe(
      'Google reCAPTCHA',
    );
    expect(vendorByUrl(new URL('https://www.google.com/maps'))).toBeUndefined();
    expect(vendorByUrl(new URL('https://notgoogle-analytics.com/x.js'))).toBeUndefined();
  });

  it('встроенный скрипт может подключать несколько сервисов', () => {
    const code = "ym(1, 'init'); gtag('config', 'G-1');";
    expect(vendorsInInlineScript(code).map((match) => match.vendor)).toEqual([
      'Яндекс Метрика',
      'Google Analytics',
    ]);
  });

  it('пустой Domain= — cookie остаётся на хосте страницы', () => {
    expect(parseSetCookie('a=1; Domain=', 'site.ru')).toEqual({ name: 'a', domain: 'site.ru' });
  });
});
