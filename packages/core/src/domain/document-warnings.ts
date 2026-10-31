import { IMPLEMENTED_MEASURES } from './operator-profile';
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
  ];
}
