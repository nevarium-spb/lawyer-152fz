import {
  HARM_CASES,
  HARM_CASE_IDS,
  IMPLEMENTED_MEASURES,
  PROCESSING_METHODS,
  PROFILE_SECTIONS,
  PROTECTION_LEVELS,
  SYSTEM_DATA_KINDS,
  THIRD_PARTY_ROLES,
  profileSectionFields,
} from '@lawyer-152fz/core';
import type { GenerateDocument, TemplateInfo } from '@lawyer-152fz/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatError } from './format';
import { describeNormId } from './report';

/**
 * Схема профиля описывает поля для модели; обязательность, форматы и контрольные суммы
 * проверяет ядро — с русскими сообщениями и всеми недостающими полями за один вызов (T6.2).
 */
const text = (description: string) => z.string().optional().describe(description);
const list = (description: string) => z.array(z.string()).optional().describe(description);

const profileShape = z
  .object({
    name: text(
      'Наименование оператора; для ИП — «Индивидуальный предприниматель Фамилия Имя Отчество»',
    ),
    inn: text('ИНН: 10 цифр для организации, 12 — для ИП'),
    ogrn: text('ОГРН (13 цифр) или ОГРНИП (15 цифр), если есть'),
    legalAddress: text('Адрес оператора с индексом; для организации — адрес из ЕГРЮЛ'),
    contactEmail: text('E-mail для обращений субъектов персональных данных'),
    website: text('Сайт оператора, полный URL'),
    responsiblePerson: z
      .object({
        fullName: text('ФИО ответственного за организацию обработки ПДн'),
        position: text('Должность'),
        phone: text('Телефон'),
        email: text('E-mail'),
      })
      .optional()
      .describe('Ответственный за организацию обработки ПДн'),
    purposes: z
      .array(
        z.object({
          title: text('Цель обработки, например «Обработка заявок с сайта»'),
          dataCategories: list('Перечень персональных данных для этой цели'),
          subjectCategories: list('Категории субъектов: клиенты, посетители сайта, работники…'),
          legalBasis: text(
            'Правовое основание, например «согласие субъекта (п. 1 ч. 1 ст. 6 152-ФЗ)»',
          ),
          actions: list(
            'Действия: сбор, запись, систематизация, хранение, использование, удаление…',
          ),
          methods: z.enum(PROCESSING_METHODS).optional().describe('Способ обработки'),
          retention: text('Срок обработки и хранения для этой цели'),
        }),
      )
      .optional()
      .describe('Цели обработки — по каждой отдельно (ст. 18.1, ч. 3.1 ст. 22)'),
    databaseLocation: z
      .object({
        country: text(
          'Код страны ISO 3166-1, где база находится на самом деле. Шаблоны принимают только RU (ч. 5 ст. 18), но не подставляй RU, если пользователь этого не подтвердил',
        ),
        address: text('Город и ЦОД или хостинг-провайдер'),
      })
      .optional()
      .describe('Где находится база данных с персональными данными'),
    thirdParties: z
      .array(
        z.object({
          role: z
            .enum(THIRD_PARTY_ROLES)
            .optional()
            .describe(
              'processor — обрабатывает данные по поручению оператора (хостинг, рассылка); recipient — самостоятельный получатель, обрабатывает данные как отдельный оператор',
            ),
          name: text('Наименование'),
          address: text('Адрес'),
          purpose: text('Зачем передаются данные или поручается обработка'),
        }),
      )
      .optional()
      .describe(
        'Обязательно. Кому передаются данные или поручается обработка: хостинг, почта, аналитика, CRM, платежи, рассылки. Пустой список [] — только если пользователь прямо подтвердил, что никому',
      ),
    crossBorderTransfers: z
      .array(
        z.object({
          country: text('Код страны ISO 3166-1'),
          recipient: text('Получатель за рубежом'),
          purpose: text('Цель передачи'),
          legalBasis: text('Правовое основание передачи'),
          dataCategories: list('Передаваемые персональные данные'),
          subjectCategories: list('Чьи данные передаются'),
          assessmentDate: text('Дата оценки мер получателя по защите ПДн, ГГГГ-ММ-ДД'),
        }),
      )
      .optional()
      .describe(
        'Обязательно. Трансграничные передачи: зарубежные сервисы аналитики, почты, CDN, форм. Пустой список [] — только если пользователь прямо подтвердил, что их нет',
      ),
    consentTerm: text('Раздел consent: срок действия согласия'),
    publicData: z
      .object({
        purpose: text('Цель распространения'),
        dataCategories: list('Какие данные публикуются'),
        specialCategories: list('Специальные категории среди них (ст. 10), если публикуются'),
        biometricData: list('Биометрические данные среди них (ст. 11), если публикуются'),
        resources: list('Полные URL страниц, где данные публикуются'),
      })
      .optional()
      .describe('Раздел publicDistribution: что и где публикуется'),
    processingStartDate: text('Раздел rknNotification: дата начала обработки, ГГГГ-ММ-ДД'),
    processingEndCondition: text('Раздел rknNotification: срок или условие прекращения обработки'),
    cryptoTools: list('Раздел rknNotification: средства шифрования; [] — не используются'),
    protectionLevel: z
      .enum(PROTECTION_LEVELS)
      .optional()
      .describe(
        'Раздел rknNotification: уровень защищённости, который оператор определил по ПП № 1119; not-determined — если не определял. Не бери значение из примера',
      ),
    implementedMeasures: z
      .array(z.enum(IMPLEMENTED_MEASURES))
      .optional()
      .describe(
        'Раздел measures: меры, которые уже приняты на самом деле, по ответу пользователя (ч. 1 ст. 18.1); [] — ни одной',
      ),
    rknNotificationRef: z
      .object({ number: text('Регистрационный номер'), date: text('Дата, ГГГГ-ММ-ДД') })
      .optional()
      .describe('Раздел crossBorder: ранее поданное уведомление об обработке ПДн'),
    responsibleOrder: z
      .object({
        number: text('Номер приказа'),
        date: text('Дата приказа, ГГГГ-ММ-ДД'),
        signatory: z
          .object({
            fullName: text('ФИО лица, подписывающего приказ'),
            position: text('Должность (исполнительный орган организации)'),
          })
          .optional()
          .describe('Кто подписывает приказ'),
      })
      .optional()
      .describe(
        'Раздел responsibleOrder: реквизиты приказа о назначении ответственного (ответственного берём из responsiblePerson)',
      ),
    mediaRegister: z
      .array(
        z.object({
          purpose: text('Цель обработки (как в purposes[].title)'),
          dataCategories: list('Категории персональных данных на носителе'),
          medium: text('Какой носитель: папки, журнал, картотека…'),
          location: text('Место хранения: помещение, шкаф, сейф, архив'),
          accessPersons: list('Должности лиц, обрабатывающих данные или имеющих доступ'),
          safeguards: list('Меры сохранности и защиты от несанкционированного доступа'),
          responsible: text('Должность или ФИО ответственного за эти меры'),
        }),
      )
      .optional()
      .describe(
        'Раздел mediaRegister: бумажные и иные материальные носители, по одной записи на носитель одной цели. Всё называет пользователь: места, лиц и меры не придумывай',
      ),
    protectionAssessment: z
      .object({
        date: text('Дата определения уровня защищённости, ГГГГ-ММ-ДД'),
        systems: z.array(
          z.object({
            name: text('Название информационной системы: CRM, сайт, 1С…'),
            dataKind: z
              .enum(['special', 'biometric', 'public', 'other'])
              .describe(
                'Категория данных по п. 5 ПП № 1119: special, biometric, public или other; при смеси — самая строгая в этом порядке',
              ),
            employeesOnly: z
              .boolean()
              .describe('В системе обрабатываются данные только сотрудников оператора'),
            subjectsCount: z
              .number()
              .describe('Число субъектов, не являющихся сотрудниками оператора'),
            threatType: z
              .enum(['1', '2', '3'])
              .describe(
                'Тип актуальных угроз по п. 6 ПП № 1119; его определяет оператор по п. 7, не подставляй за него',
              ),
          }),
        ),
      })
      .optional()
      .describe(
        'Раздел protectionAssessment: информационные системы для акта определения уровня защищённости; уровень считает шаблон по таблице норм',
      ),
    accessList: z
      .object({
        number: text('Номер перечня (приказа)'),
        date: text('Дата утверждения, ГГГГ-ММ-ДД'),
        signatory: z.object({
          fullName: text('ФИО руководителя оператора, утверждающего перечень'),
          position: text('Должность руководителя'),
        }),
        entries: z.array(
          z.object({
            system: text('Информационная система'),
            position: text('Должность работника с доступом'),
            duties: text('Служебные обязанности, для которых нужен доступ'),
            dataCategories: list('Категории данных, к которым нужен доступ'),
          }),
        ),
      })
      .optional()
      .describe(
        'Раздел accessList: перечень лиц, допущенных к данным в информационных системах (пп. «в» п. 13 ПП № 1119). Должности и обязанности называет пользователь: не придумывай',
      ),
    harmAssessment: z
      .object({
        date: text('Дата издания акта оценки вреда, ГГГГ-ММ-ДД'),
        assessmentDate: text('Дата проведения оценки вреда, ГГГГ-ММ-ДД'),
        conductedBy: z
          .enum(['responsible-person', 'commission'])
          .describe(
            'Кто проводил оценку (п. 1 приказа № 178): ответственный за организацию обработки или комиссия оператора',
          ),
        assessors: z.array(
          z.object({
            fullName: text('ФИО лица, проводившего оценку'),
            position: text('Должность'),
          }),
        ),
        cases: z
          .array(z.enum(HARM_CASE_IDS))
          .describe(
            `Случаи пп. 2.1–2.3 п. 2 приказа № 178, которые есть у оператора, по ответам пользователя; [] — ни одного. Степень вреда считает шаблон, не называй её сам. Случаи: ${HARM_CASES.map((harmCase) => `${harmCase.id} — ${harmCase.text}`).join('; ')}`,
          ),
      })
      .optional()
      .describe(
        'Раздел harmAssessment: акт оценки вреда субъектам ПДн (приказ РКН № 178). Случаи и лиц называет пользователь: не придумывай',
      ),
    destructionAct: z
      .object({
        destructionDate: text('Дата уничтожения персональных данных, ГГГГ-ММ-ДД'),
        processors: z
          .array(z.object({ name: text('Наименование или ФИО'), address: text('Адрес') }))
          .optional()
          .describe(
            'Лица, обрабатывавшие эти данные по поручению оператора; не передавай, если обработка не поручалась (подтверди у пользователя)',
          ),
        subjects: list(
          'ФИО субъектов или иная информация, относящаяся к определённым лицам, чьи данные уничтожены',
        ),
        destroyers: z.array(
          z.object({
            fullName: text('ФИО лица, уничтожившего данные'),
            position: text('Должность'),
          }),
        ),
        dataCategories: list('Категории уничтоженных персональных данных'),
        media: z
          .array(
            z.object({
              name: text('Наименование уничтоженного материального носителя'),
              sheets: z.number().describe('Количество листов'),
            }),
          )
          .optional()
          .describe('Носители при обработке без средств автоматизации'),
        systems: list('Информационные системы, из которых уничтожены данные (с автоматизацией)'),
        method: text('Способ уничтожения'),
        reason: text('Причина уничтожения'),
      })
      .optional()
      .describe(
        'Раздел destructionAct: акт об уничтожении ПДн (приказ РКН № 179). Нужен хотя бы один носитель или одна система. Всё называет пользователь: не придумывай',
      ),
    destructionProcedure: z
      .object({
        number: text('Номер документа, которым утверждается порядок'),
        date: text('Дата утверждения, ГГГГ-ММ-ДД'),
        signatory: z.object({
          fullName: text('ФИО руководителя оператора'),
          position: text('Должность'),
        }),
        executors: list('Должности работников, которые уничтожают данные и подписывают акт'),
        methods: z.array(
          z.object({
            medium: text('Носитель или информационная система'),
            method: text('Способ уничтожения'),
          }),
        ),
      })
      .optional()
      .describe(
        'Раздел destructionProcedure: порядок уничтожения ПДн (ст. 21 Закона, приказ РКН № 179). Исполнителей и способы называет пользователь: не придумывай',
      ),
    processingAgreement: z
      .object({
        number: text('Номер договора поручения'),
        date: text('Дата договора, ГГГГ-ММ-ДД'),
        processor: z
          .object({
            name: text('Наименование лица, которому поручается обработка (как в thirdParties)'),
            address: text('Адрес'),
            country: text(
              'Код страны ISO 3166-1, где находится обработчик; не подставляй RU без подтверждения',
            ),
            signatory: z
              .object({ fullName: text('ФИО подписанта'), position: text('Должность') })
              .optional()
              .describe('Кто подписывает договор от имени обработчика'),
          })
          .optional()
          .describe('Лицо, которому поручается обработка (role processor)'),
        operatorSignatory: z
          .object({ fullName: text('ФИО подписанта'), position: text('Должность') })
          .optional()
          .describe('Кто подписывает договор от имени оператора'),
        purposes: list('Цели обработки по поручению — названия как в purposes[].title'),
        dataCategories: list('Перечень персональных данных, обработка которых поручается'),
        actions: list('Действия (операции), которые совершает обработчик'),
        incidentNotice: text(
          'Срок, в который обработчик уведомляет оператора об инциденте. Закон его не задаёт: называет пользователь; оператору нужно уведомить РКН в течение 24 часов',
        ),
        term: text('Срок действия поручения, если оператор его называет'),
        extraSecurityRequirements: list(
          'Дополнительные требования оператора к защите данных, если есть',
        ),
      })
      .optional()
      .describe(
        'Раздел processingAgreement: договор поручения обработки ПДн (ч. 3 ст. 6). Один договор — один обработчик. Цели, данные, действия и срок уведомления называет пользователь: не придумывай',
      ),
    processingRegulation: z
      .object({
        number: text('Номер приказа, которым утверждается положение'),
        date: text('Дата утверждения, ГГГГ-ММ-ДД'),
        signatory: z
          .object({
            fullName: text('ФИО руководителя оператора'),
            position: text('Должность'),
          })
          .optional()
          .describe('Кто утверждает положение'),
        dataKinds: z
          .array(
            z.object({
              purpose: text('Цель обработки — точно как в purposes[].title'),
              kinds: z
                .array(z.enum(SYSTEM_DATA_KINDS))
                .optional()
                .describe(
                  'Категории данных цели: special — специальные (ст. 10), biometric — биометрические (ст. 11), public — общедоступные (ст. 8), other — иные. Спроси у пользователя, не выбирай сам',
                ),
            }),
          )
          .optional()
          .describe('Категории персональных данных по каждой цели профиля'),
      })
      .optional()
      .describe(
        'Раздел processingRegulation: положение об обработке ПДн (п. 2 ч. 1 ст. 18.1). Цели и их сведения берутся из purposes; категории данных по целям называет пользователь',
      ),
    incident: z
      .object({
        discoveredAt: text('Дата и время выявления инцидента, например «2026-11-02 10:30»'),
        description: text('Что произошло и какие данные затронуты'),
        suspectedCauses: text('Предполагаемые причины инцидента'),
        suspectedHarm: text('Предполагаемый вред правам субъектов'),
        measuresTaken: list('Принятые меры по устранению последствий'),
        contact: z
          .object({
            fullName: text('ФИО лица, уполномоченного на взаимодействие с Роскомнадзором'),
            position: text('Должность'),
            phone: text('Телефон'),
            email: text('E-mail'),
          })
          .optional()
          .describe('Лицо, уполномоченное оператором на взаимодействие по этому инциденту'),
        investigationResults: text(
          'Результаты внутреннего расследования, только если они уже известны; иначе не передавай',
        ),
        responsiblePersons: list(
          'Лица, действия которых стали причиной инцидента, только если установлены',
        ),
      })
      .optional()
      .describe('Раздел incident: сведения об инциденте для уведомлений за 24 и 72 часа'),
  })
  .describe('Профиль оператора персональных данных');

