import { describe, expect, it } from 'vitest';

import type { CodebaseRule } from '../domain/audit-rule';
import { normId } from '../domain/norm-id';
import type { CodebaseSnapshot } from '../domain/snapshots';
import { sourceUnavailable } from '../shared/errors';
import type { ForbiddenError, SourceUnavailableError } from '../shared/errors';
import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { createStubCodebaseScanner, fixedClock } from '../testing/fakes';
import { makeCodebaseSnapshot, makeFinding } from '../testing/fixtures';
import { createAuditCodebase } from './audit-codebase';

const loggingRule: CodebaseRule = {
  id: 'PD-CODE-TEST',
  title: 'Тестовое правило кода',
  normRefs: [normId('152-fz/art-9/part-1')],
  check: (snapshot) =>
    snapshot.files
      .filter((file) => file.content.includes('console.log(user.phone)'))
      .map((file) =>
        makeFinding({
          ruleId: 'PD-CODE-TEST',
          evidence: [{ type: 'file', path: file.path, line: 1 }],
        }),
      ),
};

const setup = (
  scanResult: Result<CodebaseSnapshot, SourceUnavailableError | ForbiddenError> = ok(
    makeCodebaseSnapshot({ files: [{ path: 'src/a.ts', content: 'console.log(user.phone)' }] }),
  ),
) => {
  const scanner = createStubCodebaseScanner(scanResult);
  const auditCodebase = createAuditCodebase({
    scanner,
    rules: [loggingRule],
    norms: { kbVersion: 'kb-2026.10.24' },
    clock: fixedClock(),
  });
  return { scanner, auditCodebase };
};

describe('AuditCodebase', () => {
  it('сканирует проект и возвращает находки правил кода', async () => {
    const { scanner, auditCodebase } = setup();
    const result = await auditCodebase({ path: '  /repo  ' });

    expect(scanner.calls).toEqual([{ target: '/repo' }]);
    expect(result.ok && result.value.target).toEqual({ type: 'codebase', path: '/repo' });
    expect(result.ok && result.value.findings[0]?.evidence).toEqual([
      { type: 'file', path: 'src/a.ts', line: 1 },
    ]);
  });

  it('пустой путь — ошибка валидации', async () => {
    const result = await setup().auditCodebase({ path: '   ' });
    expect(!result.ok && result.error.kind === 'validation' && result.error.issues[0]).toEqual({
      path: 'path',
      message: 'Укажите путь к проекту',
    });
  });

  it('пробрасывает ошибку сканера', async () => {
    const { auditCodebase } = setup(err(sourceUnavailable('/repo', 'каталог не найден')));
    const result = await auditCodebase({ path: '/repo' });
    expect(!result.ok && result.error.kind).toBe('source-unavailable');
  });
});
