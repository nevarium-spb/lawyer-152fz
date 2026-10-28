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
