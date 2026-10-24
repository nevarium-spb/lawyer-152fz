import { describe, expect, it } from 'vitest';

import { makeFinding } from '../testing/fixtures';
import { parseWith } from '../shared/validation';
import { MAX_EXCERPT_LENGTH, compareFindings, findingSchema, toExcerpt } from './finding';

const issuesOf = (input: unknown) => {
  const result = parseWith(findingSchema, input, 'Находка некорректна');
  return result.ok ? [] : result.error.issues;
};

describe('находка аудита', () => {
  it('требует хотя бы одну ссылку на норму и одно доказательство', () => {
    const messages = issuesOf({ ...makeFinding(), normRefs: [], evidence: [] }).map(
      (i) => i.message,
    );
    expect(messages).toEqual([
      'Находка должна содержать хотя бы одно доказательство',
      'Находка должна ссылаться хотя бы на одну норму',
    ]);
  });

  it('проверяет формат идентификатора правила', () => {
    expect(issuesOf({ ...makeFinding(), ruleId: 'form-consent' })[0]?.path).toBe('ruleId');
  });

  it('ограничивает длину недоверенного фрагмента', () => {
    const tooLong = 'x'.repeat(MAX_EXCERPT_LENGTH + 1);
    const evidence = [{ type: 'file', path: 'src/a.ts', untrustedExcerpt: tooLong }];
    expect(issuesOf({ ...makeFinding(), evidence })[0]?.path).toBe('evidence.0.untrustedExcerpt');
  });

  it('принимает доказательство-файл со строкой', () => {
    const evidence = [{ type: 'file', path: 'src/log.ts', line: 12 }];
    expect(issuesOf({ ...makeFinding(), evidence })).toEqual([]);
  });
});

describe('toExcerpt', () => {
  it('сжимает пробелы', () => {
    expect(toExcerpt('  форма \n\t обратной   связи ')).toBe('форма обратной связи');
  });

  it('обрезает длинный текст с многоточием, не превышая предел', () => {
    const excerpt = toExcerpt('а'.repeat(20), 10);
    expect(excerpt).toBe(`${'а'.repeat(9)}…`);
    expect(excerpt).toHaveLength(10);
  });
});

describe('compareFindings', () => {
  it('нарушения → риски → рекомендации, внутри — по важности, затем по правилу', () => {
    const findings = [
      makeFinding({ ruleId: 'PD-C', kind: 'recommendation', severity: 'high' }),
      makeFinding({ ruleId: 'PD-B', kind: 'violation', severity: 'medium' }),
      makeFinding({ ruleId: 'PD-A2', kind: 'violation', severity: 'critical' }),
      makeFinding({ ruleId: 'PD-A1', kind: 'violation', severity: 'critical' }),
      makeFinding({ ruleId: 'PD-D', kind: 'risk', severity: 'low' }),
    ];
    expect([...findings].sort(compareFindings).map((f) => f.ruleId)).toEqual([
      'PD-A1',
      'PD-A2',
      'PD-B',
      'PD-D',
      'PD-C',
    ]);
  });
});
