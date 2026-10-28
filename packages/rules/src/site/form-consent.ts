import { normId } from '@lawyer-152fz/core';
import type { ConsentKind, Finding, FormSnapshot, SiteRule } from '@lawyer-152fz/core';

import {
  MAX_EVIDENCE,
  describePersonalData,
  fieldsExcerpt,
  formKey,
  formsWithPersonalData,
  groupBy,
  onPages,
  pageEvidence,
} from './shared';
import type { NonEmpty, PersonalDataForm } from './shared';

const CONSENT = normId('152-fz/art-9/part-1');
const LEGAL_BASES = normId('152-fz/art-6/part-1');
const FINE = normId('koap/art-13.11/part-1');

const ID = 'PD-FORM-CONSENT';

/** Форма с ПДн, где согласие оформлено не отдельной неотмеченной галочкой. */
type ConsentProblem = PersonalDataForm & {
  readonly form: FormSnapshot & { readonly consent: Exclude<ConsentKind, 'checkbox'> };
};

const hasConsentProblem = (item: PersonalDataForm): item is ConsentProblem =>
  item.form.consent !== 'checkbox';

function finding(group: NonEmpty<ConsentProblem>): Finding {
  const [first] = group;
  const data = describePersonalData(first.kinds);
  const suffix = onPages(group.length);
  const evidence = group
    .slice(0, MAX_EVIDENCE)
    .map(({ page, form }) =>
      pageEvidence(page, form.selector, form.consentText ?? fieldsExcerpt(form)),
    );

  switch (first.form.consent) {
    case 'none':
      return {
        ruleId: ID,
        kind: 'violation',
        severity: 'high',
        confidence: 'deterministic',
        title: `Форма собирает ${data}, но не запрашивает согласие на обработку персональных данных${suffix}`,
        evidence,
        normRefs: [CONSENT, LEGAL_BASES, FINE],
        remediation:
          'Добавьте рядом с кнопкой отправки отдельную галочку согласия, не отмеченную заранее, и ссылку на текст ' +
          'согласия: кто оператор, для чего нужны данные, какие данные, что с ними делают, срок и как отозвать согласие. ' +
          'Исключение — форма только для заключения договора с самим посетителем (заказ, запись): тогда основанием ' +
          'может быть договор (п. 5 ч. 1 ст. 6), но это стоит подтвердить у юриста.',
      };
    case 'prechecked-checkbox':
      return {
        ruleId: ID,
        kind: 'violation',
        severity: 'high',
        confidence: 'deterministic',
        title: `Галочка согласия в форме уже отмечена — такое согласие не сознательное и не однозначное${suffix}`,
        evidence,
        normRefs: [CONSENT, FINE],
        remediation:
          'Уберите отметку по умолчанию: посетитель должен поставить галочку сам, а форма — не отправляться без неё.',
      };
    case 'notice-only':
      return {
        ruleId: ID,
        kind: 'violation',
        severity: 'medium',
        confidence: 'needs-review',
        title: `Согласие получено только фразой «нажимая кнопку, вы соглашаетесь…» — оно не оформлено отдельно${suffix}`,
        evidence,
        normRefs: [CONSENT, FINE],
        remediation:
          'Замените фразу отдельной галочкой согласия, не отмеченной заранее, со ссылкой на текст согласия. ' +
          'Закон требует оформлять согласие отдельно от иной информации.',
      };
  }
}

/** Формы с полями ПДн без надлежащего согласия: нет галочки, она отмечена заранее или есть только уведомление. */
export const formConsentRule: SiteRule = {
  id: ID,
  title: 'Согласие на обработку персональных данных в формах',
  normRefs: [CONSENT, LEGAL_BASES, FINE],
  check(snapshot) {
    const forms = formsWithPersonalData(snapshot).filter(hasConsentProblem);
    return groupBy(forms, formKey).map(finding);
  },
};
