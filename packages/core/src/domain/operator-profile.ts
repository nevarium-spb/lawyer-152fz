import { z } from 'zod';

import { isValidInn, isValidOgrn } from './identifiers';

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
    resources: z
      .array(z.url({ error: 'Укажите адрес сайта или страницы, где данные публикуются' }), {
        error: 'Укажите сайты или страницы, где персональные данные будут опубликованы',
      })
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
