import { z } from 'zod';

import type { CodebaseRule } from '../domain/audit-rule';
import { createAuditReport } from '../domain/audit-report';
import type { AuditReport } from '../domain/audit-report';
import type { Clock, CodebaseScanner, NormRepository } from '../ports';
import type { ForbiddenError, SourceUnavailableError, ValidationError } from '../shared/errors';
import { ok } from '../shared/result';
import type { Result } from '../shared/result';
import { parseWith } from '../shared/validation';
import { runRules } from './run-rules';

const auditCodebaseInputSchema = z.object({
  path: z.string({ error: 'Укажите путь к проекту' }).trim().min(1, 'Укажите путь к проекту'),
});

export interface AuditCodebaseDeps {
  readonly scanner: CodebaseScanner;
  readonly rules: readonly CodebaseRule[];
  readonly norms: Pick<NormRepository, 'kbVersion'>;
  readonly clock: Clock;
}

export type AuditCodebase = (
  input: unknown,
) => Promise<Result<AuditReport, ValidationError | SourceUnavailableError | ForbiddenError>>;

/** Аудит исходников — только чтение; правки предлагает и делает модель после согласия (ADR-0006). */
export function createAuditCodebase(deps: AuditCodebaseDeps): AuditCodebase {
  return async (input) => {
    const parsed = parseWith(auditCodebaseInputSchema, input, 'Некорректные параметры аудита кода');
    if (!parsed.ok) return parsed;

    const { path } = parsed.value;
    const snapshot = await deps.scanner.scan(path);
    if (!snapshot.ok) return snapshot;

    const outcome = runRules(deps.rules, snapshot.value);
    return ok(
      createAuditReport(
        { type: 'codebase', path },
        outcome.findings,
        [...snapshot.value.notChecked, ...outcome.notChecked],
        { kbVersion: deps.norms.kbVersion, now: deps.clock.now() },
      ),
    );
  };
}