/** Поля, обязательные для любого документа. */
const BASE_FIELDS = [
  'name',
  'inn',
  'legalAddress',
  'contactEmail',
  'responsiblePerson',
  'purposes',
  'databaseLocation',
  'thirdParties',
  'crossBorderTransfers',
];

const templateShape = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  normRefs: z.array(z.string()),
  requires: z.array(z.enum(PROFILE_SECTIONS)),
  requiredFields: z.array(z.string()),
});

const requiredFields = (template: TemplateInfo) => [
  ...new Set([
    ...BASE_FIELDS,
    ...template.requires.flatMap((section) => profileSectionFields(section)),
  ]),
];

function formatTemplates(templates: readonly TemplateInfo[]): string {
  const blocks = templates.map((template) =>
    [
      `### ${template.title} (\`${template.id}\`)`,
      template.description,
      `Обязательные поля профиля: ${requiredFields(template).join(', ')}.`,
      `Основание: ${template.normRefs.map(describeNormId).join('; ')}.`,
    ].join('\n'),
  );
  return [`Шаблонов документов: ${String(templates.length)}.`, ...blocks].join('\n\n');
}

const suggestedPath = (templateId: string) => `docs/152-fz/${templateId}.md`;

const DOCUMENT_START = '=== ТЕКСТ ДОКУМЕНТА ===';
const DOCUMENT_END = '=== КОНЕЦ ДОКУМЕНТА ===';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

