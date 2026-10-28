import { normId } from '@lawyer-152fz/core';
import type { Finding, PageSnapshot, SiteRule, ThirdPartyResource } from '@lawyer-152fz/core';

import { MAX_EVIDENCE, groupBy, onPages, pageEvidence } from './shared';
import type { NonEmpty } from './shared';

const LOCALIZATION = normId('152-fz/art-18/part-5');
const CROSS_BORDER_NOTICE = normId('152-fz/art-12/part-3');
const LOCALIZATION_FINE = normId('koap/art-13.11/part-8');

const ID = 'PD-FOREIGN-SERVICES';

interface Usage {
  readonly page: PageSnapshot;
  readonly resource: ThirdPartyResource & { readonly vendor: string };
}

/** Сервисы, куда посетитель сам вводит данные: формы, CRM, чаты. */
const DATA_ENTRY = new Set<ThirdPartyResource['category']>(['forms', 'crm', 'chat']);
const TRACKING = new Set<ThirdPartyResource['category']>(['analytics', 'advertising']);

function finding(group: NonEmpty<Usage>): Finding {
  const { vendor, category } = group[0].resource;
  const pages = groupBy(group, ({ page }) => page.url);
  const evidence = pages
    .slice(0, MAX_EVIDENCE)
    .map(([{ page, resource }]) => pageEvidence(page, undefined, resource.url));
  const suffix = onPages(pages.length);

  if (DATA_ENTRY.has(category)) {
    return {
      ruleId: ID,
      kind: 'risk',
      severity: 'high',
      confidence: 'needs-review',
      title: `Данные посетителей уходят в иностранный сервис ${vendor}${suffix}`,
      evidence,
      normRefs: [LOCALIZATION, CROSS_BORDER_NOTICE, LOCALIZATION_FINE],
      remediation:
        'Персональные данные граждан РФ при сборе должны сначала записываться в базы данных в России. ' +
        'Замените сервис российским аналогом или настройте сбор так, чтобы заявки сначала попадали в вашу базу в РФ. ' +
        'Если передача за рубеж остаётся, до её начала уведомите Роскомнадзор о трансграничной передаче.',
    };
  }
  if (TRACKING.has(category)) {
    return {
      ruleId: ID,
      kind: 'risk',
      severity: 'medium',
      confidence: 'needs-review',
      title: `Иностранный сервис аналитики или рекламы: ${vendor}${suffix}`,
      evidence,
      normRefs: [CROSS_BORDER_NOTICE, LOCALIZATION],
      remediation:
        'Сервис получает cookie, IP-адреса и данные о поведении посетителей за рубежом — это может считаться ' +
        'трансграничной передачей персональных данных. Рассмотрите российский аналог (например, Яндекс Метрику) ' +
        'или уведомите Роскомнадзор о трансграничной передаче и укажите сервис в политике.',
    };
  }
  return {
    ruleId: ID,
    kind: 'recommendation',
    severity: 'low',
    confidence: 'needs-review',
    title: `Иностранный сервис на сайте: ${vendor}${suffix}`,
    evidence,
    normRefs: [CROSS_BORDER_NOTICE],
    remediation:
      'Сервис может получать IP-адреса и cookie посетителей. Укажите его в политике обработки персональных данных ' +
      'или замените российским аналогом (например, Яндекс SmartCaptcha вместо reCAPTCHA).',
  };
}

/** Иностранные сервисы на страницах: формы и чаты, аналитика и реклама, прочие виджеты. */
export const foreignServicesRule: SiteRule = {
  id: ID,
  title: 'Иностранные сервисы, получающие данные посетителей',
  normRefs: [LOCALIZATION, CROSS_BORDER_NOTICE, LOCALIZATION_FINE],
  check(snapshot) {
    const usages: Usage[] = snapshot.pages.flatMap((page) =>
      page.thirdParties.flatMap((resource) =>
        resource.jurisdiction === 'foreign' && resource.vendor !== undefined
          ? [{ page, resource: { ...resource, vendor: resource.vendor } }]
          : [],
      ),
    );
    return groupBy(usages, ({ resource }) => resource.vendor).map(finding);
  },
};
