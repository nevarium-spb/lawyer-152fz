import { z } from 'zod';

import { HARM_CASE_IDS } from './harm-assessment';
import { isValidInn, isValidOgrn } from './identifiers';
import { SYSTEM_DATA_KINDS, THREAT_TYPES } from './protection-level';

const requiredText = (message: string) => z.string({ error: message }).trim().min(1, message);

const nonEmptyList = (message: string) =>
  z.array(requiredText(message), { error: message }).min(1, message);

const countryCode = z
  .string({ error: 'Укажите код страны' })
  .regex(/^[A-Z]{2}$/, 'Код страны — две заглавные латинские буквы по ISO 3166-1, например RU');

const isoDate = (message: string) => z.iso.date({ error: `${message} в формате ГГГГ-ММ-ДД` });

/** Способы обработки (ст. 22 ч. 3.1): с использованием средств автоматизации, без них или смешанная. */
export const PROCESSING_METHODS = ['automated', 'non-automated', 'mixed'] as const;
export type ProcessingMethod = (typeof PROCESSING_METHODS)[number];

/**
 * Уровень защищённости ПДн по ПП РФ № 1119 (п. 8–12). `not-determined` — оператор его ещё
 * не определял: честный ответ лучше значения, взятого из примера.
 */
export const PROTECTION_LEVELS = ['1', '2', '3', '4', 'not-determined'] as const;

/** Меры из ч. 1 ст. 18.1: в документ попадают только те, что оператор подтвердил как принятые. */
export const IMPLEMENTED_MEASURES = [
  'responsible-person',
  'policy-and-local-acts',
  'security-measures',
  'internal-control',
  'harm-assessment',
  'staff-training',
] as const;
export type ImplementedMeasure = (typeof IMPLEMENTED_MEASURES)[number];

/**
 * Цель обработки со всем, что закон требует указывать для каждой цели отдельно
 * (ст. 18.1 ч. 1 п. 2, ст. 22 ч. 3.1).
 */
const purposeSchema = z.object(
  {
    title: requiredText('Укажите цель обработки'),
    dataCategories: nonEmptyList('Укажите перечень персональных данных для этой цели'),
    subjectCategories: nonEmptyList('Укажите категории субъектов для этой цели'),
    legalBasis: requiredText(
      'Укажите правовое основание обработки — например, согласие субъекта (ст. 6 ч. 1 п. 1) или договор (п. 5)',
    ),
    actions: nonEmptyList('Укажите действия с персональными данными для этой цели'),
    methods: z.enum(PROCESSING_METHODS, {
      error: 'Укажите способ обработки: automated, non-automated или mixed',
    }),
    retention: requiredText('Укажите срок обработки и хранения для этой цели'),
  },
  { error: 'Опишите цель обработки' },
);

/**
 * Основание цели — согласие субъекта (п. 1 ч. 1 ст. 6). `legalBasis` — свободный текст, поэтому
 * сначала убираем оговорки вроде «без согласия», иначе цель по договору станет отзывной.
 */
export function isConsentBasis(legalBasis: string): boolean {
  const text = legalBasis
    .toLowerCase()
    .replace(/без\s+согласия/gu, '')
    .replace(/согласие\s+не\s+(?:требуется|нужно)/gu, '');
  return (
    /(?<!\p{L})согласи(?:е|я|ю|ем|и)(?!\p{L})/u.test(text) ||
    /п\.\s*1\s+ч\.\s*1\s+ст\.\s*6/u.test(text)
  );
}

const responsiblePersonSchema = z.object(
  {
    fullName: requiredText('Укажите ФИО ответственного за организацию обработки ПДн'),
    position: requiredText('Укажите должность ответственного за организацию обработки ПДн'),
    phone: requiredText('Укажите телефон ответственного за организацию обработки ПДн'),
    email: z.email({ error: 'Укажите e-mail ответственного за организацию обработки ПДн' }),
  },
  { error: 'Укажите ответственного за организацию обработки персональных данных' },
);

/** Обрабатывает данные по поручению оператора (ч. 3 ст. 6) или получает их и обрабатывает сам. */
export const THIRD_PARTY_ROLES = ['processor', 'recipient'] as const;

const thirdPartySchema = z.object({
  role: z.enum(THIRD_PARTY_ROLES, {
    error:
      'Укажите роль: processor — обрабатывает данные по поручению оператора (хостинг, рассылка; нужен договор по ч. 3 ст. 6), recipient — самостоятельный получатель, обрабатывает данные как отдельный оператор',
  }),
  name: requiredText('Укажите наименование третьего лица'),
  address: requiredText('Укажите адрес третьего лица'),
  purpose: requiredText('Укажите цель передачи третьему лицу'),
});

