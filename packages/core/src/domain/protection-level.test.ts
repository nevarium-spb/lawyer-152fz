import { describe, expect, it } from 'vitest';

import {
  determineProtectionLevel,
  type ProtectionLevelInput,
  type SystemDataKind,
  type ThreatType,
} from './protection-level';

const SMALL = 50_000;
const LARGE = 150_000;

const levelOf = (
  input: Partial<ProtectionLevelInput> & Pick<ProtectionLevelInput, 'threatType' | 'dataKind'>,
) => {
  const result = determineProtectionLevel({ employeesOnly: false, subjectsCount: SMALL, ...input });
  return result.kind === 'level' ? result.level : null;
};

/** Таблица пп. 9–12 ПП № 1119: [угрозы, категория, меньше 100 000 (или сотрудники), больше 100 000]. */
const TABLE: readonly [ThreatType, SystemDataKind, number, number][] = [
  ['1', 'special', 1, 1],
  ['1', 'biometric', 1, 1],
  ['1', 'other', 1, 1],
  ['1', 'public', 2, 2],
  ['2', 'special', 2, 1],
  ['2', 'biometric', 2, 2],
  ['2', 'public', 3, 2],
  ['2', 'other', 3, 2],
  ['3', 'special', 3, 2],
  ['3', 'biometric', 3, 3],
  ['3', 'public', 4, 4],
  ['3', 'other', 4, 3],
];

describe('уровень защищённости (пп. 9–12 ПП № 1119)', () => {
  it.each(TABLE)('угрозы %s, данные %s', (threatType, dataKind, small, large) => {
    expect(levelOf({ threatType, dataKind, subjectsCount: SMALL })).toBe(small);
    expect(levelOf({ threatType, dataKind, subjectsCount: LARGE })).toBe(large);
  });

  it('данные только сотрудников считаются как «менее 100 000» при любом числе', () => {
    expect(
      levelOf({ threatType: '3', dataKind: 'other', employeesOnly: true, subjectsCount: LARGE }),
    ).toBe(4);
  });

  it('называет подпункт, на котором основан вывод', () => {
    expect(
      determineProtectionLevel({
        threatType: '3',
        dataKind: 'other',
        employeesOnly: false,
        subjectsCount: SMALL,
      }),
    ).toEqual({ kind: 'level', level: 4, basis: 'п. 12 «б»' });
  });

  it('ровно 100 000 субъектов там, где число важно, — «не определён», а не догадка', () => {
    const result = determineProtectionLevel({
      threatType: '2',
      dataKind: 'other',
      employeesOnly: false,
      subjectsCount: 100_000,
    });
    expect(result.kind).toBe('undetermined');
  });

  it('ровно 100 000 там, где число не важно, не мешает определить уровень', () => {
    expect(levelOf({ threatType: '1', dataKind: 'other', subjectsCount: 100_000 })).toBe(1);
    expect(levelOf({ threatType: '3', dataKind: 'public', subjectsCount: 100_000 })).toBe(4);
  });
});
