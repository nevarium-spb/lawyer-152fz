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

/** Адрес разработки: localhost, *.local, *.test, частные IPv4 — там HTTPS обычно нет и он не нужен. */
const LOCAL_HOST =
  /^(?:localhost|\[::1\]|127(?:\.\d+){3}|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2}|[\w.-]+\.(?:localhost|local|test))$/i;
const isLocal = (url: string) => LOCAL_HOST.test(new URL(url).hostname);

/** Персональные данные из форм уходят по сети без шифрования: страница или адрес отправки — HTTP. */
export const httpsRule: SiteRule = {
  id: ID,
  title: 'Передача персональных данных из форм по HTTPS',
  normRefs: [PROTECTION, PROTECTION_MEASURES],
  check(snapshot) {
    const forms = formsWithPersonalData(snapshot);
    const findings: Finding[] = [];

    const localPages = groupBy(
      forms.filter(({ page }) => !page.isHttps && isLocal(page.url)),
      ({ page }) => page.url,
    );
    if (localPages.length > 0) {
      findings.push({
        ruleId: ID,
        kind: 'recommendation',
        severity: 'info',
        confidence: 'deterministic',
        title: 'Сайт проверен по локальному адресу без HTTPS — HTTPS рабочего домена не проверен',
        evidence: localPages
          .slice(0, MAX_EVIDENCE)
          .map(([{ page, form }]) => pageEvidence(page, form.selector)),
        normRefs: [PROTECTION],
        remediation:
          'Для локальной разработки это нормально. Убедитесь, что на рабочем домене форма открывается и ' +
          'отправляется только по HTTPS, а HTTP перенаправляет на HTTPS.',
      });
    }

    const httpPages = groupBy(
      forms.filter(({ page }) => !page.isHttps && !isLocal(page.url)),
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
