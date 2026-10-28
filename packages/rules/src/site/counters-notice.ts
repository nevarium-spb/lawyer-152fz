import { normId } from '@lawyer-152fz/core';
import type { SiteRule } from '@lawyer-152fz/core';

import { MAX_EVIDENCE, onPages, pageEvidence } from './shared';

const CONSENT = normId('152-fz/art-9/part-1');
const POLICY = normId('152-fz/art-18.1/part-2');

const ID = 'PD-COUNTERS-NOTICE';

/**
 * Счётчики и рекламные пиксели работают, а уведомления о cookie на сайте нет.
 * Прямого требования в законе нет — поэтому риск низкий и требует проверки юристом.
 */
export const countersNoticeRule: SiteRule = {
  id: ID,
  title: 'Уведомление о cookie и счётчиках',
  normRefs: [CONSENT, POLICY],
  check(snapshot) {
    if (snapshot.pages.some((page) => page.hasCookieNotice)) return [];
    const pages = snapshot.pages.filter((page) =>
      page.thirdParties.some(
        (resource) => resource.category === 'analytics' || resource.category === 'advertising',
      ),
    );
    if (pages.length === 0) return [];

    const vendors = [
      ...new Set(
        pages.flatMap((page) =>
          page.thirdParties.flatMap((resource) =>
            (resource.category === 'analytics' || resource.category === 'advertising') &&
            resource.vendor
              ? [resource.vendor]
              : [],
          ),
        ),
      ),
    ];
    const counters = vendors.length > 0 ? ` (${vendors.join(', ')})` : '';

    return [
      {
        ruleId: ID,
        kind: 'risk',
        severity: 'low',
        confidence: 'needs-review',
        title: `Счётчики${counters} работают без уведомления об использовании cookie${onPages(pages.length)}`,
        evidence: pages.slice(0, MAX_EVIDENCE).map((page) => pageEvidence(page)),
        normRefs: [CONSENT, POLICY],
        remediation:
          'Добавьте уведомление о cookie: какие счётчики работают и зачем, со ссылкой на политику. ' +
          'Прямо в законе требования к счётчикам не прописаны; безопаснее получать согласие до их запуска — уточните у юриста.',
      },
    ];
  },
};