const crossBorderTransferSchema = z.object({
  country: countryCode.refine(
    (code) => code !== 'RU',
    'Передача внутри РФ не является трансграничной — уберите RU',
  ),
  recipient: requiredText('Укажите получателя за рубежом'),
  purpose: requiredText('Укажите цель трансграничной передачи'),
  legalBasis: requiredText('Укажите правовое основание трансграничной передачи'),
  dataCategories: nonEmptyList('Укажите перечень передаваемых персональных данных'),
  subjectCategories: nonEmptyList('Укажите категории субъектов, чьи данные передаются'),
  assessmentDate: isoDate('Укажите дату оценки мер получателя по защите ПДн (ст. 12 ч. 4 п. 7)'),
});

const databaseLocationSchema = z.object(
  {
    country: countryCode.refine(
      (code) => code === 'RU',
      'База за рубежом: шаблоны рассчитаны только на базы в РФ (ст. 18 ч. 5 152-ФЗ; исключения — пп. 2, 3, 4, 8 ч. 1 ст. 6). Укажите фактическое место и не заменяйте его на RU, чтобы пройти проверку: это не решается документом, сообщите пользователю',
    ),
    address: requiredText('Укажите адрес базы данных: город и центр обработки данных или хостинг'),
  },
  { error: 'Укажите место нахождения базы данных с персональными данными' },
);

const publicDataSchema = z.object(
  {
    purpose: requiredText('Укажите цель распространения персональных данных'),
    dataCategories: nonEmptyList(
      'Укажите, какие персональные данные субъект разрешает распространять',
    ),
    specialCategories: z.array(requiredText('Укажите специальную категорию данных')).optional(),
    biometricData: z.array(requiredText('Укажите биометрические данные')).optional(),
    // П. 4 Требований (приказ Роскомнадзора № 18): адрес ресурса с протоколом http или https.
    resources: z
      .array(
        z.url({
          protocol: /^https?$/,
          error:
            'Укажите полный адрес сайта или страницы, где данные публикуются, с протоколом http или https, например https://example.ru/reviews (п. 4 Требований, утв. приказом Роскомнадзора № 18)',
        }),
        {
          error: 'Укажите сайты или страницы, где персональные данные будут опубликованы',
        },
      )
      .min(1, 'Укажите сайты или страницы, где персональные данные будут опубликованы'),
  },
  { error: 'Опишите, какие персональные данные распространяются и где' },
);

const rknNotificationRefSchema = z.object(
  {
    number: requiredText('Укажите регистрационный номер уведомления об обработке ПДн'),
    date: isoDate('Укажите дату уведомления об обработке ПДн'),
  },
  {
    error:
      'Укажите номер и дату ранее поданного уведомления об обработке ПДн (ст. 12 ч. 4 п. 1) — сначала подаётся оно',
  },
);

/**
 * Инцидент с персональными данными (ч. 3.1 ст. 21): сведения для уведомлений в Роскомнадзор
 * в течение 24 и 72 часов. Описание инцидента даёт только пользователь — модель его не придумывает.
 */
const incidentSchema = z.object(
  {
    discoveredAt: requiredText(
      'Укажите дату и время выявления инцидента: с этого момента идут 24 и 72 часа',
    ),
    description: requiredText(
      'Опишите инцидент: какая неправомерная или случайная передача (предоставление, распространение, доступ) персональных данных произошла и какие данные затронуты',
    ),
    suspectedCauses: requiredText('Укажите предполагаемые причины инцидента'),
    suspectedHarm: requiredText('Укажите предполагаемый вред, нанесённый правам субъектов'),
    measuresTaken: nonEmptyList('Перечислите принятые меры по устранению последствий инцидента'),
    contact: z.object(
      {
        fullName: requiredText(
          'Укажите ФИО лица, уполномоченного оператором на взаимодействие с Роскомнадзором по этому инциденту',
        ),
        position: requiredText('Укажите должность уполномоченного лица'),
        phone: requiredText('Укажите телефон уполномоченного лица'),
        email: z.email({ error: 'Укажите e-mail уполномоченного лица' }),
      },
      { error: 'Укажите лицо, уполномоченное на взаимодействие с Роскомнадзором по инциденту' },
    ),
    // Сведения для уведомления в течение 72 часов: до окончания расследования их может не быть.
    investigationResults: requiredText('Укажите результаты внутреннего расследования').optional(),
    responsiblePersons: z
      .array(requiredText('Укажите лицо, действия которого стали причиной инцидента'))
      .optional(),
  },
  { error: 'Опишите инцидент с персональными данными' },
);

/**
 * Приказ о назначении ответственного за организацию обработки ПДн (ч. 1 ст. 22.1, п. 1 ч. 1 ст. 18.1).
 * Ответственного берём из общих сведений профиля; здесь только то, что нужно приказу как документу.
 */
