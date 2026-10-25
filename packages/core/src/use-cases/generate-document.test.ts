import { describe, expect, it } from 'vitest';

import { LEGAL_DISCLAIMER } from '../domain/audit-report';
import { normId } from '../domain/norm-id';
import type { DocumentTemplates } from '../ports';
import { notFound } from '../shared/errors';
import { err } from '../shared/result';
import { createInMemoryTemplates } from '../testing/fakes';
import { validProfileInput } from '../testing/fixtures';
import { createGenerateDocument } from './generate-document';

const policy = {
  info: { id: 'policy', title: 'Политика (тестовая)', normRefs: [normId('152-fz/art-9/part-1')] },
  render: (profile: { name: string }) => `# Политика\n\nОператор: ${profile.name}\n\n\n`,
};

describe('GenerateDocument', () => {
  const generate = createGenerateDocument({ templates: createInMemoryTemplates([policy]) });

  it('перечисляет шаблоны', () => {
    expect(generate.list().map((t) => t.id)).toEqual(['policy']);
  });

  it('заполняет шаблон по профилю и добавляет дисклеймер', () => {
    const result = generate.render('policy', validProfileInput());
    expect(result.ok && result.value).toEqual({
      templateId: 'policy',
      title: 'Политика (тестовая)',
      normRefs: ['152-fz/art-9/part-1'],
      markdown: `# Политика\n\nОператор: ООО «Тестовый оператор»\n\n---\n\n_${LEGAL_DISCLAIMER}_\n`,
    });
  });

  it('неизвестный шаблон — not-found, даже если профиль пустой', () => {
    const result = generate.render('nda', {});
    expect(!result.ok && result.error).toMatchObject({ kind: 'not-found', id: 'nda' });
  });

  it('неполный профиль — список недостающих полей', () => {
    const result = generate.render('policy', { name: 'ООО «Тест»' });
    expect(!result.ok && result.error.kind).toBe('validation');
    expect(!result.ok && result.error.kind === 'validation' && result.error.issues.length).toBe(8);
  });

  it('пробрасывает ошибку рендера адаптера', () => {
    const broken: DocumentTemplates = {
      list: () => [policy.info],
      render: () => err(notFound('template', 'policy')),
    };
    const result = createGenerateDocument({ templates: broken }).render(
      'policy',
      validProfileInput(),
    );
    expect(!result.ok && result.error.kind).toBe('not-found');
  });
});
