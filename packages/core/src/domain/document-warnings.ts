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

const normalize = (text: string) => text.trim().toLowerCase();

/** Договор поручения сверяется с остальным профилем: политика и уведомление РКН должны называть того же обработчика. */
function processingAgreementWarnings(profile: OperatorProfile): readonly string[] {
  const agreement = profile.processingAgreement;
  if (!agreement) return [];
  const warnings: string[] = [];
  const processor = normalize(agreement.processor.name);
  const listed = profile.thirdParties.some(
    (party) => party.role === 'processor' && normalize(party.name) === processor,
  );
  if (!listed) {
    warnings.push(
      `«${agreement.processor.name}» нет среди третьих лиц профиля с ролью processor. Добавьте его в thirdParties, чтобы политика и другие документы совпадали с договором: субъект вправе получить наименование и адрес лица, которому поручена обработка (п. 9 ч. 7 ст. 14 152-ФЗ).`,
    );
  }
  const known = new Set(profile.purposes.map((purpose) => normalize(purpose.title)));
  const unknown = agreement.purposes.filter((purpose) => !known.has(normalize(purpose)));
  if (unknown.length > 0) {
    warnings.push(
      `Цели поручения ${unknown.map((purpose) => `«${purpose}»`).join(', ')} не совпадают с целями обработки в профиле. Обработчик обрабатывает данные в целях оператора: проверьте, что эти цели есть в политике (ч. 3 ст. 6, п. 2 ч. 1 ст. 18.1 152-ФЗ).`,
    );
  }
  if (agreement.processor.country !== 'RU') {
    warnings.push(
      'Обработчик находится за рубежом. Ответственность перед субъектом несут и оператор, и обработчик (ч. 6 ст. 6 152-ФЗ). Передача данных ему — трансграничная: до неё нужно уведомить Роскомнадзор (ст. 12 152-ФЗ). Запись, систематизация, накопление, хранение, уточнение и извлечение данных граждан РФ с использованием баз за рубежом не допускаются, кроме случаев пп. 2, 3, 4, 8 ч. 1 ст. 6 (ч. 5 ст. 18 152-ФЗ).',
    );
  }
  return warnings;
}

/** Положение строится по целям профиля: категории данных должны быть названы для каждой из них. */
function processingRegulationWarnings(profile: OperatorProfile): readonly string[] {
  const regulation = profile.processingRegulation;
  if (!regulation) return [];
  const warnings: string[] = [];
  const named = new Set(regulation.dataKinds.map((entry) => normalize(entry.purpose)));
  const missing = profile.purposes.filter((purpose) => !named.has(normalize(purpose.title)));
  if (missing.length > 0) {
    warnings.push(
      `Для целей ${missing.map((purpose) => `«${purpose.title}»`).join(', ')} не названы категории персональных данных: в положении они отмечены как не указанные. Положение определяет категории и перечень данных для каждой цели (п. 2 ч. 1 ст. 18.1 152-ФЗ): уточните их у оператора.`,
    );
  }
  const known = new Set(profile.purposes.map((purpose) => normalize(purpose.title)));
  const unknown = regulation.dataKinds.filter((entry) => !known.has(normalize(entry.purpose)));
  if (unknown.length > 0) {
    warnings.push(
      `Категории данных названы для целей ${unknown.map((entry) => `«${entry.purpose}»`).join(', ')}, которых нет в профиле: в положение они не вошли. Проверьте название цели — оно должно совпадать с purposes[].title.`,
    );
  }
  return warnings;
}

/** Правила внутреннего контроля: при обработке в информационных системах срок контроля по ПП № 1119 определяет оператор. */
function internalControlRulesWarnings(profile: OperatorProfile): readonly string[] {
  const rules = profile.internalControlRules;
  if (!rules) return [];
  const automated = profile.purposes.some((purpose) => purpose.methods !== 'non-automated');
  if (!automated || rules.securityControlMonths !== undefined) return [];
  return [
    'Есть цели с обработкой в информационных системах, но срок контроля выполнения требований к защите не указан. Этот контроль проводится не реже 1 раза в 3 года в сроки, определяемые оператором (п. 17 ПП РФ № 1119): укажите securityControlMonths, иначе в правилах останется только предельный срок.',
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
    ...(sections.includes('processingAgreement') ? processingAgreementWarnings(profile) : []),
    ...(sections.includes('processingRegulation') ? processingRegulationWarnings(profile) : []),
    ...(sections.includes('internalControlRules') ? internalControlRulesWarnings(profile) : []),
  ];
}
