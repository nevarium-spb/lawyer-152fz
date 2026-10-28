/**
 * @lawyer-152fz/rules — реестр правил аудита. Каждое правило — чистая функция без I/O.
 */
import type { CodebaseRule, SiteRule } from '@lawyer-152fz/core';

import { foreignSdkRule } from './code/foreign-sdk';
import { loggingRule } from './code/logging';
import { storageRegionRule } from './code/storage-region';
import { countersNoticeRule } from './site/counters-notice';
import { foreignServicesRule } from './site/foreign-services';
import { formConsentRule } from './site/form-consent';
import { httpsRule } from './site/https';
import { policyPublishedRule } from './site/policy-published';

/** Реестр правил аудита сайтов (ADR-0004): явный список, без сканирования папок. */
export const SITE_RULES: readonly SiteRule[] = [
  formConsentRule,
  policyPublishedRule,
  httpsRule,
  foreignServicesRule,
  countersNoticeRule,
];

/** Реестр правил аудита исходников. */
export const CODEBASE_RULES: readonly CodebaseRule[] = [
  foreignSdkRule,
  storageRegionRule,
  loggingRule,
];