const responsibleOrderSchema = z.object(
  {
    number: requiredText('Укажите номер приказа'),
    date: isoDate('Укажите дату приказа'),
    signatory: z.object(
      {
        fullName: requiredText('Укажите ФИО лица, подписывающего приказ'),
        position: requiredText(
          'Укажите должность лица, подписывающего приказ (исполнительный орган организации)',
        ),
      },
      { error: 'Укажите, кто подписывает приказ: руководитель — исполнительный орган организации' },
    ),
  },
  { error: 'Укажите номер, дату приказа и кто его подписывает' },
);

/**
 * Реестр мест хранения материальных носителей (пп. 13–15 Положения, ПП РФ № 687): одна запись —
 * один носитель одной цели. Места, лиц и меры называет только пользователь: оператор «устанавливает»
 * их сам (п. 15), закон их не задаёт.
 */
const mediaRegisterEntrySchema = z.object(
  {
    purpose: requiredText(
      'Укажите цель обработки, для которой хранится носитель: носители разных целей хранятся раздельно (п. 14)',
    ),
    dataCategories: nonEmptyList(
      'Укажите категории персональных данных, которые содержит носитель (п. 13)',
    ),
    medium: requiredText(
      'Опишите материальный носитель, например «личные дела работников в папках» или «журнал посетителей»',
    ),
    location: requiredText(
      'Укажите место хранения носителя: помещение и шкаф, сейф или архив (п. 13)',
    ),
    accessPersons: nonEmptyList(
      'Перечислите должности лиц, осуществляющих обработку либо имеющих доступ к носителю (п. 13)',
    ),
    safeguards: nonEmptyList(
      'Перечислите меры, обеспечивающие сохранность носителя и исключающие несанкционированный доступ, например запираемый шкаф или охраняемое помещение (п. 15)',
    ),
    responsible: requiredText(
      'Укажите должность или ФИО лица, ответственного за реализацию этих мер (п. 15)',
    ),
  },
  { error: 'Опишите материальный носитель персональных данных' },
);

/**
 * Определение уровня защищённости ПДн в информационных системах (пп. 5–12 ПП РФ № 1119). Тип угроз
 * оператор определяет сам (п. 7): актов ФСТЭК/ФСБ в базе нет, поэтому его называет пользователь,
 * а уровень считает код по таблице норм.
 */
const protectionSystemSchema = z.object(
  {
    name: requiredText('Укажите название информационной системы, например «CRM» или «сайт»'),
    dataKind: z.enum(SYSTEM_DATA_KINDS, {
      error:
        'Укажите категорию данных системы по п. 5: special (здоровье, расовая и национальная принадлежность, взгляды и убеждения, интимная жизнь), biometric, public (только из общедоступных источников) или other. Если обрабатываются разные, берите самую строгую в этом порядке',
    }),
    employeesOnly: z.boolean({
      error: 'Укажите, обрабатываются ли в системе данные только сотрудников оператора (п. 5)',
    }),
    subjectsCount: z
      .number({ error: 'Укажите число субъектов, не являющихся сотрудниками оператора' })
      .int('Число субъектов — целое число')
      .nonnegative('Число субъектов не может быть отрицательным'),
    threatType: z.enum(THREAT_TYPES, {
      error:
        'Укажите тип актуальных угроз по п. 6: 1, 2 или 3. Его определяет оператор по п. 7; не подставляйте значение из примера',
    }),
  },
  { error: 'Опишите информационную систему персональных данных' },
);

/**
 * Перечень лиц, доступ которых к ПДн в информационной системе необходим для служебных обязанностей
 * (пп. «в» п. 13 ПП РФ № 1119): утверждает руководитель оператора. Должности и обязанности называет
 * только пользователь.
 */
const accessListSchema = z.object(
  {
    number: requiredText('Укажите номер перечня (приказа), которым он утверждается'),
    date: isoDate('Укажите дату утверждения перечня'),
    signatory: z.object(
      {
        fullName: requiredText('Укажите ФИО руководителя оператора, утверждающего перечень'),
        position: requiredText('Укажите должность руководителя оператора'),
      },
      { error: 'Укажите, кто утверждает перечень: руководитель оператора' },
    ),
    entries: z
      .array(
        z.object(
          {
            system: requiredText('Укажите информационную систему, к данным которой нужен доступ'),
            position: requiredText('Укажите должность работника, которому нужен доступ'),
            duties: requiredText(
              'Укажите служебные (трудовые) обязанности, для которых нужен доступ к данным',
            ),
            dataCategories: nonEmptyList('Укажите категории данных, к которым нужен доступ'),
          },
          { error: 'Опишите, кому и зачем нужен доступ к данным информационной системы' },
        ),
        { error: 'Опишите, кому и зачем нужен доступ к данным' },
      )
      .min(1, 'Укажите хотя бы одну должность с доступом к данным'),
  },
  { error: 'Опишите перечень лиц, допущенных к персональным данным' },
);

