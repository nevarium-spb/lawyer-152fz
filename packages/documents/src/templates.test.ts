import { createGenerateDocument, operatorProfileSchema } from '@lawyer-152fz/core';
import { describe, expect, it } from 'vitest';

import { readTemplateFiles } from './load-from-dir';
import {
  FULL_REFERENCE_PROFILE,
  MINIMAL_REFERENCE_PROFILE,
  REFERENCE_INCIDENT,
} from './reference-profiles';
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
      'access-list',
      'consent-distribution',
      'consent-processing-web',
      'consent-processing',
      'cross-border-notification',
      'destruction-act',
      'destruction-procedure',
      'harm-assessment',
      'incident-notification',
      'media-register',
      'privacy-policy',
      'processing-agreement',
      'processing-regulation',
      'protection-level-act',
      'responsible-person-order',
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

    it('ссылается на все девять пунктов Требований в базе', () => {
      const info = templates.list().find((template) => template.id === 'consent-distribution');
      for (const item of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
        expect(info?.normRefs).toContain(`rkn-order-18/item-${item}`);
      }
    });

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

  describe.each(['consent-processing', 'consent-processing-web'])('%s', (id) => {
    it('в согласие попадают только цели с основанием «согласие»: цели по договору не становятся отзывными', () => {
      const result = generate.render(id, FULL_REFERENCE_PROFILE);
      const markdown = result.ok ? result.value.markdown : '';
      expect(markdown).toContain('1.1. Цель обработки: Обработка заявок');
      expect(markdown).not.toContain('Заключение и исполнение договоров');
    });

    it('согласие не собирается, если ни одна цель не основана на согласии', () => {
      const result = generate.render(id, {
        ...FULL_REFERENCE_PROFILE,
        purposes: FULL_REFERENCE_PROFILE.purposes.slice(1),
      });
      expect(!result.ok && result.error.kind === 'validation' && result.error.issues[0]?.path).toBe(
        'purposes',
      );
    });

    it('называет срок хранения цели отдельно от срока действия согласия', () => {
      const [purpose] = FULL_REFERENCE_PROFILE.purposes;
      if (!purpose) throw new Error('нет цели в эталоне');
      const result = generate.render(id, {
        ...FULL_REFERENCE_PROFILE,
        purposes: [{ ...purpose, retention: '1 год' }],
        consentTerm: 'до отзыва согласия',
      });
      const markdown = result.ok ? result.value.markdown : '';
      expect(markdown).toContain('Срок обработки и хранения персональных данных: 1 год.');
      expect(markdown).toContain('3.1. Согласие действует: до отзыва согласия.');
    });

    it('содержит сведения из пп. 3–8 ч. 4 ст. 9', () => {
      const result = generate.render(id, FULL_REFERENCE_PROFILE);
      const markdown = result.ok ? result.value.markdown : '';
      for (const required of [
        'ООО «Ромашка»', // 3
        'адрес: 190000', // 3
        'Цель обработки:', // 4
        'Перечень персональных данных:', // 5
        'ООО «Хостинг»', // 6
        'Действия с персональными данными:', // 7
        'Способ обработки:', // 7
        'Согласие действует:', // 8
        'Я вправе отозвать согласие', // 8
      ]) {
        expect(markdown).toContain(required);
      }
    });
  });

  describe('варианты согласия: форма на сайте и письменное', () => {
    const render = (id: string) => {
      const result = generate.render(id, FULL_REFERENCE_PROFILE);
      return result.ok ? result.value.markdown : '';
    };
    const conditions = (markdown: string) =>
      markdown.slice(markdown.indexOf('## 1.'), markdown.indexOf('\n', markdown.indexOf('3.3.')));

    it('письменное содержит реквизиты субъекта, представителя и подпись (пп. 1, 2, 9 ч. 4 ст. 9)', () => {
      const markdown = render('consent-processing');
      for (const required of ['фамилия, имя, отчество', 'Сведения о представителе', 'Подпись:']) {
        expect(markdown).toContain(required);
      }
    });

    it('для сайта — без реквизитов, бланков и подписи (ч. 1 ст. 9)', () => {
      const markdown = render('consent-processing-web');
      for (const absent of ['удостоверяющий', 'представител', 'Подпись', 'подчеркнуть', '＿']) {
        expect(markdown).not.toContain(absent);
      }
      expect(markdown).toContain('на сайте https://romashka.example');
    });

    it('для сайта — без адреса сайта в профиле текст не ломается', () => {
      const result = generate.render('consent-processing-web', {
        ...FULL_REFERENCE_PROFILE,
        website: undefined,
      });
      const markdown = result.ok ? result.value.markdown : '';
      expect(markdown).toContain('в электронной форме, я от своего имени');
    });

    it('для сайта — называет редакцию текста, она нужна журналу согласий', () => {
      expect(render('consent-processing-web')).toContain('Редакция текста согласия от 02.11.2026.');
    });

    it('для сайта — не охватывает данные, для которых нужна письменная форма', () => {
      expect(render('consent-processing-web')).toContain(
        'не охватывает специальные категории персональных данных и биометрические персональные данные',
      );
      const info = templates.list().find((template) => template.id === 'consent-processing-web');
      expect(info?.description).toContain('этот вариант не подходит');
    });

    it('условия обработки в двух вариантах не расходятся', () => {
      const web = conditions(render('consent-processing-web'));
      expect(web).toContain('## 1.');
      expect(web).toContain('3.3.');
      expect(web).toBe(conditions(render('consent-processing')));
    });

    it('об обязанности доказать получение согласия говорят оба варианта (ч. 3 ст. 9)', () => {
      for (const info of templates.list().filter((t) => t.id.startsWith('consent-processing'))) {
        expect(info.description).toContain('ч. 3 ст. 9');
        expect(info.normRefs).toContain('152-fz/art-9/part-3');
      }
    });
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

  it('уведомление об инциденте: два срока, лицо для связи и расследование', () => {
    const result = generate.render('incident-notification', FULL_REFERENCE_PROFILE);
    const markdown = result.ok ? result.value.markdown : '';
    expect(markdown).toContain('двадцати четырёх часов');
    expect(markdown).toContain('семидесяти двух часов');
    expect(markdown).toContain('Лицо, уполномоченное оператором на взаимодействие');
    expect(markdown).toContain('открытое хранилище резервных копий');
    expect(markdown).toContain('системный администратор, настроивший хранилище');
  });

  it('уведомление об инциденте без итогов расследования оставляет бланк, а не выдумывает итоги', () => {
    const result = generate.render('incident-notification', {
      ...FULL_REFERENCE_PROFILE,
      incident: {
        ...REFERENCE_INCIDENT,
        investigationResults: undefined,
        responsiblePersons: undefined,
      },
    });
    const markdown = result.ok ? result.value.markdown : '';
    expect(markdown).toContain('Расследование не завершено');
    expect(markdown).toContain('Сведений о таких лицах нет или они не установлены');
    expect(markdown).not.toContain('открытое хранилище');
  });

  it('приказ об ответственном: назначение, подотчётность и три обязанности ч. 4 ст. 22.1', () => {
    const result = generate.render('responsible-person-order', FULL_REFERENCE_PROFILE);
    const markdown = result.ok ? result.value.markdown : '';
    expect(markdown).toContain('# Приказ № 12-ПД');
    expect(markdown).toContain(
      'в ООО «Ромашка»: Петрова Анна Сергеевна, руководитель юридического отдела.',
    );
    expect(markdown).toContain('получает указания непосредственно от исполнительного органа');
    expect(markdown).toContain('1) осуществлять внутренний контроль');
    expect(markdown).toContain('2) доводить до сведения работников');
    expect(markdown).toContain('3) организовывать приём и обработку обращений');
    expect(markdown).toContain(
      'генеральный директор ＿＿＿＿＿＿＿＿＿＿ / Орлов Сергей Викторович /',
    );
    expect(markdown).not.toContain('Приказ не составлен');
  });

  it('приказ об ответственном для предпринимателя не составляется: ч. 1 ст. 22.1 о юридических лицах', () => {
    const result = generate.render('responsible-person-order', {
      ...FULL_REFERENCE_PROFILE,
      inn: '500100732259',
    });
    const markdown = result.ok ? result.value.markdown : '';
    expect(markdown).toContain('# Приказ не составлен');
    expect(markdown).not.toContain('ПРИКАЗЫВАЮ');
  });

  describe('реестр носителей (пп. 13–15 ПП 687)', () => {
    const render = (extra: Record<string, unknown> = {}) => {
      const result = generate.render('media-register', { ...FULL_REFERENCE_PROFILE, ...extra });
      return result.ok ? result.value.markdown : '';
    };
    const entry = FULL_REFERENCE_PROFILE.mediaRegister?.[0];

    it('перечисляет носитель, место, лиц с доступом, меры и ответственного', () => {
      const markdown = render();
      expect(markdown).toContain('### 1. договоры и анкеты клиентов в бумажных папках');
      expect(markdown).toContain('Место хранения: кабинет 204, запираемый шкаф № 1.');
      expect(markdown).toContain(
        'менеджер по работе с клиентами; руководитель юридического отдела',
      );
      expect(markdown).toContain('шкаф запирается на ключ');
      expect(markdown).toContain(
        'Ответственный за реализацию мер: руководитель юридического отдела.',
      );
      expect(markdown).not.toContain('Реестр не составлен');
      expect(markdown).not.toContain('Внимание:');
    });

    it('предупреждает, если у разных целей одно место хранения (п. 14)', () => {
      const markdown = render({
        mediaRegister: [
          entry,
          { ...entry, purpose: 'Кадровый учёт', medium: 'личные дела работников' },
        ],
      });
      expect(markdown).toContain('совпадает с местом хранения носителей для цели «Кадровый учёт»');
      expect(markdown).toContain('для цели «Заключение и исполнение договоров с клиентами»');
    });

    it('называет цели с неавтоматизированной обработкой, для которых носителей в реестре нет', () => {
      const markdown = render({
        purposes: [
          ...FULL_REFERENCE_PROFILE.purposes,
          {
            ...FULL_REFERENCE_PROFILE.purposes[0],
            title: 'Кадровый учёт',
            methods: 'non-automated',
          },
        ],
      });
      expect(markdown).toContain('нет ни одного носителя');
      expect(markdown).toContain('- Кадровый учёт;');
    });

    it('если все цели автоматизированные, реестр не составляется (п. 1 Положения)', () => {
      const markdown = render({
        purposes: [{ ...FULL_REFERENCE_PROFILE.purposes[0], methods: 'automated' }],
      });
      expect(markdown).toContain('# Реестр не составлен');
      expect(markdown).not.toContain('## Носители');
    });
  });

  describe('акт определения уровня защищённости (пп. 5–12 ПП 1119)', () => {
    const system = FULL_REFERENCE_PROFILE.protectionAssessment?.systems[0];
    const render = (systems: unknown[]) => {
      const result = generate.render('protection-level-act', {
        ...FULL_REFERENCE_PROFILE,
        protectionAssessment: { date: '2026-11-03', systems },
      });
      return result.ok ? result.value.markdown : '';
    };

    it('считает уровень и перечисляет требования этого уровня', () => {
      const markdown = render([system]);
      expect(markdown).toContain('### 1. CRM');
      expect(markdown).toContain('**Уровень защищённости: 4-й** (п. 12 «б» Требований)');
      expect(markdown).toContain('(пп. «в» п. 13)');
      expect(markdown).not.toContain('(п. 14)');
      expect(markdown).not.toContain('не определён');
    });

    it('для 3-го уровня добавляет ответственного за безопасность (п. 14)', () => {
      const markdown = render([{ ...system, subjectsCount: 150_000 }]);
      expect(markdown).toContain('**Уровень защищённости: 3-й** (п. 11 «д» Требований)');
      expect(markdown).toContain('(п. 14)');
      expect(markdown).not.toContain('(п. 15)');
    });

    it('для 1-го уровня включает требования пп. 13–16', () => {
      const markdown = render([{ ...system, threatType: '1' }]);
      expect(markdown).toContain('**Уровень защищённости: 1-й** (п. 9 «а» Требований)');
      expect(markdown).toContain('(пп. «б» п. 16)');
    });

    it('ровно 100 000 субъектов там, где норма молчит, — уровень не определён, а не угадан', () => {
      const markdown = render([{ ...system, threatType: '2', subjectsCount: 100_000 }]);
      expect(markdown).toContain('Уровень защищённости не определён.');
      expect(markdown).toContain('акт не устанавливает требований');
      expect(markdown).not.toContain('Для этого уровня необходимо');
    });

    it('тип угроз берётся у пользователя и так и записан', () => {
      expect(render([system])).toContain('Тип актуальных угроз (п. 6): 3-й (указан оператором).');
    });
  });

  describe('перечень допущенных к данным (пп. «в» п. 13 ПП 1119)', () => {
    const entry = FULL_REFERENCE_PROFILE.accessList?.entries[0];
    const render = (entries: unknown[]) => {
      const result = generate.render('access-list', {
        ...FULL_REFERENCE_PROFILE,
        accessList: { ...FULL_REFERENCE_PROFILE.accessList, entries },
      });
      return result.ok ? result.value.markdown : '';
    };

    it('перечисляет должности, обязанности и категории данных по системам', () => {
      const markdown = render([
        entry,
        { ...entry, system: '1С', position: 'бухгалтер', duties: 'расчёт заработной платы' },
      ]);
      expect(markdown).toContain('## Информационная система: CRM');
      expect(markdown).toContain('## Информационная система: 1С');
      expect(markdown).toContain('1. менеджер по работе с клиентами.');
      expect(markdown).toContain('расчёт заработной платы');
      expect(markdown).toContain(
        'генеральный директор ＿＿＿＿＿＿＿＿＿＿ / Орлов Сергей Викторович /',
      );
    });

    it('без должностей перечень не собирается молча', () => {
      const result = generate.render('access-list', {
        ...FULL_REFERENCE_PROFILE,
        accessList: { ...FULL_REFERENCE_PROFILE.accessList, entries: [] },
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('акт оценки вреда (приказ РКН № 178)', () => {
    const base = FULL_REFERENCE_PROFILE.harmAssessment;
    const render = (override: Record<string, unknown>) => {
      const result = generate.render('harm-assessment', {
        ...FULL_REFERENCE_PROFILE,
        harmAssessment: { ...base, ...override },
      });
      return result.ok ? result.value.markdown : '';
    };

    it('при разных степенях применяет более высокую и говорит об этом (п. 6)', () => {
      const markdown = render({ cases: ['public-sources', 'additional-purposes'] });
      expect(markdown).toContain('применяется более высокая степень вреда (п. 6 Требований)');
      expect(markdown).toContain('в случае нарушения Закона: средняя**');
      expect(markdown).not.toContain('Степень вреда не определена');
    });

    it('высокая степень — по подпункту 2.1, низкая — по 2.3, без оговорки о разных степенях', () => {
      const high = render({ cases: ['foreign-database'] });
      expect(high).toContain('Закона: высокая** (подпункт 2.1 пункта 2 Требований)');
      expect(high).not.toContain('применяется более высокая степень вреда (п. 6 Требований)');
      const low = render({ cases: ['non-staff-responsible'] });
      expect(low).toContain('Закона: низкая** (подпункт 2.3 пункта 2 Требований)');
    });

    it('без отмеченных случаев степень не определена, а не выбрана', () => {
      const markdown = render({ cases: [] });
      expect(markdown).toContain('**Степень вреда не определена.**');
      expect(markdown).not.toContain('Закона: высокая');
      expect(markdown).not.toContain('Закона: средняя');
      expect(markdown).not.toContain('Закона: низкая');
    });

    it('называет, кто проводил оценку, и оставляет подпись каждого (п. 4 «г»)', () => {
      expect(render({ conductedBy: 'commission' })).toContain('провела комиссия');
      const markdown = render({ conductedBy: 'responsible-person' });
      expect(markdown).toContain('провёл ответственный за организацию обработки');
      expect(markdown).toContain('＿＿＿＿＿＿＿＿＿＿ / Петрова Анна Сергеевна /');
      expect(markdown).toContain('＿＿＿＿＿＿＿＿＿＿ / Громов Илья Андреевич /');
    });

    it('без лиц, проводивших оценку, акт не собирается молча', () => {
      const result = generate.render('harm-assessment', {
        ...FULL_REFERENCE_PROFILE,
        harmAssessment: { ...base, assessors: [] },
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('акт об уничтожении (приказ РКН № 179)', () => {
    const base = FULL_REFERENCE_PROFILE.destructionAct;
    const render = (override: Record<string, unknown>) => {
      const result = generate.render('destruction-act', {
        ...FULL_REFERENCE_PROFILE,
        destructionAct: { ...base, ...override },
      });
      return result.ok ? result.value.markdown : '';
    };

    it('содержит все десять сведений п. 3 и подпись уничтожившего', () => {
      const markdown = render({});
      for (const required of [
        'ООО «Ромашка», ИНН 7707083893', // а
        'ООО «Хостинг», адрес: 190000', // б
        '- Иванов Иван Иванович', // в
        '＿＿＿＿＿＿＿＿＿＿ / Громов Илья Андреевич /', // г
        'фамилия, имя, отчество; номер телефона', // д
        '1. анкета клиента, листов: 3.', // е
        '- CRM', // ж
        'Способ уничтожения: измельчение', // з
        'Причина уничтожения: достижение цели обработки', // и
        'Дата уничтожения персональных данных: 05.11.2026', // к
      ]) {
        expect(markdown).toContain(required);
      }
    });

    it('если данные были в системах, требует выгрузку из журнала (пп. 2, 5, 6)', () => {
      const markdown = render({});
      expect(markdown).toContain('## Выгрузка из журнала регистрации событий');
      expect(markdown).toContain('(пп. 2 и 7 Требований)');
      expect(markdown).toContain('недостающие сведения вносятся в акт (п. 6 Требований)');
    });

    it('только бумажные носители — один акт, без выгрузки (п. 1)', () => {
      const markdown = render({ systems: undefined });
      expect(markdown).not.toContain('## Выгрузка из журнала');
      expect(markdown).not.toContain('## Информационные системы');
      expect(markdown).toContain(
        'документ, подтверждающий уничтожение, — один акт (п. 1 Требований)',
      );
    });

    it('без поручения обработки говорит об этом прямо, а срок хранения — 3 года (п. 8)', () => {
      const markdown = render({ processors: undefined });
      expect(markdown).toContain('не поручалась');
      expect(markdown).toContain('в течение 3 лет с момента уничтожения персональных данных');
    });

    it('если не названо ни носителей, ни систем, акт не собирается молча', () => {
      const result = generate.render('destruction-act', {
        ...FULL_REFERENCE_PROFILE,
        destructionAct: { ...base, media: undefined, systems: undefined },
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('порядок уничтожения (ст. 21 Закона, приказ РКН № 179)', () => {
    const render = (methods: 'automated' | 'non-automated' | 'mixed') => {
      const result = generate.render('destruction-procedure', {
        ...FULL_REFERENCE_PROFILE,
        purposes: [{ ...FULL_REFERENCE_PROFILE.purposes[0], methods }],
      });
      return result.ok ? result.value.markdown : '';
    };

    it('называет сроки из частей 3–6 статьи 21', () => {
      const markdown = render('automated');
      for (const fragment of [
        'не превышающий тридцати дней с даты достижения цели',
        'не превышающий тридцати дней с даты поступления отзыва',
        'не превышающий десяти рабочих дней с даты выявления неправомерной обработки',
        'не превышающий трёх рабочих дней',
        'не более чем на пять рабочих дней',
        'в срок не более чем шесть месяцев',
      ]) {
        expect(markdown).toContain(fragment);
      }
    });

    it('без средств автоматизации — только акт (п. 1), выгрузки нет', () => {
      const markdown = render('non-automated');
      expect(markdown).toContain(
        'уничтожение подтверждает акт об уничтожении персональных данных (п. 1 Требований)',
      );
      expect(markdown).not.toContain('выгрузка из журнала');
      expect(markdown).not.toContain('5.4. Выгрузка');
    });

    it('с автоматизацией — акт и выгрузка (п. 2), содержание выгрузки по п. 5', () => {
      const markdown = render('automated');
      expect(markdown).toContain('(п. 2 Требований)');
      expect(markdown).toContain('5.4. Выгрузка из журнала содержит (п. 5 Требований)');
    });

    it('смешанная обработка — акт и выгрузка по п. 7', () => {
      const markdown = render('mixed');
      expect(markdown).toContain('(п. 7 Требований)');
      expect(markdown).toContain('5.4. Выгрузка');
    });

    it('исполнители и способы — только те, что назвал оператор', () => {
      const markdown = render('mixed');
      expect(markdown).toContain('- начальник отдела информационных технологий.');
      expect(markdown).toContain('| бумажные носители | измельчение в шредере |');
    });
  });

  describe('договор поручения (ч. 3 ст. 6 Закона)', () => {
    const base = FULL_REFERENCE_PROFILE.processingAgreement;
    const render = (override: Record<string, unknown> = {}) => {
      const result = generate.render('processing-agreement', {
        ...FULL_REFERENCE_PROFILE,
        processingAgreement: { ...base, ...override },
      });
      return result.ok ? result.value.markdown : '';
    };

    it('содержит все условия поручения из ч. 3 ст. 6', () => {
      const markdown = render();
      for (const required of [
        '# Договор поручения обработки персональных данных № 15-ПД',
        '- Обработка заявок и обращений, поступивших через сайт', // цели
        '- номер телефона', // перечень данных
        'которые совершает Обработчик: запись; хранение; удаление; уничтожение', // действия
        'не раскрывать третьим лицам и не распространять', // конфиденциальность, ст. 7
        'соблюдать требования статьи 18.1 Закона',
        'Соблюдать требования части 5 статьи 18 Закона',
        'в том числе до начала обработки персональных данных', // документы по запросу
        'Обеспечивать безопасность персональных данных', // безопасность
        '(ч. 1 ст. 19 Закона)', // требования к защите по ст. 19
        '10. контроль за принимаемыми мерами',
        '(ч. 3.1 ст. 21 Закона), в течение 4 часов с момента выявления инцидента', // уведомление
      ]) {
        expect(markdown).toContain(required);
      }
    });

    it('срок поручения и дополнительные требования — только если их назвал оператор', () => {
      const full = render();
      expect(full).toContain('1.6. Поручение действует на срок действия договора хостинга');
      expect(full).toContain('- резервные копии хранятся в зашифрованном виде');
      const bare = render({ term: undefined, extraSecurityRequirements: undefined });
      expect(bare).not.toContain('1.6.');
      expect(bare).not.toContain('3.3.');
    });

    it('обработчик в РФ — отвечает оператор (ч. 5 ст. 6); за рубежом — оба (ч. 6 ст. 6)', () => {
      const domestic = render();
      expect(domestic).toContain('(ч. 5 ст. 6 Закона)');
      expect(domestic).not.toContain('ч. 6 ст. 6');
      expect(domestic).not.toContain('ч. 3 ст. 12');
      const foreign = render({ processor: { ...base?.processor, country: 'DE' } });
      expect(foreign).toContain('несут Оператор и Обработчик (ч. 6 ст. 6 Закона)');
      expect(foreign).toContain('оператор уведомляет Роскомнадзор (ч. 3 ст. 12 Закона)');
    });

    it('не придумывает срок уведомления об инциденте и называет 24 часа оператора', () => {
      const markdown = render();
      expect(markdown).toContain('закон не устанавливает');
      expect(markdown).toContain('в течение двадцати четырёх часов');
    });

    it('без условий поручения договор не собирается молча', () => {
      const result = generate.render('processing-agreement', {
        ...FULL_REFERENCE_PROFILE,
        processingAgreement: { ...base, purposes: [] },
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('положение об обработке (п. 2 ч. 1 ст. 18.1 Закона)', () => {
    const base = FULL_REFERENCE_PROFILE.processingRegulation;
    const render = (profile: Record<string, unknown> = {}) => {
      const result = generate.render('processing-regulation', {
        ...FULL_REFERENCE_PROFILE,
        ...profile,
      });
      return result.ok ? result.value.markdown : '';
    };

    it('по каждой цели — категории, перечень, субъекты, способы и сроки', () => {
      const markdown = render();
      for (const required of [
        'приказом № 16-ПД от 06.11.2026',
        '### 2.1. Обработка заявок и обращений, поступивших через сайт',
        '### 2.2. Заключение и исполнение договоров с клиентами',
        '- Категории персональных данных: иные персональные данные.',
        '- Перечень персональных данных: фамилия, имя; номер телефона; адрес электронной почты.',
        '- Категории субъектов персональных данных: посетители сайта',
        '- Способ обработки: автоматизированная обработка',
        '- Срок обработки и хранения: 1 год с даты получения заявки',
        '(часть 7 статьи 5 Закона)',
        'установленные частями 3–5 статьи 21 Закона',
        'утверждённым документом № 14-ПД от 04.11.2026',
      ]) {
        expect(markdown).toContain(required);
      }
      expect(markdown).not.toContain('оператор не указал');
      expect(markdown).not.toContain('статьям 10 и 11');
    });

    it('цель без категорий помечает, а не придумывает категории', () => {
      const markdown = render({
        processingRegulation: { ...base, dataKinds: base?.dataKinds.slice(0, 1) },
      });
      expect(markdown).toContain(
        '- Категории персональных данных: **оператор не указал** — определите до утверждения положения.',
      );
    });

    it('специальные категории — напоминает о ст. 10 и 11', () => {
      const markdown = render({
        processingRegulation: {
          ...base,
          dataKinds: [
            { purpose: 'Заключение и исполнение договоров с клиентами', kinds: ['special'] },
          ],
        },
      });
      expect(markdown).toContain('специальные категории персональных данных (ст. 10 Закона)');
      expect(markdown).toContain('по статьям 10 и 11 Закона');
    });

    it('без порядка уничтожения просит его утвердить, предпринимателю — оговорка о п. 2', () => {
      const markdown = render({ destructionProcedure: undefined, inn: '500100732259' });
      expect(markdown).toContain('определяются порядком уничтожения персональных данных');
      expect(markdown).toContain('утвердите отдельным документом');
      expect(markdown).toContain('Предприниматель определяет состав мер сам');
    });

    it('не утверждает, что устанавливает процедуры предотвращения нарушений', () => {
      expect(render()).toContain('Это положение таких процедур не устанавливает.');
    });
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
