import type { AuditRule } from '../domain/audit-rule';
import { compareFindings, findingSchema } from '../domain/finding';
import type { Finding } from '../domain/finding';
import { parseWith } from '../shared/validation';

export interface RuleRunOutcome {
  readonly findings: readonly Finding[];
  readonly notChecked: readonly string[];
}

/**
 * Прогоняет правила над снимком (ADR-0004).
 * Сбой одного правила не роняет аудит: он попадает в «не проверено», остальные работают.
 * Каждая находка проверяется схемой и может ссылаться только на нормы, объявленные правилом.
 */
export function runRules<TSnapshot>(
  rules: readonly AuditRule<TSnapshot>[],
  snapshot: TSnapshot,
): RuleRunOutcome {
  const findings: Finding[] = [];
  const notChecked: string[] = [];

  for (const rule of rules) {
    let produced: readonly Finding[];
    try {
      produced = rule.check(snapshot);
    } catch (error) {
      notChecked.push(
        `Правило ${rule.id} не выполнено из-за внутренней ошибки: ${describeError(error)}`,
      );
      continue;
    }

    for (const finding of produced) {
      const problem = findFindingProblem(rule, finding);
      if (problem === undefined) findings.push(finding);
      else notChecked.push(`Правило ${rule.id} вернуло некорректную находку: ${problem}`);
    }
  }

  return { findings: findings.sort(compareFindings), notChecked };
}

function findFindingProblem<TSnapshot>(
  rule: AuditRule<TSnapshot>,
  finding: Finding,
): string | undefined {
  const parsed = parseWith(findingSchema, finding, 'Находка некорректна');
  if (!parsed.ok) {
    return parsed.error.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
  }
  if (finding.ruleId !== rule.id) {
    return `ruleId «${finding.ruleId}» не совпадает с правилом`;
  }
  const undeclared = finding.normRefs.filter((ref) => !rule.normRefs.includes(ref));
  if (undeclared.length > 0) {
    return `ссылки на необъявленные нормы: ${undeclared.join(', ')}`;
  }
  return undefined;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