/** Работник, который подписывает документ или выполняет действие: ФИО и должность. */
const staffMemberSchema = (who: string) =>
  z.object(
    {
      fullName: requiredText(`Укажите ФИО: ${who}`),
      position: requiredText(`Укажите должность: ${who}`),
    },
    { error: `Укажите ФИО и должность: ${who}` },
  );

/**
 * Акт оценки вреда субъектам ПДн (пп. 1–6 Требований, приказ Роскомнадзора № 178). Какие случаи
 * из пп. 2.1–2.3 имеют место у оператора, называет только пользователь; степень вреда считает код.
 */
const harmAssessmentSchema = z.object(
  {
    date: isoDate('Укажите дату издания акта оценки вреда (п. 4 «б»)'),
    assessmentDate: isoDate('Укажите дату проведения оценки вреда (п. 4 «в»)'),
    conductedBy: z.enum(['responsible-person', 'commission'], {
      error:
        'Укажите, кто проводил оценку (п. 1): responsible-person — ответственный за организацию обработки ПДн, commission — комиссия, образованная оператором',
    }),
    assessors: z
      .array(staffMemberSchema('проводившего оценку вреда (п. 4 «г»)'), {
        error: 'Укажите лиц, проводивших оценку вреда',
      })
      .min(1, 'Укажите хотя бы одно лицо, проводившее оценку вреда (п. 4 «г»)'),
    cases: z.array(z.enum(HARM_CASE_IDS), {
      error:
        'Укажите случаи из пп. 2.1–2.3 п. 2 Требований, которые есть у оператора, по ответам пользователя; [] — если ни один не подходит. Не отмечайте случай, которого пользователь не подтвердил: от него зависит степень вреда',
    }),
  },
  { error: 'Опишите оценку вреда: даты, лиц, проводивших оценку, и случаи по пп. 2.1–2.3' },
);

/**
 * Акт об уничтожении ПДн (пп. 1–8 Требований, приказ Роскомнадзора № 179). Субъектов, носители,
 * системы, способ и причину называет только пользователь — шаблон их не придумывает.
 */
const destructionActSchema = z
  .object(
    {
      destructionDate: isoDate('Укажите дату уничтожения персональных данных (п. 3 «к»)'),
      processors: z
        .array(
          z.object({
            name: requiredText(
              'Укажите наименование или ФИО лица, обрабатывавшего данные по поручению (п. 3 «б»)',
            ),
            address: requiredText('Укажите адрес этого лица (п. 3 «б»)'),
          }),
        )
        .optional(),
      subjects: nonEmptyList(
        'Укажите ФИО субъектов или иную информацию, относящуюся к определённым лицам, чьи данные уничтожены (п. 3 «в»)',
      ),
      destroyers: z
        .array(staffMemberSchema('лица, уничтожившего персональные данные (п. 3 «г»)'), {
          error: 'Укажите лиц, уничтоживших персональные данные',
        })
        .min(1, 'Укажите хотя бы одно лицо, уничтожившее данные (п. 3 «г»)'),
      dataCategories: nonEmptyList('Укажите категории уничтоженных персональных данных (п. 3 «д»)'),
      media: z
        .array(
          z.object({
            name: requiredText('Укажите наименование уничтоженного материального носителя'),
            sheets: z
              .number({ error: 'Укажите количество листов носителя' })
              .int('Количество листов — целое число')
              .positive('Количество листов должно быть больше нуля'),
          }),
        )
        .optional(),
      systems: z.array(requiredText('Укажите наименование информационной системы')).optional(),
      method: requiredText('Укажите способ уничтожения персональных данных (п. 3 «з»)'),
      reason: requiredText('Укажите причину уничтожения персональных данных (п. 3 «и»)'),
    },
    { error: 'Опишите уничтожение персональных данных' },
  )
  .refine(
    (act) => (act.media?.length ?? 0) + (act.systems?.length ?? 0) > 0,
    'Укажите, что уничтожено: носители с числом листов (обработка без средств автоматизации, п. 3 «е») и (или) информационные системы (обработка с их использованием, п. 3 «ж»)',
  );

/**
 * Порядок уничтожения ПДн — локальный акт оператора. Сроки и состав подтверждающих документов
 * берутся из ст. 21 Закона и приказа № 179; способы уничтожения и исполнителей называет оператор.
 */
