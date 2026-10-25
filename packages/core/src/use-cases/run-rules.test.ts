import { describe, expect, it } from 'vitest';

import type { SiteRule } from '../domain/audit-rule';
import type { Finding } from '../domain/finding';
import { normId } from '../domain/norm-id';
import { makeFinding, makeSiteSnapshot } from '../testing/fixtures';
import { runRules } from './run-rules';

const DECLARED = [normId('152-fz/art-9/part-1')];

const rule = (id: string, check: () => readonly Finding[], normRefs = DECLARED): SiteRule => ({
  id,
  title: `Правило ${id}`,
  normRefs,
  check,
});

const snapshot = makeSiteSnapshot();

describe('runRules', () => {
  it('собирает находки всех правил и упорядочивает их', () => {
    const outcome = runRules(
      [
        rule('PD-REC', () => [makeFinding({ ruleId: 'PD-REC', kind: 'recommendation' })]),
        rule('PD-VIOL', () => [makeFinding({ ruleId: 'PD-VIOL', kind: 'violation' })]),
      ],
      snapshot,
    );
    expect(outcome.findings.map((f) => f.ruleId)).toEqual(['PD-VIOL', 'PD-REC']);
    expect(outcome.notChecked).toEqual([]);
  });

  it('сбой правила попадает в «не проверено», остальные правила работают', () => {
    const outcome = runRules(
      [
        rule('PD-BROKEN', () => {
          throw new Error('селектор не найден');
        }),
        rule('PD-THROWS-STRING', () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- проверяем защиту от не-Error
          throw 'строка вместо ошибки';
        }),
        rule('PD-OK', () => [makeFinding({ ruleId: 'PD-OK' })]),
      ],
      snapshot,
    );
    expect(outcome.findings.map((f) => f.ruleId)).toEqual(['PD-OK']);
    expect(outcome.notChecked).toEqual([
      'Правило PD-BROKEN не выполнено из-за внутренней ошибки: селектор не найден',
      'Правило PD-THROWS-STRING не выполнено из-за внутренней ошибки: строка вместо ошибки',
    ]);
  });

  it('отбрасывает находку, не прошедшую схему', () => {
    const invalid = { ...makeFinding({ ruleId: 'PD-BAD' }), normRefs: [] };
    const outcome = runRules([rule('PD-BAD', () => [invalid])], snapshot);
    expect(outcome.findings).toEqual([]);
    expect(outcome.notChecked[0]).toBe(
      'Правило PD-BAD вернуло некорректную находку: normRefs: Находка должна ссылаться хотя бы на одну норму',
    );
  });

  it('отбрасывает находку с чужим ruleId', () => {
    const outcome = runRules([rule('PD-A', () => [makeFinding({ ruleId: 'PD-B' })])], snapshot);
    expect(outcome.findings).toEqual([]);
    expect(outcome.notChecked[0]).toContain('ruleId «PD-B» не совпадает с правилом');
  });

  it('отбрасывает находку со ссылкой на необъявленную норму', () => {
    const finding = makeFinding({ ruleId: 'PD-A', normRefs: ['152-fz/art-18/part-5'] });
    const outcome = runRules([rule('PD-A', () => [finding])], snapshot);
    expect(outcome.findings).toEqual([]);
    expect(outcome.notChecked[0]).toContain('необъявленные нормы: 152-fz/art-18/part-5');
  });
});
