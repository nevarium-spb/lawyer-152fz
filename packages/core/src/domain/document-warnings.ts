import { IMPLEMENTED_MEASURES, isConsentBasis } from './operator-profile';
import type { ImplementedMeasure, OperatorProfile, ProfileSection } from './operator-profile';

const MEASURE_TITLES: Record<ImplementedMeasure, string> = {
  'responsible-person': 'ответственный за организацию обработки',
  'policy-and-local-acts': 'политика и локальные акты',
  'security-measures': 'меры безопасности по ст. 19',
  'internal-control': 'внутренний контроль или аудит',
  'harm-assessment': 'оценка вреда',
  'staff-training': 'ознакомление работников',
};

/** У организации ИНН из 10 цифр, у физического лица и ИП — из 12. */
const isLegalEntity = (profile: OperatorProfile) => profile.inn.length === 10;

function measureWarnings(profile: OperatorProfile): readonly string[] {
  const implemented = profile.implementedMeasures ?? [];
  const missing = IMPLEMENTED_MEASURES.filter((measure) => !implemented.includes(measure));
  if (missing.length === 0) return [];

  const warnings = [
    `В документ вошли только подтверждённые меры. Не подтверждены: ${missing.map((measure) => MEASURE_TITLES[measure]).join(', ')} (ч. 1 ст. 18.1 152-ФЗ).`,
  ];
  if (isLegalEntity(profile) && missing.includes('responsible-person')) {
    warnings.push(
      'Оператор — юридическое лицо: назначить ответственного за организацию обработки обязательно (ч. 1 ст. 22.1 152-ФЗ).',
    );
  }
  return warnings;
}

function notificationWarnings(profile: OperatorProfile, today: string): readonly string[] {
  const warnings: string[] = [];
  if (profile.protectionLevel === 'not-determined') {
    warnings.push(
      'Уровень защищённости не определён. Определите его по пп. 8–12 Требований, утв. ПП РФ № 1119: сведения п. 11 ч. 3 ст. 22 152-ФЗ обязательны.',
    );
  }
  if (profile.purposes.every((purpose) => purpose.methods === 'non-automated')) {
    warnings.push(
      'Все цели указаны как обработка без средств автоматизации. Если оператор действительно обрабатывает данные исключительно так, уведомление не требуется (п. 8 ч. 2 ст. 22 152-ФЗ). Сайт, CRM и электронные таблицы — это уже средства автоматизации: проверьте способ обработки.',
    );
  }
  if (profile.processingStartDate !== undefined && profile.processingStartDate < today) {
    warnings.push(
      'Дата начала обработки уже прошла, а уведомление подаётся до начала обработки (ч. 1 ст. 22 152-ФЗ). Если обработка уже идёт, укажите фактическую дату, а не подбирайте будущую.',
    );
  }
  return warnings;
}

/** Приказ Роскомнадзора от 24.02.2021 № 18 действует до этой даты (п. 1.1). */
const ORDER_18_EXPIRES = '2027-09-01';

const distributionWarnings = (today: string): readonly string[] =>
  today >= ORDER_18_EXPIRES
    ? [
        'Срок действия приказа Роскомнадзора от 24.02.2021 № 18, по которому составлен шаблон, истёк 01.09.2027. Проверьте действующие требования к содержанию согласия (ч. 9 ст. 9 152-ФЗ).',
      ]
    : [];

const CONSENT_PROOF_WARNING =
  'Доказать получение согласия обязан оператор (ч. 3 ст. 9 152-ФЗ). Для формы на сайте ведите журнал согласий: кто дал согласие и как запись связана именно с этим человеком, дата и время, адрес формы, редакция текста, отзыв согласия. Состав журнала закон не устанавливает, это практическая рекомендация. Журнал сам содержит персональные данные: храните в нём только нужное и определите срок хранения. Подписанное письменное согласие храните так же.';

/** Цель не размечена в профиле, поэтому распознаётся по названию: важнее заметить, чем не ошибиться. */
const PROMOTION_PURPOSE = /реклам|маркетинг|рассылк|продвижени|спецпредложени/iu;

function consentWarnings(profile: OperatorProfile): readonly string[] {
  const consentPurposes = profile.purposes.filter((purpose) => isConsentBasis(purpose.legalBasis));
  const promotion = consentPurposes.filter((purpose) => PROMOTION_PURPOSE.test(purpose.title));
  if (promotion.length === 0) return [CONSENT_PROOF_WARNING];

  const titles = promotion.map((purpose) => `«${purpose.title}»`).join(', ');
  const separate =
    consentPurposes.length > promotion.length
      ? `Цель ${titles} похожа на продвижение и вошла в одно согласие с другими целями. Оформите её отдельным согласием с отдельной отметкой: соберите документ заново по профилю только с этой целью. Закон не говорит об этом прямо, это вывод из требований «свободно» и «конкретным» (ч. 1 ст. 9 152-ФЗ). `
      : `Цель ${titles} похожа на продвижение. Не объединяйте это согласие с согласиями на другие цели (ч. 1 ст. 9 152-ФЗ). `;
  return [
    CONSENT_PROOF_WARNING,
    `${separate}Для продвижения прямыми контактами с помощью средств связи нужно предварительное согласие, его получение доказывает оператор, а по требованию субъекта обработку прекращают немедленно (ст. 15 152-ФЗ). Письменной формы ст. 15 не называет, но устойчивой практики нет: выбор между вариантом для сайта и письменным оставьте оператору. Законодательство о рекламе в базу норм не входит и не проверялось.`,
  ];
}

/**
 * Что пользователь должен узнать о собранном документе, но что не должно попасть в его текст.
 * Документ при этом собирается: решение остаётся за оператором.
 */
export function documentWarnings(
  sections: readonly ProfileSection[],
  profile: OperatorProfile,
  today: string,
): readonly string[] {
  return [
    ...(sections.includes('measures') ? measureWarnings(profile) : []),
    ...(sections.includes('rknNotification') ? notificationWarnings(profile, today) : []),
    ...(sections.includes('publicDistribution') ? distributionWarnings(today) : []),
    ...(sections.includes('processingConsent') ? consentWarnings(profile) : []),
  ];
}