const destructionProcedureSchema = z.object(
  {
    number: requiredText('Укажите номер документа, которым утверждается порядок'),
    date: isoDate('Укажите дату утверждения порядка'),
    signatory: staffMemberSchema('руководителя оператора, утверждающего порядок'),
    executors: nonEmptyList(
      'Укажите должности работников, которые уничтожают персональные данные и подписывают акт',
    ),
    methods: z
      .array(
        z.object(
          {
            medium: requiredText(
              'Укажите, что уничтожается: вид материального носителя или информационная система',
            ),
            method: requiredText(
              'Укажите способ уничтожения, например измельчение, сжигание, удаление средствами системы с последующей перезаписью',
            ),
          },
          { error: 'Опишите способ уничтожения для носителя или системы' },
        ),
        { error: 'Опишите способы уничтожения' },
      )
      .min(1, 'Опишите хотя бы один способ уничтожения'),
  },
  { error: 'Опишите порядок уничтожения персональных данных' },
);

/**
 * Договор поручения обработки ПДн (ч. 3 ст. 6): один документ — одно лицо, которому поручается
 * обработка. Цели, перечень данных, действия и срок уведомления об инциденте называет только
 * пользователь; обязательные условия поручения шаблон берёт из ч. 3 ст. 6.
 */
const processingAgreementSchema = z.object(
  {
    number: requiredText('Укажите номер договора поручения'),
    date: isoDate('Укажите дату договора поручения'),
    processor: z.object(
      {
        name: requiredText(
          'Укажите наименование или ФИО лица, которому поручается обработка (ч. 3 ст. 6)',
        ),
        address: requiredText('Укажите адрес лица, которому поручается обработка'),
        country: countryCode,
        signatory: staffMemberSchema('лица, подписывающего договор со стороны обработчика'),
      },
      { error: 'Опишите лицо, которому поручается обработка персональных данных' },
    ),
    operatorSignatory: staffMemberSchema('лица, подписывающего договор со стороны оператора'),
    purposes: nonEmptyList('Укажите цели обработки, которые поручаются (ч. 3 ст. 6)'),
    dataCategories: nonEmptyList(
      'Укажите перечень персональных данных, обработка которых поручается (ч. 3 ст. 6)',
    ),
    actions: nonEmptyList(
      'Укажите перечень действий (операций) с персональными данными, которые совершает обработчик (ч. 3 ст. 6)',
    ),
    incidentNotice: requiredText(
      'Укажите, в какой срок обработчик уведомляет оператора об инциденте по ч. 3.1 ст. 21, например «в течение 4 часов с момента выявления». Закон этот срок не устанавливает; оператор сам уведомляет Роскомнадзор в течение 24 часов',
    ),
    term: requiredText('Укажите срок действия поручения').optional(),
    extraSecurityRequirements: z
      .array(requiredText('Укажите дополнительное требование к защите данных'))
      .optional(),
  },
  { error: 'Опишите поручение обработки персональных данных' },
);

/**
 * Положение об обработке ПДн (п. 2 ч. 1 ст. 18.1): для каждой цели — категории и перечень данных,
 * категории субъектов, способы, сроки и порядок уничтожения. Цели берутся из профиля; категории
 * данных по каждой цели (специальные, биометрические, общедоступные, иные) называет пользователь.
 */
const processingRegulationSchema = z.object(
  {
    number: requiredText('Укажите номер приказа, которым утверждается положение'),
    date: isoDate('Укажите дату утверждения положения'),
    signatory: staffMemberSchema('руководителя оператора, утверждающего положение'),
    dataKinds: z
      .array(
        z.object(
          {
            purpose: requiredText('Укажите цель обработки — как в purposes[].title'),
            kinds: z
              .array(z.enum(SYSTEM_DATA_KINDS), {
                error:
                  'Укажите категории данных для цели: special — специальные (ст. 10), biometric — биометрические (ст. 11), public — общедоступные (ст. 8), other — иные',
              })
              .min(1, 'Укажите хотя бы одну категорию данных для цели'),
          },
          { error: 'Укажите цель и категории персональных данных для неё' },
        ),
        { error: 'Укажите категории персональных данных по каждой цели обработки' },
      )
      .min(1, 'Укажите категории персональных данных хотя бы для одной цели'),
  },
  { error: 'Опишите утверждение положения и категории данных по целям' },
);

/**
 * Правила внутреннего контроля (п. 2 и п. 4 ч. 1 ст. 18.1, п. 1 ч. 4 ст. 22.1, п. 17 ПП РФ № 1119).
 * Периодичность плановых проверок и участников называет оператор; контроль требований ПП № 1119 —
 * не реже 1 раза в 3 года (п. 17), поэтому срок в месяцах ограничен 36.
 */
