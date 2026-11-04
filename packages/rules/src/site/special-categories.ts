import { normId } from '@lawyer-152fz/core';
import type {
  Finding,
  FormSnapshot,
  NormId,
  PageSnapshot,
  SiteRule,
  SpecialCategoryKind,
} from '@lawyer-152fz/core';

import { MAX_EVIDENCE, groupBy, onPages, pageEvidence } from './shared';
import type { NonEmpty } from './shared';

const SPECIAL = normId('152-fz/art-10/part-1');
const SPECIAL_CASES = normId('152-fz/art-10/part-2');
const WRITTEN_CONSENT = normId('152-fz/art-9/part-4');
const FINE_WRITTEN = normId('koap/art-13.11/part-2');
const BIOMETRIC = normId('152-fz/art-11/part-1');
const BIOMETRIC_NOT_MANDATORY = normId('152-fz/art-11/part-3');

const ID = 'PD-SPECIAL-CATEGORIES';

/** Что форма, судя по подписям полей, просит, — в предложном падеже: «просит сведения о …». */
const ABOUT: Record<SpecialCategoryKind, string> = {
  health: 'состоянии здоровья',
  'race-nationality': 'расовой или национальной принадлежности',
  political: 'политических взглядах',
  'religion-philosophy': 'религиозных или философских убеждениях',
  intimate: 'интимной жизни',
  biometric: 'биометрических данных',
};

interface SpecialForm {
  readonly page: PageSnapshot;
  readonly form: FormSnapshot;
  readonly kinds: readonly SpecialCategoryKind[];
}

function specialForms(pages: readonly PageSnapshot[]): SpecialForm[] {
  return pages.flatMap((page) =>
    page.forms.flatMap((form) => {
      const kinds = [
        ...new Set(
          form.fields.flatMap((field) => (field.specialCategory ? [field.specialCategory] : [])),
        ),
      ];
      return kinds.length > 0 ? [{ page, form, kinds }] : [];
    }),
  );
}

const fieldsExcerpt = (form: FormSnapshot) =>
  form.fields
    .filter((field) => field.specialCategory)
    .map((field) => (field.label ? `${field.label} (${field.name})` : field.name))
    .join(', ');

function finding(group: NonEmpty<SpecialForm>): Finding {
  const [first] = group;
  const hasBiometric = first.kinds.includes('biometric');
  const hasSpecial = first.kinds.some((kind) => kind !== 'biometric');
  const about = first.kinds.map((kind) => ABOUT[kind]).join(', ');
  const normRefs: NormId[] = [
    ...(hasSpecial ? [SPECIAL, SPECIAL_CASES] : []),
    ...(hasBiometric ? [BIOMETRIC, BIOMETRIC_NOT_MANDATORY] : []),
    WRITTEN_CONSENT,
    FINE_WRITTEN,
  ];
  return {
    ruleId: ID,
    kind: 'risk',
    severity: 'high',
    confidence: 'needs-review',
    title: `Форма, судя по подписям полей, просит сведения о ${about}${onPages(group.length)}`,
    evidence: group
      .slice(0, MAX_EVIDENCE)
      .map(({ page, form }) => pageEvidence(page, form.selector, fieldsExcerpt(form))),
    normRefs,
    remediation:
      'Проверьте вручную, действительно ли поле собирает такие сведения: определение идёт по словам в подписи и может ' +
      'ошибаться. Если да, обычная галочка согласия не подходит: такие данные обрабатываются, в частности, с согласия ' +
      'в письменной форме (ч. 2 ст. 10, ч. 1 ст. 11), то есть на бумаге с подписью или электронным документом, ' +
      'подписанным электронной подписью (ч. 4 ст. 9). Если без этих сведений можно обойтись, уберите поле. ' +
      (hasBiometric
        ? 'Предоставление биометрических данных не может быть обязательным, за исключением случаев ч. 2 ст. 11. '
        : '') +
      'Какое основание применимо к вашей ситуации, стоит подтвердить у юриста.',
  };
}

/** Формы, где подписи полей указывают на специальные категории ПДн или биометрию. */
export const specialCategoriesRule: SiteRule = {
  id: ID,
  title: 'Специальные категории ПДн и биометрия в формах',
  normRefs: [
    SPECIAL,
    SPECIAL_CASES,
    BIOMETRIC,
    BIOMETRIC_NOT_MANDATORY,
    WRITTEN_CONSENT,
    FINE_WRITTEN,
  ],
  check(snapshot) {
    return groupBy(
      specialForms(snapshot.pages),
      ({ form, kinds }) => `${form.selector}|${new URL(form.action).pathname}|${kinds.join(',')}`,
    ).map(finding);
  },
};
