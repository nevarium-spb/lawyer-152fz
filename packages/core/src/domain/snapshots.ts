/**
 * Снимки цели аудита — то, что сканер передаёт правилам (ADR-0004).
 * Сайт сканер разбирает сам (формы, сторонние сервисы, cookie); исходники передаются текстом,
 * а поиск признаков в коде — дело правил.
 *
 * Все строки, взятые с сайта или из файлов, — недоверенные данные (ADR-0006).
 */

/** Какие персональные данные собирает поле формы. */
export const PERSONAL_DATA_KINDS = [
  'name',
  'phone',
  'email',
  'address',
  'birthdate',
  'document',
] as const;
export type PersonalDataKind = (typeof PERSONAL_DATA_KINDS)[number];

export interface FormField {
  /** Атрибут `name`, иначе `id`. */
  readonly name: string;
  readonly type: string;
  readonly label?: string;
  /** Вид ПДн, если поле их собирает. */
  readonly personalData?: PersonalDataKind;
}

/**
 * Как форма получает согласие на обработку ПДн:
 * - `checkbox` — отдельная галочка, по умолчанию не отмечена;
 * - `prechecked-checkbox` — галочка уже стоит;
 * - `notice-only` — только текст «нажимая кнопку, вы соглашаетесь…»;
 * - `none` — ничего.
 */
export type ConsentKind = 'checkbox' | 'prechecked-checkbox' | 'notice-only' | 'none';

export interface FormSnapshot {
  /** Где форма на странице — для доказательства в отчёте. */
  readonly selector: string;
  /** Абсолютный адрес отправки; без атрибута `action` — адрес страницы. */
  readonly action: string;
  readonly method: 'get' | 'post';
  readonly fields: readonly FormField[];
  readonly consent: ConsentKind;
  /** Текст согласия или уведомления рядом с формой. */
  readonly consentText?: string;
  /** Рядом с формой есть ссылка на политику обработки ПДн. */
  readonly hasPolicyLink: boolean;
}

export type ThirdPartyCategory =
  'analytics' | 'advertising' | 'forms' | 'chat' | 'crm' | 'captcha' | 'video' | 'other';

/** Где находится оператор сервиса: важно для локализации и трансграничной передачи. */
export type Jurisdiction = 'ru' | 'foreign' | 'unknown';

/** Сторонний сервис на странице: скрипт, встроенный фрагмент кода, iframe или пиксель. */
export interface ThirdPartyResource {
  readonly kind: 'script' | 'inline-script' | 'iframe' | 'pixel';
  /** Адрес ресурса; у встроенного скрипта его нет. */
  readonly url?: string;
  /** Опознанный сервис, например «Яндекс Метрика». У неопознанных сторонних скриптов нет. */
  readonly vendor?: string;
  readonly category: ThirdPartyCategory;
  readonly jurisdiction: Jurisdiction;
}

export interface CookieSnapshot {
  readonly name: string;
  readonly domain: string;
}

export interface PageSnapshot {
  readonly url: string;
  readonly isHttps: boolean;
  readonly forms: readonly FormSnapshot[];
  readonly thirdParties: readonly ThirdPartyResource[];
  /** Cookie из заголовков ответа сервера. Cookie, которые ставят скрипты, статический анализ не видит. */
  readonly cookies: readonly CookieSnapshot[];
  /** Ссылки на политику обработки ПДн, абсолютные. */
  readonly policyLinks: readonly string[];
  /** На странице есть уведомление об использовании cookie. */
  readonly hasCookieNotice: boolean;
  /** Страница — оболочка SPA: содержимое рисуют скрипты, статический HTML почти пуст (ADR-0010). */
  readonly renderedByScript: boolean;
}

export interface SiteSnapshot {
  readonly rootUrl: string;
  readonly pages: readonly PageSnapshot[];
  /** Что сканер не смог проверить: антибот, авторизация, лимит страниц. */
  readonly notChecked: readonly string[];
}

export interface SourceFile {
  /** Путь относительно корня проекта, с прямыми слешами. */
  readonly path: string;
  readonly content: string;
}

export interface CodebaseSnapshot {
  readonly rootPath: string;
  readonly files: readonly SourceFile[];
  readonly notChecked: readonly string[];
}
