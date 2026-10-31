import { describe, expect, it } from 'vitest';

import { LEGAL_DISCLAIMER } from '../domain/audit-report';
import { normId } from '../domain/norm-id';
import type { DocumentTemplates, TemplateInfo } from '../ports';
import { notFound } from '../shared/errors';
import { err } from '../shared/result';
import { createInMemoryTemplates, fixedClock } from '../testing/fakes';
import { validProfileInput } from '../testing/fixtures';
import { createGenerateDocument } from './generate-document';

const policyInfo: TemplateInfo = {
  id: 'policy',
  title: 'Политика (тестовая)',
  description: 'Тестовый шаблон',
  normRefs: [normId('152-fz/art-9/part-1')],
  requires: [],
};

const policy = {
  info: policyInfo,
  render: (profile: { name: string }, context: { date: string }) =>
    `# Политика\n\nОператор: ${profile.name}, ${context.date}\n\n\n`,
};

const notification = {
  info: { ...policyInfo, id: 'notification', requires: ['rknNotification' as const] },
  render: () => 'Уведомление',
};

describe('GenerateDocument', () => {
  const generate = createGenerateDocument({
    templates: createInMemoryTemplates([policy, notification]),
    clock: fixedClock('2026-11-02T21:30:00Z'),
  });

  it('перечисляет шаблоны', () => {
    expect(generate.list().map((t) => t.id)).toEqual(['policy', 'notification']);
  });

  it('заполняет шаблон по профилю, датирует его и добавляет дисклеймер', () => {
    const result = generate.render('policy', validProfileInput());
    expect(result.ok && result.value).toEqual({
      templateId: 'policy',
      title: 'Политика (тестовая)',
      normRefs: ['152-fz/art-9/part-1'],
      markdown: `# Политика\n\nОператор: ООО «Тестовый оператор», 2026-11-02\n\n---\n\n_${LEGAL_DISCLAIMER}_\n`,
      warnings: [],
    });
  });

  it('неизвестный шаблон — not-found, даже если профиль пустой', () => {
    const result = generate.render('nda', {});
    expect(!result.ok && result.error).toMatchObject({ kind: 'not-found', id: 'nda' });
  });

  it('неполный профиль — список недостающих полей и название документа', () => {
    const result = generate.render('policy', { name: 'ООО «Тест»' });
    expect(!result.ok && result.error.kind === 'validation' && result.error.issues.length).toBe(8);
    expect(!result.ok && result.error.message).toContain('«Политика (тестовая)»');
  });

  it('требует разделы профиля, которые нужны шаблону', () => {
    const result = generate.render('notification', validProfileInput());
    expect(
      !result.ok && result.error.kind === 'validation' && result.error.issues.map((i) => i.path),
    ).toContain('processingStartDate');
  });

  it('пробрасывает ошибку рендера адаптера', () => {
    const broken: DocumentTemplates = {
      list: () => [policyInfo],
      render: () => err(notFound('template', 'policy')),
    };
    const result = createGenerateDocument({ templates: broken, clock: fixedClock() }).render(
      'policy',
      validProfileInput(),
    );
    expect(!result.ok && result.error.kind).toBe('not-found');
  });
});
