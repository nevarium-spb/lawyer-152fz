import { runRules } from '@lawyer-152fz/core';
import type { FormSnapshot, PageSnapshot, SiteRule, SiteSnapshot } from '@lawyer-152fz/core';
import { makePage, makeSiteSnapshot } from '@lawyer-152fz/core/testing';
import { describe, expect, it } from 'vitest';

import { SITE_RULES } from '../index';
import { countersNoticeRule } from './counters-notice';
import { foreignServicesRule } from './foreign-services';
import { formConsentRule } from './form-consent';
import { httpsRule } from './https';
import { policyPublishedRule } from './policy-published';
import { specialCategoriesRule } from './special-categories';
import { describePersonalData, groupBy } from './shared';

const POLICY = 'https://site.ru/privacy';

function makeForm(overrides: Partial<FormSnapshot> = {}): FormSnapshot {
  return {
    selector: 'form#lead',
    action: 'https://site.ru/lead',
    method: 'post',
    fields: [
      { name: 'name', type: 'text', label: 'Ваше имя', personalData: 'name' },
      { name: 'phone', type: 'tel', personalData: 'phone' },
    ],
    consent: 'checkbox',
    hasPolicyLink: true,
    ...overrides,
  };
}

const page = (overrides: Partial<PageSnapshot> = {}) =>
  makePage({ url: 'https://site.ru/', policyLinks: [POLICY], forms: [makeForm()], ...overrides });

const site = (...pages: PageSnapshot[]): SiteSnapshot =>
  makeSiteSnapshot({ rootUrl: 'https://site.ru/', pages });

/** Находки через runRules: схема находки и объявленные нормы проверяются по пути. */
function check(rule: SiteRule, snapshot: SiteSnapshot) {
  const outcome = runRules([rule], snapshot);
  expect(outcome.notChecked).toEqual([]);
  return outcome.findings;
}

describe('PD-FORM-CONSENT', () => {
  it('форма с отдельной галочкой — без находок', () => {
    expect(check(formConsentRule, site(page()))).toEqual([]);
  });

  it('форма без согласия — нарушение с перечнем данных', () => {
    const [finding] = check(
      formConsentRule,
      site(page({ forms: [makeForm({ consent: 'none' })] })),
    );

    expect(finding).toMatchObject({
      ruleId: 'PD-FORM-CONSENT',
      kind: 'violation',
      severity: 'high',
      confidence: 'deterministic',
      title:
        'Форма собирает имя и телефон, но не запрашивает согласие на обработку персональных данных',
      normRefs: ['152-fz/art-9/part-1', '152-fz/art-6/part-1', 'koap/art-13.11/part-1'],
    });
    expect(finding?.evidence).toEqual([
      {
        type: 'page',
        url: 'https://site.ru/',
        selector: 'form#lead',
        untrustedExcerpt: 'Ваше имя (name), phone',
      },
    ]);
  });

  it('галочка отмечена заранее и «нажимая кнопку…» — отдельные нарушения', () => {
    const findings = check(
      formConsentRule,
      site(
        page({
          forms: [
            makeForm({ selector: 'form#a', consent: 'prechecked-checkbox' }),
            makeForm({
              selector: 'form#b',
              consent: 'notice-only',
              consentText: 'Нажимая кнопку, вы соглашаетесь',
            }),
          ],
        }),
      ),
    );

    expect(
      findings.map((finding) => [finding.severity, finding.confidence, finding.title.slice(0, 30)]),
    ).toEqual([
      ['high', 'deterministic', 'Галочка согласия в форме уже о'],
      ['medium', 'needs-review', 'Согласие получено только фразо'],
    ]);
  });

  it('поля вне <form> без согласия — риск на проверку, а не установленное нарушение (T7.5)', () => {
    const page = makePage({
      url: 'https://site.ru/tool',
      forms: [
        {
          selector: 'поля вне <form>',
          action: 'https://site.ru/tool',
          method: 'post',
          fields: [{ name: 'email', type: 'email', personalData: 'email' }],
          outsideForm: true,
          consent: 'none',
          hasPolicyLink: true,
        },
      ],
    });

    const [finding] = formConsentRule.check(makeSiteSnapshot({ pages: [page] }));

    expect(finding).toMatchObject({ kind: 'risk', confidence: 'needs-review' });
  });

  it('одна форма с разным ?backurl в адресе отправки — одна находка (T7.5)', () => {
    const form = (backurl: string) => ({
      selector: 'form[name="auth"]',
      action: `https://site.ru/auth/?backurl=${backurl}`,
      method: 'post' as const,
      fields: [{ name: 'email', type: 'email', personalData: 'email' as const }],
      consent: 'none' as const,
      hasPolicyLink: false,
    });
    const pages = [
      makePage({ url: 'https://site.ru/auth/?backurl=a', forms: [form('a')] }),
      makePage({ url: 'https://site.ru/auth/?backurl=b', forms: [form('b')] }),
    ];

    expect(formConsentRule.check(makeSiteSnapshot({ pages }))).toHaveLength(1);
  });

  it('форма без полей ПДн (поиск) не проверяется', () => {
    const search = makeForm({ consent: 'none', fields: [{ name: 'q', type: 'search' }] });
    expect(check(formConsentRule, site(page({ forms: [search] })))).toEqual([]);
  });

  it('одна форма в подвале на многих страницах — одна находка с доказательствами по страницам', () => {
    const footer = makeForm({
      selector: 'form.subscribe',
      consent: 'none',
      fields: [{ name: 'email', type: 'email', personalData: 'email' }],
    });
    const pages = Array.from({ length: 7 }, (_, i) =>
      page({ url: `https://site.ru/p${String(i)}`, forms: [footer] }),
    );

    const findings = check(formConsentRule, site(...pages));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toBe(
      'Форма собирает e-mail, но не запрашивает согласие на обработку персональных данных — на 7 страницах',
    );
    expect(findings[0]?.evidence).toHaveLength(5);
  });
});