/** Инструменты документов (T6.4): перечень шаблонов и заполнение шаблона по профилю оператора. */
export function registerDocumentTools(server: McpServer, documents: GenerateDocument): void {
  server.registerTool(
    'list_document_templates',
    {
      title: 'Шаблоны документов по 152-ФЗ',
      description:
        'Перечисляет шаблоны: политика обработки ПДн, согласия, сведения для уведомлений в РКН. ' +
        'Для каждого — назначение, нормы-основания и обязательные поля профиля оператора. ' +
        '/ Lists document templates with required operator-profile fields.',
      inputSchema: {},
      outputSchema: { templates: z.array(templateShape) },
      annotations: READ_ONLY,
    },
    () => {
      const templates = documents.list();
      return {
        content: [{ type: 'text' as const, text: formatTemplates(templates) }],
        structuredContent: {
          templates: templates.map((template) => ({
            ...template,
            requiredFields: requiredFields(template),
          })),
        },
      };
    },
  );

  server.registerTool(
    'render_document',
    {
      title: 'Заполнить документ по 152-ФЗ',
      description:
        'Заполняет шаблон данными оператора и возвращает Markdown документа, предупреждения и дисклеймер отдельно от него. Если профиль неполный, ' +
        'перечисляет все недостающие поля разом — спросите их у пользователя одним сообщением. ' +
        'Сервер ничего не сохраняет: файл в проект пишет клиент с согласия пользователя. ' +
        '/ Renders a template; lists all missing profile fields at once.',
      inputSchema: {
        templateId: z
          .string()
          .describe('Идентификатор из list_document_templates, например privacy-policy'),
        profile: profileShape,
      },
      outputSchema: {
        templateId: z.string(),
        title: z.string(),
        normRefs: z.array(z.string()),
        markdown: z.string(),
        disclaimer: z.string(),
        warnings: z.array(z.string()),
        suggestedPath: z.string(),
      },
      annotations: READ_ONLY,
    },
    ({ templateId, profile }) => {
      const result = documents.render(templateId, profile);
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: formatError(result.error) }],
        };
      }
      const path = suggestedPath(templateId);
      const warnings = result.value.warnings.map((warning) => `- ${warning}`).join('\n');
      const header = warnings
        ? `Предлагаемый путь: ${path}\n\nПредупреждения (покажи пользователю, в документ не вписывай):\n${warnings}`
        : `Предлагаемый путь: ${path}`;
      const text = [
        header,
        `${DOCUMENT_START}\n${result.value.markdown.trimEnd()}\n${DOCUMENT_END}`,
        `Дисклеймер для ответа пользователю, в файл не вписывай: ${result.value.disclaimer}`,
      ].join('\n\n');
      return {
        content: [{ type: 'text' as const, text }],
        structuredContent: { ...result.value, suggestedPath: path },
      };
    },
  );
}
