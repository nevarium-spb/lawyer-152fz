/**
 * Уровень защищённости персональных данных в информационной системе по пп. 9–12 Требований
 * (ПП РФ № 1119). Тип угроз (п. 6) оператор определяет сам с учётом оценки вреда и актов ФСТЭК/ФСБ
 * (п. 7): в базе норм этих актов нет, поэтому тип угроз — вход, а не вывод.
 */
export const THREAT_TYPES = ['1', '2', '3'] as const;
export type ThreatType = (typeof THREAT_TYPES)[number];

/** Категория данных информационной системы по п. 5: наиболее строгая из обрабатываемых. */
export const SYSTEM_DATA_KINDS = ['special', 'biometric', 'public', 'other'] as const;
export type SystemDataKind = (typeof SYSTEM_DATA_KINDS)[number];

/** Порог числа субъектов в пп. 9–12: «более чем» и «менее чем» 100 000, ровно 100 000 норма не называет. */
export const SUBJECTS_THRESHOLD = 100_000;

export interface ProtectionLevelInput {
  readonly threatType: ThreatType;
  readonly dataKind: SystemDataKind;
  /** В системе обрабатываются данные только сотрудников оператора (п. 5). */
  readonly employeesOnly: boolean;
  /** Число субъектов, не являющихся сотрудниками оператора. */
  readonly subjectsCount: number;
}

export type ProtectionLevelResult =
  | { readonly kind: 'level'; readonly level: 1 | 2 | 3 | 4; readonly basis: string }
  | { readonly kind: 'undetermined'; readonly reason: string };

type Size = 'small' | 'large' | 'boundary';

function sizeOf(input: ProtectionLevelInput): Size {
  if (input.employeesOnly || input.subjectsCount < SUBJECTS_THRESHOLD) return 'small';
  return input.subjectsCount > SUBJECTS_THRESHOLD ? 'large' : 'boundary';
}

const level = (value: 1 | 2 | 3 | 4, basis: string): ProtectionLevelResult => ({
  kind: 'level',
  level: value,
  basis,
});

/** Выбор подпункта, когда важно число субъектов: меньше или больше 100 000. */
function bySize(
  size: Size,
  small: ProtectionLevelResult,
  large: ProtectionLevelResult,
): ProtectionLevelResult {
  if (size === 'small') return small;
  if (size === 'large') return large;
  return {
    kind: 'undetermined',
    reason:
      'Субъектов ровно 100 000: пункты 9–12 различают «более чем» и «менее чем» 100 000 и этот случай не называют. Уточните число субъектов или определите уровень с юристом.',
  };
}

/** Определяет уровень защищённости; нет подходящего подпункта — честно «не определён». */
export function determineProtectionLevel(input: ProtectionLevelInput): ProtectionLevelResult {
  const size = sizeOf(input);
  const { dataKind } = input;

  if (input.threatType === '1') {
    return dataKind === 'public' ? level(2, 'п. 10 «а»') : level(1, 'п. 9 «а»');
  }
  if (input.threatType === '2') {
    switch (dataKind) {
      case 'special':
        return bySize(size, level(2, 'п. 10 «б»'), level(1, 'п. 9 «б»'));
      case 'biometric':
        return level(2, 'п. 10 «в»');
      case 'public':
        return bySize(size, level(3, 'п. 11 «а»'), level(2, 'п. 10 «г»'));
      case 'other':
        return bySize(size, level(3, 'п. 11 «б»'), level(2, 'п. 10 «д»'));
    }
  }
  switch (dataKind) {
    case 'special':
      return bySize(size, level(3, 'п. 11 «в»'), level(2, 'п. 10 «е»'));
    case 'biometric':
      return level(3, 'п. 11 «г»');
    case 'public':
      return level(4, 'п. 12 «а»');
    case 'other':
      return bySize(size, level(4, 'п. 12 «б»'), level(3, 'п. 11 «д»'));
  }
}
