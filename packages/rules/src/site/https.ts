import { normId } from '@lawyer-152fz/core';
import type { Finding, SiteRule } from '@lawyer-152fz/core';

import {
  MAX_EVIDENCE,
  describePersonalData,
  formsWithPersonalData,
  groupBy,
  onPages,
  pageEvidence,
} from './shared';

const PROTECTION = normId('152-fz/art-19/part-1');
const PROTECTION_MEASURES = normId('152-fz/art-19/part-2');

const ID = 'PD-HTTPS';

/** Персональные данные из форм уходят по сети без шифрования: страница или адрес отправки — HTTP. */
export const httpsRule: SiteRule = {
  id: ID,
  title: 'Передача персональных данных из форм по HTTPS',
  normRefs: [PROTECTION, PROTECTION_MEASURES],
  check(snapshot) {
    const forms = formsWithPersonalData(snapshot);
    const findings: Finding[] = [];

    const httpPages = groupBy(
      forms.filter(({ page }) => !page.isHttps),
      ({ page }) => page.url,
    );
    if (httpPages.length > 0) {
      findings.push({
        ruleId: ID,
        kind: 'violation',
        severity: 'high',
        confidence: 'deterministic',
        title: `Страница с формой открывается по незащищённому HTTP${onPages(httpPages.length)}`,
        evidence: httpPages
          .slice(0, MAX_EVIDENCE)
          .flatMap((group) =>
            group.slice(0, 1).map(({ page, form }) => pageEvidence(page, form.selector)),
          ),
        normRefs: [PROTECTION, PROTECTION_MEASURES],
        remediation:
          'Подключите HTTPS (бесплатный сертификат Let’s Encrypt или сертификат хостинга) и настройте ' +
          'постоянное перенаправление с HTTP на HTTPS.',
      });
    }

    const httpActions = forms.filter(
      ({ page, form }) => page.isHttps && form.action.startsWith('http:'),
    );
    for (const group of groupBy(httpActions, ({ form }) => form.action)) {
      const [first] = group;
      findings.push({
        ruleId: ID,
        kind: 'violation',
        severity: 'high',
        confidence: 'deterministic',
        title: `Форма отправляет ${describePersonalData(first.kinds)} по незащищённому HTTP на ${new URL(first.form.action).host}${onPages(group.length)}`,
        evidence: group
          .slice(0, MAX_EVIDENCE)
          .map(({ page, form }) => pageEvidence(page, form.selector, `action: ${form.action}`)),
        normRefs: [PROTECTION, PROTECTION_MEASURES],
        remediation:
          'Измените адрес отправки формы на https://… и проверьте, что сервер, принимающий заявки, поддерживает HTTPS.',
      });
    }

    return findings;
  },
};
