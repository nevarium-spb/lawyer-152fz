import type { Jurisdiction, ThirdPartyCategory } from '@lawyer-152fz/core';

/**
 * Сигнатуры сторонних сервисов, которые получают данные посетителей.
 * Юрисдикция — где находится оператор сервиса: для иностранных важны локализация (ч. 5 ст. 18)
 * и трансграничная передача (ст. 12). Если однозначно сказать нельзя — сервис сюда не попадает.
 */
interface VendorSignature {
  readonly vendor: string;
  readonly category: ThirdPartyCategory;
  readonly jurisdiction: Exclude<Jurisdiction, 'unknown'>;
  /** Хост или родительский домен ресурса. */
  readonly hosts: readonly string[];
  /** Начало пути, если по хосту сервис не отличить (google.com/recaptcha). */
  readonly path?: string;
  /** Признак во встроенном `<script>` без `src`. */
  readonly inline?: RegExp;
}

const SIGNATURES: readonly VendorSignature[] = [
  {
    vendor: 'Яндекс Метрика',
    category: 'analytics',
    jurisdiction: 'ru',
    hosts: ['mc.yandex.ru', 'mc.yandex.com', 'mc.yandex.by', 'mc.yandex.kz', 'mc.webvisor.org'],
    inline: /mc\.yandex\.(?:ru|com)\/metrika|\bym\(\s*\d+\s*,\s*["']init/,
  },
  {
    vendor: 'Top@Mail.Ru (VK)',
    category: 'analytics',
    jurisdiction: 'ru',
    hosts: ['top-fwz1.mail.ru'],
    inline: /top-fwz1\.mail\.ru|_tmr\.push/,
  },
  {
    vendor: 'Пиксель VK Рекламы',
    category: 'advertising',
    jurisdiction: 'ru',
    hosts: ['vk.com'],
    path: '/rtrg',
    inline: /VK\.Retargeting|vk\.com\/js\/api\/openapi\.js/,
  },
  {
    vendor: 'Calltouch',
    category: 'analytics',
    jurisdiction: 'ru',
    hosts: ['calltouch.ru'],
    inline: /mod\.calltouch\.ru/,
  },
  {
    vendor: 'Roistat',
    category: 'analytics',
    jurisdiction: 'ru',
    hosts: ['roistat.com'],
    inline: /cloud\.roistat\.com/,
  },
  { vendor: 'JivoSite', category: 'chat', jurisdiction: 'ru', hosts: ['jivosite.com', 'jivo.ru'] },
  {
    vendor: 'Битрикс24',
    category: 'crm',
    jurisdiction: 'ru',
    hosts: ['bitrix24.ru', 'bitrix24.by', 'bitrix24.kz'],
  },
  { vendor: 'amoCRM', category: 'crm', jurisdiction: 'ru', hosts: ['amocrm.ru'] },
  {
    vendor: 'Яндекс SmartCaptcha',
    category: 'captcha',
    jurisdiction: 'ru',
    hosts: ['smartcaptcha.yandexcloud.net'],
  },
  {
    vendor: 'Google Analytics',
    category: 'analytics',
    jurisdiction: 'foreign',
    hosts: ['google-analytics.com', 'analytics.google.com'],
    inline:
      /google-analytics\.com\/(?:analytics|ga)\.js|gtag\(\s*["']config["']\s*,\s*["'](?:G|UA)-/,
  },
  {
    vendor: 'Google Tag Manager',
    category: 'analytics',
    jurisdiction: 'foreign',
    hosts: ['googletagmanager.com'],
    inline: /googletagmanager\.com\/gtm\.js/,
  },
  {
    vendor: 'Пиксель Meta (Facebook)',
    category: 'advertising',
    jurisdiction: 'foreign',
    hosts: ['connect.facebook.net', 'facebook.com'],
    inline: /\bfbq\(\s*["']init/,
  },
  {
    vendor: 'Hotjar',
    category: 'analytics',
    jurisdiction: 'foreign',
    hosts: ['hotjar.com'],
    inline: /static\.hotjar\.com/,
  },
  {
    vendor: 'Microsoft Clarity',
    category: 'analytics',
    jurisdiction: 'foreign',
    hosts: ['clarity.ms'],
    inline: /clarity\.ms\/tag/,
  },
  {
    vendor: 'Google Forms',
    category: 'forms',
    jurisdiction: 'foreign',
    hosts: ['docs.google.com'],
    path: '/forms',
  },
  { vendor: 'Google Forms', category: 'forms', jurisdiction: 'foreign', hosts: ['forms.gle'] },
  { vendor: 'Typeform', category: 'forms', jurisdiction: 'foreign', hosts: ['typeform.com'] },
  {
    vendor: 'Mailchimp',
    category: 'forms',
    jurisdiction: 'foreign',
    hosts: ['list-manage.com', 'chimpstatic.com'],
  },
  {
    vendor: 'HubSpot',
    category: 'crm',
    jurisdiction: 'foreign',
    hosts: ['hs-scripts.com', 'hsforms.net', 'hubspot.com'],
  },
  {
    vendor: 'Google reCAPTCHA',
    category: 'captcha',
    jurisdiction: 'foreign',
    hosts: ['google.com', 'recaptcha.net'],
    path: '/recaptcha',
  },
  {
    vendor: 'Google Fonts',
    category: 'other',
    jurisdiction: 'foreign',
    hosts: ['fonts.googleapis.com', 'fonts.gstatic.com'],
  },
  { vendor: 'Intercom', category: 'chat', jurisdiction: 'foreign', hosts: ['intercom.io'] },
  { vendor: 'Tawk.to', category: 'chat', jurisdiction: 'foreign', hosts: ['tawk.to'] },
  {
    vendor: 'YouTube',
    category: 'video',
    jurisdiction: 'foreign',
    hosts: ['youtube.com', 'youtube-nocookie.com'],
    path: '/embed',
  },
];

const onHost = (hostname: string, host: string): boolean =>
  hostname === host || hostname.endsWith(`.${host}`);

export interface VendorMatch {
  readonly vendor: string;
  readonly category: ThirdPartyCategory;
  readonly jurisdiction: Jurisdiction;
}

/** Только то, что попадает в снимок: служебные поля сигнатуры (хосты, шаблоны) наружу не отдаём. */
const toMatch = ({ vendor, category, jurisdiction }: VendorSignature): VendorMatch => ({
  vendor,
  category,
  jurisdiction,
});

/** Сервис по адресу ресурса. */
export function vendorByUrl(url: URL): VendorMatch | undefined {
  const hostname = url.hostname.toLowerCase();
  const signature = SIGNATURES.find(
    (candidate) =>
      candidate.hosts.some((host) => onHost(hostname, host)) &&
      (candidate.path === undefined || url.pathname.startsWith(candidate.path)),
  );
  return signature && toMatch(signature);
}

/** Сервисы, подключённые встроенным скриптом. */
export function vendorsInInlineScript(code: string): readonly VendorMatch[] {
  return SIGNATURES.filter((signature) => signature.inline?.test(code) === true).map(toMatch);
}
