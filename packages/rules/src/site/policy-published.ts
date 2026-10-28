import { normId } from '@lawyer-152fz/core';
import type { Finding, SiteRule } from '@lawyer-152fz/core';

import {
  MAX_EVIDENCE,
  formKey,
  formsWithPersonalData,
  groupBy,
  onPages,
  pageEvidence,
} from './shared';

const POLICY = normId('152-fz/art-18.1/part-2');
const FINE = normId('koap/art-13.11/part-3');

const ID = 'PD-POLICY-PUBLISHED';

/**
 * Политика обработки ПДн опубликована на страницах, где собирают данные (ч. 2 ст. 18.1).
 * Нет ссылки на странице — нарушение; ссылка есть, но далеко от формы — рекомендация.
 */
export const policyPublishedRule: SiteRule = {
  id: ID,
  title: 'Политика обработки персональных данных на страницах с формами',
  normRefs: [POLICY, FINE],
  check(snapshot) {
    const forms = formsWithPersonalData(snapshot);
    const findings: Finding[] = [];

    const pagesWithoutPolicy = groupBy(
      forms.filter(({ page }) => page.policyLinks.length === 0),
      ({ page }) => page.url,
    );
    const [firstPage] = pagesWithoutPolicy;
    if (firstPage) {
      findings.push({
        ruleId: ID,
        kind: 'violation',
        severity: 'high',
        confidence: 'deterministic',
        title: `На странице с формой нет ссылки на политику обработки персональных данных${onPages(pagesWithoutPolicy.length)}`,
        evidence: pagesWithoutPolicy
          .slice(0, MAX_EVIDENCE)
          .flatMap((group) =>
            group.slice(0, 1).map(({ page, form }) => pageEvidence(page, form.selector)),
          ),
        normRefs: [POLICY, FINE],
        remediation:
          'Опубликуйте документ о политике обработки персональных данных и поставьте ссылку на него на каждой странице, ' +
          'где есть форма: рядом с формой и в подвале сайта.',
      });
    }

    const farFromForm = forms.filter(
      ({ page, form }) => page.policyLinks.length > 0 && !form.hasPolicyLink,
    );
    for (const group of groupBy(farFromForm, formKey)) {
      findings.push({
        ruleId: ID,
        kind: 'recommendation',
        severity: 'low',
        confidence: 'deterministic',
        title: `Ссылка на политику есть на странице, но не рядом с формой${onPages(group.length)}`,
        evidence: group
          .slice(0, MAX_EVIDENCE)
          .map(({ page, form }) => pageEvidence(page, form.selector)),
        normRefs: [POLICY],
        remediation:
          'Поставьте ссылку на политику рядом с формой или в тексте согласия, чтобы посетитель видел её до отправки данных.',
      });
    }

    return findings;
  },
};
