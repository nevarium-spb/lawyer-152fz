import type { OperatorProfileInput } from '@lawyer-152fz/core';

/**
 * Эталонные профили: на них шаблоны проверяются при загрузке и рендерятся в golden-тестах.
 * Реквизиты синтетические — валидные по контрольной сумме, но вымышленные.
 */

/** Инцидент для шаблона уведомлений ч. 3.1 ст. 21: отдельной константой, чтобы тесты могли его менять. */
export const REFERENCE_INCIDENT = {
  discoveredAt: '2026-11-02 10:30',
  description:
    'неправомерный доступ третьего лица к базе заявок сайта: затронуты фамилия, имя, номер телефона и адрес электронной почты посетителей',
  suspectedCauses: 'ошибка в настройке прав доступа к резервной копии базы',
  suspectedHarm: 'возможное получение посторонними лицами контактных данных посетителей сайта',
  measuresTaken: ['доступ к резервной копии закрыт', 'изменены ключи доступа к хранилищу'],
  contact: {
    fullName: 'Петрова Анна Сергеевна',
    position: 'руководитель юридического отдела',
    phone: '+7 812 000-00-01',
    email: 'dpo@romashka.example',
  },
  investigationResults:
    'причиной стало открытое хранилище резервных копий; доступ к нему получили неустановленные лица',
  responsiblePersons: ['системный администратор, настроивший хранилище'],
} satisfies NonNullable<OperatorProfileInput['incident']>;

/** Заполнено всё, включая необязательное и все разделы: проходятся все секции шаблонов. */
export const FULL_REFERENCE_PROFILE: OperatorProfileInput = {
  name: 'ООО «Ромашка»',
  inn: '7707083893',
  ogrn: '1027700132195',
  legalAddress: '190000, г. Санкт-Петербург, Невский пр., д. 1, лит. А, пом. 1-Н',
  contactEmail: 'privacy@romashka.example',
  website: 'https://romashka.example',
  responsiblePerson: {
    fullName: 'Петрова Анна Сергеевна',
    position: 'руководитель юридического отдела',
    phone: '+7 812 000-00-01',
    email: 'dpo@romashka.example',
  },
  purposes: [
    {
      title: 'Обработка заявок и обращений, поступивших через сайт',
      dataCategories: ['фамилия, имя', 'номер телефона', 'адрес электронной почты'],
      subjectCategories: ['посетители сайта, направившие заявку или обращение'],
      legalBasis: 'согласие субъекта персональных данных (п. 1 ч. 1 ст. 6 152-ФЗ)',
      actions: [
        'сбор',
        'запись',
        'систематизация',
        'хранение',
        'использование',
        'удаление',
        'уничтожение',
      ],
      methods: 'automated',
      retention: '1 год с даты получения заявки или до отзыва согласия',
    },
    {
      title: 'Заключение и исполнение договоров с клиентами',
      dataCategories: [
        'фамилия, имя, отчество',
        'номер телефона',
        'адрес электронной почты',
        'адрес доставки',
      ],
      subjectCategories: ['клиенты — физические лица', 'представители клиентов — юридических лиц'],
      legalBasis:
        'исполнение договора, стороной которого является субъект (п. 5 ч. 1 ст. 6 152-ФЗ)',
      actions: [
        'сбор',
        'запись',
        'хранение',
        'уточнение',
        'использование',
        'передача (предоставление)',
        'удаление',
        'уничтожение',
      ],
      methods: 'mixed',
      retention: 'срок действия договора и 5 лет после его исполнения',
    },
  ],
  databaseLocation: {
    country: 'RU',
    address: 'г. Санкт-Петербург, центр обработки данных ООО «Хостинг»',
  },
  thirdParties: [
    {
      role: 'processor',
      name: 'ООО «Хостинг»',
      address: '190000, г. Санкт-Петербург, ул. Серверная, д. 5',
      purpose: 'размещение и хранение данных сайта',
    },
    {
      role: 'recipient',
      name: 'ООО «Доставка»',
      address: '191000, г. Санкт-Петербург, ул. Примерная, д. 2',
      purpose: 'доставка заказов клиентам',
    },
  ],
  crossBorderTransfers: [
    {
      country: 'KZ',
      recipient: 'ТОО «Партнёр»',
      purpose: 'исполнение договоров с клиентами в Республике Казахстан',
      legalBasis:
        'исполнение договора, стороной которого является субъект (п. 5 ч. 1 ст. 6 152-ФЗ)',
      dataCategories: ['фамилия, имя', 'номер телефона', 'адрес доставки'],
      subjectCategories: ['клиенты — физические лица'],
      assessmentDate: '2026-10-15',
    },
  ],
  consentTerm: '1 год с даты получения согласия или до его отзыва',
  publicData: {
    purpose: 'размещение отзывов клиентов на сайте',
    dataCategories: ['имя', 'фотография', 'текст отзыва'],
    resources: ['https://romashka.example/reviews'],
  },
  processingStartDate: '2026-11-01',
  processingEndCondition: 'ликвидация или реорганизация оператора',
  cryptoTools: ['КриптоПро CSP 5.0'],
  protectionLevel: '3',
  implementedMeasures: [
    'responsible-person',
    'policy-and-local-acts',
    'security-measures',
    'internal-control',
    'harm-assessment',
    'staff-training',
  ],
  rknNotificationRef: { number: '78-26-012345', date: '2026-10-20' },
  incident: REFERENCE_INCIDENT,
};

/** Только обязательное, без необязательных полей и разделов: ловит метки без защитной секции. */
export const MINIMAL_REFERENCE_PROFILE: OperatorProfileInput = {
  name: 'Индивидуальный предприниматель Сидоров Пётр Петрович',
  inn: '500100732259',
  legalAddress: '141000, Московская обл., г. Мытищи, ул. Тестовая, д. 3',
  contactEmail: 'sidorov@example.ru',
  responsiblePerson: {
    fullName: 'Сидоров Пётр Петрович',
    position: 'индивидуальный предприниматель',
    phone: '+7 495 000-00-02',
    email: 'sidorov@example.ru',
  },
  purposes: [
    {
      title: 'Запись клиентов на услуги',
      dataCategories: ['имя', 'номер телефона'],
      subjectCategories: ['клиенты'],
      legalBasis: 'согласие субъекта персональных данных (п. 1 ч. 1 ст. 6 152-ФЗ)',
      actions: ['сбор', 'хранение', 'использование', 'уничтожение'],
      methods: 'non-automated',
      retention: '3 месяца с даты оказания услуги',
    },
  ],
  databaseLocation: { country: 'RU', address: 'Московская обл., г. Мытищи, офис оператора' },
  // Пустые списки здесь — явное «никому» и «нет», а не значение по умолчанию.
  thirdParties: [],
  crossBorderTransfers: [],
};
