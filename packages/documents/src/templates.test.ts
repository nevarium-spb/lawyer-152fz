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

  describe('согласие на распространение против приказа РКН № 18', () => {
    const render = (extra: Record<string, unknown> = {}) => {
      const result = generate.render('consent-distribution', {
        ...FULL_REFERENCE_PROFILE,
        publicData: { ...FULL_REFERENCE_PROFILE.publicData, ...extra },
      });
      return result.ok ? result.value.markdown : '';
    };

    it('содержит сведения всех девяти подпунктов Требований', () => {
      const markdown = render();
      for (const required of [
        'отчество (при наличии)', // 1
        'контактная информация', // 2
        'ИНН 7707083893', // 3
        'адрес: 190000', // 3
        'ОГРН 1027700132195', // 3
        'https://romashka.example/reviews', // 4
        'Цель: размещение отзывов', // 5
        '| Персональные данные | имя |', // 6
        'Запреты на передачу и условия обработки', // 7
        'только по его внутренней сети, обеспечивающей доступ к информации лишь для строго определённых сотрудников', // 8
        'Согласие действует: 1 год', // 9
      ]) {
        expect(markdown).toContain(required);
      }
    });

    it('разбивает данные по категориям подп. 6', () => {
      const markdown = render({
        specialCategories: ['состояние здоровья'],
        biometricData: ['голос'],
      });
      expect(markdown).toContain(
        '| Специальные категории персональных данных | состояние здоровья |',
      );
      expect(markdown).toContain('| Биометрические персональные данные | голос |');
      expect(markdown).not.toContain('не охватываются');
    });

    it('без специальных и биометрических данных говорит об этом прямо', () => {
      expect(render()).toContain(
        'биометрические персональные данные настоящим согласием не охватываются',
      );
    });
  });

  it('политика называет право требовать прекращения обработки и личное обращение', () => {
    const result = generate.render('privacy-policy', FULL_REFERENCE_PROFILE);
    const markdown = result.ok ? result.value.markdown : '';
    expect(markdown).toContain('требовать прекращения обработки');
    expect(markdown).toContain('в срок, не превышающий десяти рабочих дней');
    expect(markdown).toContain('часть 5.1 статьи 21 Закона');
    expect(markdown).toContain('может обратиться к Оператору лично');
  });

  it('согласие на обработку предупреждает о письменной форме для спецкатегорий и биометрии', () => {
    const info = templates.list().find((template) => template.id === 'consent-processing');
    expect(info?.description).toContain('письменной форме');
    expect(info?.description).toContain('поля паспорта и подписи убирать нельзя');
  });

  it('в согласие попадают только цели с основанием «согласие»: цели по договору не становятся отзывными', () => {
    const result = generate.render('consent-processing', FULL_REFERENCE_PROFILE);
    const markdown = result.ok ? result.value.markdown : '';
    expect(markdown).toContain('1.1. Цель обработки: Обработка заявок');
    expect(markdown).not.toContain('Заключение и исполнение договоров');
  });

  it('согласие не собирается, если ни одна цель не основана на согласии', () => {
    const result = generate.render('consent-processing', {
      ...FULL_REFERENCE_PROFILE,
      purposes: FULL_REFERENCE_PROFILE.purposes.slice(1),
    });
    expect(!result.ok && result.error.kind === 'validation' && result.error.issues[0]?.path).toBe(
      'purposes',
    );
  });

  it.each(['consent-processing', 'privacy-policy'])(
    '%s отделяет поручение от самостоятельных получателей (ч. 3 ст. 6)',
    (id) => {
      const result = generate.render(id, {
        ...FULL_REFERENCE_PROFILE,
        thirdParties: [
          { role: 'recipient', name: 'ООО «Получатель»', address: 'Москва', purpose: 'доставка' },
        ],
      });
      const markdown = result.ok ? result.value.markdown : '';
      const [processorClause = '', recipientClause = ''] = markdown
        .split('\n')
        .filter((line) => /^(?:2\.1|2\.2|4\.3|4\.4)\. /.test(line));
      expect(processorClause).toContain('не поручает');
      expect(recipientClause).toContain('самостоятельно');
      expect(markdown).toContain('ООО «Получатель»');
    },
  );

  it.each(['privacy-policy', 'rkn-notification'])(
    '%s называет принятыми только меры, которые подтвердил оператор',
    (id) => {
      const partial = generate.render(id, {
        ...FULL_REFERENCE_PROFILE,
        implementedMeasures: ['responsible-person'],
      });
      const markdown = partial.ok ? partial.value.markdown : '';
      expect(markdown).toContain('назначено лицо, ответственное');
      expect(markdown).not.toContain('оценка вреда');
      expect(partial.ok && partial.value.warnings.join()).toContain('оценка вреда');

      const none = generate.render(id, { ...FULL_REFERENCE_PROFILE, implementedMeasures: [] });
      expect(none.ok && none.value.markdown).not.toContain('назначено лицо');
    },
  );

  it('уведомление РКН не утверждает, что требования ПП № 1119 выполняются', () => {
    const known = generate.render('rkn-notification', FULL_REFERENCE_PROFILE);
    expect(known.ok && known.value.markdown).not.toContain('выполняются для уровня');
    const unknown = generate.render('rkn-notification', {
      ...FULL_REFERENCE_PROFILE,
      protectionLevel: 'not-determined',
    });
    const markdown = unknown.ok ? unknown.value.markdown : '';
    expect(markdown).toContain('Уровень защищённости оператор не определил');
    expect(markdown).not.toContain('not-determined');
  });

  it('трансграничное уведомление: срок, перечень государств и запрет баз за рубежом', () => {
    const result = generate.render('cross-border-notification', FULL_REFERENCE_PROFILE);
    const markdown = result.ok ? result.value.markdown : '';
    expect(markdown).toContain('десяти рабочих дней с даты поступления уведомления');
    expect(markdown).toContain('(часть 2 статьи 12 Закона)');
    expect(markdown).toContain('не отменяет часть 5 статьи 18');
    expect(markdown).toContain('№ 78-26-012345 от 20.10.2026');
  });

  it('трансграничное уведомление без номера первичного уведомления не собирается молча', () => {
    const profile = operatorProfileSchema.parse({
      ...FULL_REFERENCE_PROFILE,
      rknNotificationRef: undefined,
    });
    expect(() =>
      templates.render('cross-border-notification', profile, { date: '2026-11-02' }),
    ).toThrow('rknNotificationRef');
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