describe('PD-POLICY-PUBLISHED', () => {
  it('политика рядом с формой — без находок', () => {
    expect(check(policyPublishedRule, site(page()))).toEqual([]);
  });

  it('на странице с формой нет ссылки на политику — нарушение', () => {
    const findings = check(
      policyPublishedRule,
      site(page({ policyLinks: [] }), page({ url: 'https://site.ru/b', policyLinks: [] })),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: 'violation',
      title:
        'На странице с формой нет ссылки на политику обработки персональных данных — на 2 страницах',
      normRefs: ['152-fz/art-18.1/part-2', 'koap/art-13.11/part-3'],
    });
  });

  it('политика на странице есть, но не у формы — рекомендация', () => {
    const [finding] = check(
      policyPublishedRule,
      site(page({ forms: [makeForm({ hasPolicyLink: false })] })),
    );

    expect(finding).toMatchObject({
      kind: 'recommendation',
      severity: 'low',
      normRefs: ['152-fz/art-18.1/part-2'],
    });
  });

  it('страница без форм с ПДн не требует политики', () => {
    expect(check(policyPublishedRule, site(page({ forms: [], policyLinks: [] })))).toEqual([]);
  });
});

describe('PD-HTTPS', () => {
  it('HTTPS-страница с формой на HTTPS — без находок', () => {
    expect(check(httpsRule, site(page()))).toEqual([]);
  });

  it('страница с формой по HTTP — нарушение', () => {
    const [finding] = check(
      httpsRule,
      site(
        page({
          url: 'http://site.ru/',
          isHttps: false,
          forms: [makeForm({ action: 'http://site.ru/lead' })],
        }),
      ),
    );

    expect(finding).toMatchObject({
      kind: 'violation',
      title: 'Страница с формой открывается по незащищённому HTTP',
    });
  });

  it.each([
    'http://localhost:5173/start',
    'http://127.0.0.1:3000/',
    'http://site.local/',
    'http://192.168.1.5/',
  ])('локальный адрес %s без HTTPS — справка, а не нарушение (T5.8)', (url) => {
    const findings = check(
      httpsRule,
      site(page({ url, isHttps: false, forms: [makeForm({ action: url })] })),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'recommendation', severity: 'info' });
  });

  it('HTTPS-страница отправляет форму на HTTP-адрес — нарушение с адресом', () => {
    const [finding] = check(
      httpsRule,
      site(page({ forms: [makeForm({ action: 'http://crm.site.ru/lead' })] })),
    );

    expect(finding?.title).toBe(
      'Форма отправляет имя и телефон по незащищённому HTTP на crm.site.ru',
    );
    expect(finding?.evidence[0]).toMatchObject({
      untrustedExcerpt: 'action: http://crm.site.ru/lead',
    });
  });
});