const internalControlRulesSchema = z.object(
  {
    number: requiredText('Укажите номер приказа, которым утверждаются правила'),
    date: isoDate('Укажите дату утверждения правил'),
    signatory: staffMemberSchema('руководителя оператора, утверждающего правила'),
    schedule: requiredText(
      'Укажите периодичность плановых проверок внутреннего контроля, например «ежегодно, в декабре». Закон её не задаёт: её определяет оператор',
    ),
    securityControlMonths: z
      .number({ error: 'Укажите, раз в сколько месяцев проводится контроль требований ПП № 1119' })
      .int('Срок — целое число месяцев')
      .min(1, 'Срок — не меньше одного месяца')
      .max(
        36,
        'Контроль выполнения требований ПП № 1119 проводится не реже 1 раза в 3 года (п. 17): не больше 36 месяцев',
      )
      .optional(),
    inspectors: z.array(staffMemberSchema('участника проверок')).optional(),
    unscheduledTriggers: z.array(requiredText('Укажите основание внеплановой проверки')).optional(),
  },
  { error: 'Опишите утверждение правил и периодичность проверок' },
);

/**
 * Приказ о назначении ответственного за безопасность ПДн в информационной системе (п. 14 ПП РФ № 1119).
 * Системы и ответственных называет оператор; уровень защищённости код берёт из акта или профиля.
 */
const securityOfficerOrderSchema = z.object(
  {
    number: requiredText('Укажите номер приказа'),
    date: isoDate('Укажите дату приказа'),
    signatory: staffMemberSchema('руководителя оператора, подписывающего приказ'),
    systems: z
      .array(
        z.object(
          {
            name: requiredText('Укажите информационную систему персональных данных'),
            officer: staffMemberSchema('ответственного за безопасность данных в этой системе'),
          },
          { error: 'Укажите систему и ответственного за безопасность данных в ней' },
        ),
        { error: 'Перечислите информационные системы и ответственных за безопасность в них' },
      )
      .min(1, 'Укажите хотя бы одну информационную систему и ответственного'),
  },
  { error: 'Опишите приказ: номер, дату, подписанта, системы и ответственных' },
);

/**
 * Лист ознакомления (п. 6 ч. 1 ст. 18.1; при обработке без средств автоматизации — п. 6 ПП РФ № 687).
 * Локальные акты называет оператор; без работников лист выходит с пустыми строками.
 */
const acknowledgmentSheetSchema = z.object(
  {
    documents: nonEmptyList(
      'Перечислите локальные акты, с которыми знакомятся работники, например «Положение об обработке персональных данных»',
    ),
    employees: z.array(staffMemberSchema('работника, который знакомится с документами')).optional(),
  },
  { error: 'Перечислите документы, с которыми знакомятся работники' },
);

/**
 * Акт о ведении журнала пропуска (п. 8 «а» ПП РФ № 687): все сведения акта называет оператор —
 * норма перечисляет их, но не заполняет.
 */
const visitorLogSchema = z.object(
  {
    number: requiredText('Укажите номер акта (приказа)'),
    date: isoDate('Укажите дату акта'),
    signatory: staffMemberSchema('руководителя оператора, утверждающего акт'),
    purpose: requiredText(
      'Укажите цель ведения журнала, например «однократный пропуск посетителей в офис»',
    ),
    recordingMethod: requiredText(
      'Укажите способ фиксации сведений, например «запись от руки в бумажном журнале на посту охраны»',
    ),
    dataComposition: nonEmptyList(
      'Перечислите сведения, которые запрашиваются у посетителя, например «фамилия, имя, отчество»',
    ),
    accessPersons: nonEmptyList(
      'Перечислите лиц (поимённо или по должностям), имеющих доступ к журналу',
    ),
    keepers: nonEmptyList(
      'Перечислите лиц (поимённо или по должностям), ответственных за ведение и сохранность журнала',
    ),
    retention: requiredText('Укажите сроки обработки персональных данных в журнале'),
    unverifiedEntry: requiredText(
      'Опишите порядок пропуска без подтверждения подлинности сведений, которые сообщил посетитель',
    ),
  },
  { error: 'Опишите журнал пропуска: все сведения из п. 8 «а» ПП РФ № 687' },
);

