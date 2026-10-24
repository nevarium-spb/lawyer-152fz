/**
 * Снимки цели аудита — то, что сканер передаёт правилам (ADR-0004).
 * Сайт сканер разбирает сам (формы, скрипты, cookie); исходники передаются текстом,
 * а поиск признаков в коде — дело правил. Состав полей расширяется в вехе M5.
 *
 * Все строки, взятые с сайта или из файлов, — недоверенные данные (ADR-0006).
 */

export interface FormField {
  readonly name: string;
  readonly type: string;
  readonly label?: string;
  /** Поле собирает персональные данные (имя, телефон, e-mail и т. п.). */
  readonly isPersonalData: boolean;
}

export interface FormSnapshot {
  /** CSS-селектор формы на странице — для доказательства в отчёте. */
  readonly selector: string;
  readonly action?: string;
  readonly method: 'get' | 'post';
  readonly fields: readonly FormField[];
  readonly hasConsentCheckbox: boolean;
  readonly hasPolicyLink: boolean;
}

export interface ThirdPartyScript {
  readonly src: string;
  /** Опознанный сервис, например «Google Analytics». */
  readonly vendor?: string;
}

export interface CookieSnapshot {
  readonly name: string;
  readonly domain: string;
}

export interface PageSnapshot {
  readonly url: string;
  readonly isHttps: boolean;
  readonly forms: readonly FormSnapshot[];
  readonly scripts: readonly ThirdPartyScript[];
  readonly cookies: readonly CookieSnapshot[];
  readonly policyLinks: readonly string[];
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