describe('PD-FOREIGN-SERVICES', () => {
  it('только российские и неопознанные сервисы — без находок', () => {
    const snapshot = site(
      page({
        thirdParties: [
          {
            kind: 'inline-script',
            vendor: 'Яндекс Метрика',
            category: 'analytics',
            jurisdiction: 'ru',
          },
          {
            kind: 'form-action',
            url: 'https://forms.tildacdn.com/',
            category: 'forms',
            jurisdiction: 'unknown',
          },
        ],
      }),
    );
    expect(check(foreignServicesRule, snapshot)).toEqual([]);
  });

  it('иностранная форма, аналитика и капча — три уровня важности', () => {
    const snapshot = site(
      page({
        thirdParties: [
          {
            kind: 'form-action',
            url: 'https://x.list-manage.com/subscribe',
            vendor: 'Mailchimp',
            category: 'forms',
            jurisdiction: 'foreign',
          },
          {
            kind: 'script',
            url: 'https://www.googletagmanager.com/gtag/js',
            vendor: 'Google Tag Manager',
            category: 'analytics',
            jurisdiction: 'foreign',
          },
          {
            kind: 'script',
            url: 'https://www.google.com/recaptcha/api.js',
            vendor: 'Google reCAPTCHA',
            category: 'captcha',
            jurisdiction: 'foreign',
          },
        ],
      }),
      page({
        url: 'https://site.ru/contacts',
        thirdParties: [
          {
            kind: 'script',
            url: 'https://www.googletagmanager.com/gtag/js',
            vendor: 'Google Tag Manager',
            category: 'analytics',
            jurisdiction: 'foreign',
          },
        ],
      }),
    );

    const findings = check(foreignServicesRule, snapshot);

    expect(findings.map((finding) => [finding.kind, finding.severity, finding.title])).toEqual([
      ['risk', 'high', 'Данные посетителей уходят в иностранный сервис Mailchimp'],
      [
        'risk',
        'medium',
        'Иностранный сервис аналитики или рекламы: Google Tag Manager — на 2 страницах',
      ],
      ['recommendation', 'low', 'Иностранный сервис на сайте: Google reCAPTCHA'],
    ]);
    expect(findings.every((finding) => finding.confidence === 'needs-review')).toBe(true);
    expect(findings[0]?.normRefs).toContain('koap/art-13.11/part-8');
  });
});

describe('PD-COUNTERS-NOTICE', () => {
  const metrika = {
    kind: 'inline-script' as const,
    vendor: 'Яндекс Метрика',
    category: 'analytics' as const,
    jurisdiction: 'ru' as const,
  };

  it('счётчик и баннер cookie — без находок; без счётчиков — тоже', () => {
    expect(
      check(countersNoticeRule, site(page({ thirdParties: [metrika], hasCookieNotice: true }))),
    ).toEqual([]);
    expect(check(countersNoticeRule, site(page()))).toEqual([]);
  });

  it('счётчики без уведомления — низкий риск, требует проверки', () => {
    const [finding] = check(
      countersNoticeRule,
      site(
        page({
          thirdParties: [
            metrika,
            {
              kind: 'script',
              url: 'https://cdn.x/y.js',
              category: 'analytics',
              jurisdiction: 'unknown',
            },
          ],
        }),
      ),
    );

    expect(finding).toMatchObject({
      kind: 'risk',
      severity: 'low',
      confidence: 'needs-review',
      title: 'Счётчики (Яндекс Метрика) работают без уведомления об использовании cookie',
    });
  });

  it('неопознанный счётчик без названия — без перечня в заголовке', () => {
    const [finding] = check(
      countersNoticeRule,
      site(
        page({
          thirdParties: [
            {
              kind: 'script',
              url: 'https://cdn.x/y.js',
              category: 'advertising',
              jurisdiction: 'unknown',
            },
          ],
        }),
      ),
    );
    expect(finding?.title).toBe('Счётчики работают без уведомления об использовании cookie');
  });
});