/** Сведения, которые нужны не каждому документу, — шаблон перечисляет нужные в `requires`. */
const sectionShapes = {
  /** Согласие на обработку (ст. 9 ч. 4 п. 8). */
  consent: {
    consentTerm: requiredText('Укажите срок действия согласия, например «5 лет» или «до отзыва»'),
  },
  /** Согласие на обработку (ст. 9): в него входят только цели с основанием «согласие». */
  processingConsent: {
    purposes: z
      .array(purposeSchema, { error: 'Укажите хотя бы одну цель обработки' })
      .min(1, 'Укажите хотя бы одну цель обработки')
      .refine(
        (purposes) => purposes.some((purpose) => isConsentBasis(purpose.legalBasis)),
        'Ни у одной цели основание не согласие субъекта (п. 1 ч. 1 ст. 6): для целей по договору или закону согласие не оформляется. Если обработка действительно ведётся по согласию, укажите это в legalBasis цели',
      ),
  },
  /** Согласие на распространение (ст. 10.1). */
  publicDistribution: {
    publicData: publicDataSchema,
  },
  /** Уведомление об обработке в РКН (ст. 22 ч. 3). */
  rknNotification: {
    processingStartDate: isoDate('Укажите дату начала обработки персональных данных'),
    processingEndCondition: requiredText(
      'Укажите срок или условие прекращения обработки, например «ликвидация организации»',
    ),
    cryptoTools: z.array(requiredText('Укажите наименование средства шифрования'), {
      error: 'Перечислите средства криптографической защиты; пустой список — если не используются',
    }),
    protectionLevel: z.enum(PROTECTION_LEVELS, {
      error:
        'Укажите уровень защищённости ПДн, который оператор определил по ПП РФ № 1119: 1, 2, 3 или 4; если не определял — not-determined. Значение из примера не подставляйте',
    }),
  },
  /** Меры, которые политика и уведомление РКН называют принятыми (ст. 18.1, ст. 19). */
  measures: {
    implementedMeasures: z.array(z.enum(IMPLEMENTED_MEASURES), {
      error:
        'Спросите у пользователя, какие меры уже приняты: ответственный (responsible-person), политика и локальные акты (policy-and-local-acts), меры безопасности по ст. 19 (security-measures), внутренний контроль (internal-control), оценка вреда (harm-assessment), ознакомление работников (staff-training). Документ назовёт их принятыми, поэтому указывайте только то, что есть на самом деле; [] — если ничего',
    }),
  },
  /** Приказ о назначении ответственного (ч. 1 ст. 22.1). */
  responsibleOrder: {
    responsibleOrder: responsibleOrderSchema,
  },
  /** Реестр мест хранения материальных носителей (пп. 13–15 ПП РФ № 687). */
  mediaRegister: {
    mediaRegister: z
      .array(mediaRegisterEntrySchema, {
        error: 'Опишите материальные носители персональных данных и места их хранения',
      })
      .min(1, 'Опишите хотя бы один материальный носитель персональных данных'),
  },
  /** Определение уровня защищённости ПДн в информационных системах (пп. 5–12 ПП РФ № 1119). */
  protectionAssessment: {
    protectionAssessment: z.object(
      {
        date: isoDate('Укажите дату определения уровня защищённости'),
        systems: z
          .array(protectionSystemSchema, { error: 'Опишите информационные системы' })
          .min(1, 'Опишите хотя бы одну информационную систему персональных данных'),
      },
      { error: 'Опишите информационные системы и дату определения уровня защищённости' },
    ),
  },
  /** Перечень лиц, допущенных к ПДн в информационных системах (пп. «в» п. 13 ПП РФ № 1119). */
  accessList: {
    accessList: accessListSchema,
  },
  /** Акт оценки вреда субъектам ПДн (приказ Роскомнадзора № 178). */
  harmAssessment: {
    harmAssessment: harmAssessmentSchema,
  },
  /** Акт об уничтожении ПДн (приказ Роскомнадзора № 179). */
  destructionAct: {
    destructionAct: destructionActSchema,
  },
  /** Порядок уничтожения ПДн (ст. 21 Закона, приказ Роскомнадзора № 179). */
  destructionProcedure: {
    destructionProcedure: destructionProcedureSchema,
  },
  /** Договор поручения обработки ПДн (ч. 3 ст. 6). */
  processingAgreement: {
    processingAgreement: processingAgreementSchema,
  },
  /** Положение об обработке ПДн (п. 2 ч. 1 ст. 18.1). */
  processingRegulation: {
    processingRegulation: processingRegulationSchema,
  },
  /** Правила внутреннего контроля (п. 2 и п. 4 ч. 1 ст. 18.1, п. 17 ПП РФ № 1119). */
  internalControlRules: {
    internalControlRules: internalControlRulesSchema,
  },
  /** Приказ об ответственном за безопасность ПДн в информационной системе (п. 14 ПП РФ № 1119). */
  securityOfficerOrder: {
    securityOfficerOrder: securityOfficerOrderSchema,
  },
  /** Лист ознакомления работников (п. 6 ч. 1 ст. 18.1, п. 6 ПП РФ № 687). */
  acknowledgmentSheet: {
    acknowledgmentSheet: acknowledgmentSheetSchema,
  },
  /** Акт о ведении журнала пропуска (п. 8 ПП РФ № 687). */
  visitorLog: {
    visitorLog: visitorLogSchema,
  },
  /** Уведомления об инциденте в Роскомнадзор (ч. 3.1 ст. 21). */
  incident: {
    incident: incidentSchema,
  },
  /** Уведомление о трансграничной передаче (ст. 12 ч. 4). */
  crossBorder: {
    crossBorderTransfers: z
      .array(crossBorderTransferSchema, { error: 'Опишите трансграничные передачи' })
      .min(1, 'Для уведомления о трансграничной передаче опишите хотя бы одну передачу'),
    rknNotificationRef: rknNotificationRefSchema,
  },
} satisfies Record<string, z.ZodRawShape>;

