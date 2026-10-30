import { createGenerateDocument, operatorProfileSchema } from '@lawyer-152fz/core';
import { describe, expect, it } from 'vitest';

import { readTemplateFiles } from './load-from-dir';
import { FULL_REFERENCE_PROFILE, MINIMAL_REFERENCE_PROFILE } from './reference-profiles';
import { createDocumentTemplates, referenceProfileFor } from './templates';
import type { TemplateFile } from './templates';

const loaded = createDocumentTemplates(await readTemplateFiles());
if (!loaded.ok) throw new Error(JSON.stringify(loaded.error.issues, null, 2));
const templates = loaded.value;

const generate = createGenerateDocument({
  templates,
  clock: { now: () => new Date('2026-11-02T09:00:00Z') },
});

describe('шаблоны документов (T6.3)', () => {
  it('загружены все шаблоны из Приложения Б плана', () => {
    expect(templates.list().map((t) => t.id)).toEqual([
      'consent-distribution',
      'consent-processing',
      'cross-border-notification',
      'privacy-policy',
      'rkn-notification',
    ]);
  });

  describe.each(templates.list())('$id', (info) => {
    it.each([
      ['full', FULL_REFERENCE_PROFILE],
      ['minimal', referenceProfileFor(MINIMAL_REFERENCE_PROFILE, info.requires)],
    ] as const)('совпадает с эталоном на профиле %s', async (variant, profile) => {
      const result = generate.render(info.id, profile);
      if (!result.ok) throw new Error(JSON.stringify(result.error, null, 2));
      await expect(result.value.markdown).toMatchFileSnapshot(
        `../test/golden/${info.id}.${variant}.md`,
      );
    });

    it('без неподставленных меток и тройных пустых строк', () => {
      const result = generate.render(info.id, FULL_REFERENCE_PROFILE);
      const markdown = result.ok ? result.value.markdown : '';
      expect(markdown).not.toMatch(/\{\{|\}\}|\n\n\n|undefined|null/);
    });
  });

  it('согласие на распространение требует явной отметки об отсутствии запретов (ч. 5 ст. 10.1)', () => {
    const result = generate.render('consent-distribution', FULL_REFERENCE_PROFILE);
    const markdown = result.ok ? result.value.markdown : '';
    expect(markdown).toContain('я не устанавливаю');
    expect(markdown).toContain('Оператор не вправе распространять эти данные');
    expect(markdown).not.toContain('вправе обрабатывать эти данные без них');
  });

  it('согласие на обработку предупреждает о письменной форме для спецкатегорий и биометрии', () => {
    const info = templates.list().find((template) => template.id === 'consent-processing');
    expect(info?.description).toContain('письменной форме');
    expect(info?.description).toContain('поля паспорта и подписи убирать нельзя');
  });

  it('бланки — знаком ＿, а не подчёркиваниями: «__» в Markdown превращается в курсив', async () => {
    for (const file of await readTemplateFiles()) {
      const body = file.content.slice(file.content.indexOf('\n---\n') + 5);
      expect(body, file.path).not.toMatch(/__/);
    }
  });

  it('данные профиля экранируются в документе', () => {
    const profile = operatorProfileSchema.parse({
      ...FULL_REFERENCE_PROFILE,
      name: 'ООО *Звезда*',
    });
    const result = templates.render('privacy-policy', profile, { date: '2026-11-02' });
    expect(result.ok && result.value).toContain('ООО \\*Звезда\\*');
  });

  it('неизвестный шаблон — not-found', () => {
    const profile = operatorProfileSchema.parse(FULL_REFERENCE_PROFILE);
    const result = templates.render('nda', profile, { date: '2026-11-02' });
    expect(!result.ok && result.error.kind).toBe('not-found');
  });
});

describe('проверка шаблонов при загрузке', () => {
  const header = (extra = '') =>
    `---\ntitle: Т\ndescription: Д\nnormRefs: [152-fz/art-9/part-1]\n${extra}---\n\n`;
  const issuesOf = (files: TemplateFile[]) => {
    const result = createDocumentTemplates(files);
    return result.ok ? [] : result.error.issues;
  };

  it('собирает ошибки всех файлов разом', () => {
    expect(
      issuesOf([
        { path: 'Bad_Name.md', content: header() },
        { path: 'no-header.md', content: '# Текст' },
        { path: 'bad-meta.md', content: '---\ntitle: Т\n---\n' },
        { path: 'typo.md', content: `${header()}{{operator.nmae}}` },
        { path: 'undeclared.md', content: `${header()}{{processingStartDate}}` },
        { path: 'unguarded.md', content: `${header()}{{operator.ogrn}}` },
        {
          path: 'ok.md',
          content: `${header('requires: [rknNotification]\n')}{{processingStartDate}}`,
        },
      ]).map((issue) => [issue.path, issue.message]),
    ).toEqual([
      ['Bad_Name.md', 'имя файла — латиница в нижнем регистре через дефис и расширение .md'],
      ['bad-meta.md', expect.stringContaining('description')],
      ['no-header.md', 'нет YAML-заголовка между строками ---'],
      ['typo.md', 'Строка 1: неизвестная метка {{operator.nmae}}'],
      ['undeclared.md', 'Строка 1: {{processingStartDate}} — пустое значение'],
      ['unguarded.md', 'Строка 1: {{operator.ogrn}} — пустое значение'],
    ]);
  });

  it('неизвестный раздел профиля — ошибка заголовка', () => {
    const [issue] = issuesOf([{ path: 'x.md', content: `${header('requires: [nda]\n')}текст` }]);
    expect(issue?.message).toContain('requires');
  });
});