describe('PD-SPECIAL-CATEGORIES', () => {
  const healthForm = (overrides: Partial<FormSnapshot> = {}) =>
    makeForm({
      selector: 'form#anketa',
      fields: [
        { name: 'name', type: 'text', label: 'Ваше имя', personalData: 'name' },
        {
          name: 'symptoms',
          type: 'textarea',
          label: 'Опишите симптомы',
          specialCategory: 'health',
        },
      ],
      ...overrides,
    });

  it('форма без таких полей — без находок', () => {
    expect(check(specialCategoriesRule, site(page()))).toEqual([]);
  });

  it('поле о здоровье — риск «нужна проверка», а не установленное нарушение', () => {
    const [finding] = check(specialCategoriesRule, site(page({ forms: [healthForm()] })));

    expect(finding).toMatchObject({
      ruleId: 'PD-SPECIAL-CATEGORIES',
      kind: 'risk',
      severity: 'high',
      confidence: 'needs-review',
      title: 'Форма, судя по подписям полей, просит сведения о состоянии здоровья',
      normRefs: [
        '152-fz/art-10/part-1',
        '152-fz/art-10/part-2',
        '152-fz/art-9/part-4',
        'koap/art-13.11/part-2',
      ],
    });
    expect(finding?.evidence).toEqual([
      {
        type: 'page',
        url: 'https://site.ru/',
        selector: 'form#anketa',
        untrustedExcerpt: 'Опишите симптомы (symptoms)',
      },
    ]);
    expect(finding?.remediation).toContain('обычная галочка согласия не подходит');
  });

  it('галочка согласия не снимает находку: нужна письменная форма', () => {
    const findings = check(
      specialCategoriesRule,
      site(page({ forms: [healthForm({ consent: 'checkbox' })] })),
    );
    expect(findings).toHaveLength(1);
  });

  it('биометрия добавляет нормы ст. 11 и напоминание, что предоставление не обязательно', () => {
    const [finding] = check(
      specialCategoriesRule,
      site(
        page({
          forms: [
            healthForm({
              fields: [
                {
                  name: 'fp',
                  type: 'text',
                  label: 'Отпечаток пальца',
                  specialCategory: 'biometric',
                },
              ],
            }),
          ],
        }),
      ),
    );
    expect(finding?.normRefs).toEqual([
      '152-fz/art-11/part-1',
      '152-fz/art-11/part-3',
      '152-fz/art-9/part-4',
      'koap/art-13.11/part-2',
    ]);
    expect(finding?.title).toContain('биометрических данных');
    expect(finding?.remediation).toContain('не может быть обязательным');
  });

  it('одна форма на нескольких страницах — одна находка', () => {
    const findings = check(
      specialCategoriesRule,
      site(
        page({ forms: [healthForm()] }),
        page({ url: 'https://site.ru/contacts', forms: [healthForm()] }),
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('на 2 страницах');
  });
});

describe('реестр правил сайта', () => {
  it('идентификаторы уникальны, у каждого правила есть нормы', () => {
    const ids = SITE_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SITE_RULES.every((rule) => rule.normRefs.length > 0)).toBe(true);
  });

  it('чистый сайт — ни одной находки от всех правил', () => {
    expect(
      runRules(SITE_RULES, site(page(), page({ url: 'https://site.ru/about', forms: [] }))),
    ).toEqual({
      findings: [],
      notChecked: [],
    });
  });

  it('вспомогательные функции: перечень данных и группировка', () => {
    expect(describePersonalData([])).toBe('');
    expect(describePersonalData(['email'])).toBe('e-mail');
    expect(describePersonalData(['name', 'birthdate', 'document', 'address'])).toBe(
      'имя, дату рождения, данные документов и адрес',
    );
    expect(groupBy([1, 2, 3, 4], (n) => String(n % 2))).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });
});
