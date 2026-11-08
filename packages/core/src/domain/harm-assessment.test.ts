import { describe, expect, it } from 'vitest';

import { HARM_CASES, HARM_CASE_IDS, determineHarmDegree } from './harm-assessment';
import type { HarmCaseId } from './harm-assessment';

/** Число случаев в пп. 2.1, 2.2 и 2.3 п. 2 Требований (приказ № 178): 6, 5 и 2. */
const COUNT_BY_DEGREE = { high: 6, medium: 5, low: 2 } as const;

describe('степень вреда (пп. 2.1–2.3 и 6 приказа № 178)', () => {
  it('перечень случаев совпадает с нормой: 6 высокой, 5 средней и 2 низкой степени, без повторов', () => {
    for (const [degree, count] of Object.entries(COUNT_BY_DEGREE)) {
      expect(HARM_CASES.filter((harmCase) => harmCase.degree === degree)).toHaveLength(count);
    }
    expect(new Set(HARM_CASE_IDS).size).toBe(HARM_CASES.length);
  });

  it.each([
    ['biometric', 'high'],
    ['foreign-database', 'high'],
    ['public-distribution', 'medium'],
    ['additional-purposes', 'medium'],
    ['public-sources', 'low'],
    ['non-staff-responsible', 'low'],
  ] as const)('случай «%s» даёт %s степень', (id, degree) => {
    const result = determineHarmDegree([id]);
    expect(result.kind === 'degree' && result.degree).toBe(degree);
    expect(result.kind === 'degree' && result.mixed).toBe(false);
  });

  it('при случаях разных степеней применяется более высокая (п. 6)', () => {
    const result = determineHarmDegree([
      'public-sources',
      'additional-purposes',
      'foreign-processor',
    ]);
    expect(result).toMatchObject({ kind: 'degree', degree: 'high', mixed: true });
    const lowAndMedium = determineHarmDegree(['non-staff-responsible', 'direct-marketing']);
    expect(lowAndMedium).toMatchObject({ kind: 'degree', degree: 'medium', mixed: true });
  });

  it('отмеченные случаи возвращаются в порядке Требований, повторы не удваиваются', () => {
    const selected: HarmCaseId[] = ['public-sources', 'biometric', 'biometric'];
    const result = determineHarmDegree(selected);
    expect(result.kind === 'degree' && result.cases.map((harmCase) => harmCase.id)).toEqual([
      'biometric',
      'public-sources',
    ]);
  });

  it('без отмеченных случаев степень не определена и не придумана', () => {
    const result = determineHarmDegree([]);
    expect(result.kind).toBe('undetermined');
    expect(result.kind === 'undetermined' && result.reason).toContain('не определяется');
  });
});