export type ProfileSection = keyof typeof sectionShapes;
export const PROFILE_SECTIONS = Object.keys(sectionShapes) as readonly ProfileSection[];

/** Поля профиля, которые относятся к разделу, — например, чтобы убрать их из эталона. */
export function profileSectionFields(section: ProfileSection): readonly string[] {
  return Object.keys(sectionShapes[section]);
}

/**
 * Профиль оператора персональных данных — вход для генерации документов.
 * Общие сведения обязательны всегда; сведения разделов обязательны, только если шаблон
 * их требует (`operatorProfileSchemaFor`). Все недостающие поля сообщаются за один разбор,
 * чтобы модель дозапросила их у пользователя разом.
 */
export const operatorProfileSchema = z.object({
  name: requiredText('Укажите наименование оператора (для ИП — ФИО)'),
  inn: z
    .string({ error: 'Укажите ИНН' })
    .refine(isValidInn, 'ИНН некорректен: 10 или 12 цифр с верной контрольной суммой'),
  ogrn: z
    .string()
    .refine(isValidOgrn, 'ОГРН/ОГРНИП некорректен: 13 или 15 цифр с верной контрольной суммой')
    .optional(),
  legalAddress: requiredText('Укажите адрес оператора'),
  contactEmail: z.email({ error: 'Укажите e-mail для обращений субъектов персональных данных' }),
  website: z.url({ error: 'Адрес сайта — полный URL, например https://example.ru' }).optional(),
  responsiblePerson: responsiblePersonSchema,
  purposes: z
    .array(purposeSchema, { error: 'Укажите хотя бы одну цель обработки' })
    .min(1, 'Укажите хотя бы одну цель обработки'),
  databaseLocation: databaseLocationSchema,
  // Без значения по умолчанию: пустой список — это утверждение «никому не передаём»,
  // оно попадает в политику и уведомление РКН, поэтому его должен подтвердить пользователь.
  thirdParties: z.array(thirdPartySchema, {
    error:
      'Укажите, кому передаются данные или поручается обработка (хостинг, почта, аналитика, CRM, платежи, рассылки…); если никому — подтвердите это у пользователя и передайте пустой список []',
  }),
  crossBorderTransfers: z.array(crossBorderTransferSchema, {
    error:
      'Укажите трансграничные передачи (зарубежные сервисы аналитики, почты, CDN, форм…); если их нет — подтвердите это у пользователя и передайте пустой список []',
  }),

  consentTerm: sectionShapes.consent.consentTerm.optional(),
  publicData: publicDataSchema.optional(),
  processingStartDate: sectionShapes.rknNotification.processingStartDate.optional(),
  processingEndCondition: sectionShapes.rknNotification.processingEndCondition.optional(),
  cryptoTools: sectionShapes.rknNotification.cryptoTools.optional(),
  protectionLevel: sectionShapes.rknNotification.protectionLevel.optional(),
  implementedMeasures: sectionShapes.measures.implementedMeasures.optional(),
  rknNotificationRef: rknNotificationRefSchema.optional(),
  incident: incidentSchema.optional(),
  responsibleOrder: responsibleOrderSchema.optional(),
  mediaRegister: sectionShapes.mediaRegister.mediaRegister.optional(),
  protectionAssessment: sectionShapes.protectionAssessment.protectionAssessment.optional(),
  accessList: accessListSchema.optional(),
  harmAssessment: harmAssessmentSchema.optional(),
  destructionAct: destructionActSchema.optional(),
  destructionProcedure: destructionProcedureSchema.optional(),
  processingAgreement: processingAgreementSchema.optional(),
  processingRegulation: processingRegulationSchema.optional(),
  internalControlRules: internalControlRulesSchema.optional(),
  securityOfficerOrder: securityOfficerOrderSchema.optional(),
  acknowledgmentSheet: acknowledgmentSheetSchema.optional(),
  visitorLog: visitorLogSchema.optional(),
});

export type OperatorProfile = z.output<typeof operatorProfileSchema>;
export type OperatorProfileInput = z.input<typeof operatorProfileSchema>;
export type ProcessingPurpose = OperatorProfile['purposes'][number];

/** Схема профиля, в которой обязательны и сведения перечисленных разделов. */
export function operatorProfileSchemaFor(
  sections: readonly ProfileSection[],
): z.ZodType<OperatorProfile, OperatorProfileInput> {
  let shape: z.ZodRawShape = {};
  for (const section of sections) shape = { ...shape, ...sectionShapes[section] };
  // Поля разделов сужают необязательные поля профиля до обязательных — тип результата прежний.
  return operatorProfileSchema.extend(shape) as unknown as z.ZodType<
    OperatorProfile,
    OperatorProfileInput
  >;
}
