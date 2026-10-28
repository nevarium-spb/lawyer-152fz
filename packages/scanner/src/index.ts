/**
 * @lawyer-152fz/scanner — адаптеры `PageLoader` и `CodebaseReader`, построение снимков сайта и кода.
 * Всё, что приходит с сайта или из файлов, — недоверенные данные (ADR-0006).
 */
export { createAddressPolicy } from './network/address-policy';
export type { AddressPolicy, AddressPolicyOptions } from './network/address-policy';
export { nodeHttpTransport } from './network/http-transport';
export type { HttpTransport, ResolvedAddress } from './network/http-transport';
export {
  LOAD_TIMEOUT_MS,
  MAX_PAGE_BYTES,
  MAX_REDIRECTS,
  createStaticPageLoader,
  systemResolver,
} from './network/static-page-loader';
export type { LoadedPage, PageLoadError, PageLoader, Resolver } from './network/static-page-loader';
export { analyzePage } from './html/analyze-page';
export type { PageAnalysis, PageInput, PageLink } from './html/analyze-page';
export {
  RENDER_UNAVAILABLE,
  SCRIPT_COOKIES_NOTE,
  SPA_HINT,
  createSiteScanner,
} from './site/site-scanner';
export type { SiteScannerDeps } from './site/site-scanner';
export {
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  createCodebaseReader,
} from './code/codebase-reader';
export type { CodebaseReaderLimits } from './code/codebase-reader';
