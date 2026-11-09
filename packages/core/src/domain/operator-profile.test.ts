import { describe, expect, it } from 'vitest';

import { validProfileInput } from '../testing/fixtures';
import { parseWith } from '../shared/validation';
import {
  isConsentBasis,
  operatorProfileSchema,
  operatorProfileSchemaFor,
  PROFILE_SECTIONS,
} from './operator-profile';
import type { ProfileSection } from './operator-profile';

const parseFor = (sections: readonly ProfileSection[], input: unknown) =>
  parseWith(operatorProfileSchemaFor(sections), input, 'Профиль неполный');
const parse = (input: unknown) => parseWith(operatorProfileSchema, input, 'Профиль неполный');
const paths = (result: ReturnType<typeof parse>) =>
  result.ok ? [] : result.error.issues.map((issue) => issue.path);

describe('профиль оператора', () => {
  it('принимает явно пустые списки третьих лиц и трансграничных передач', () => {
    const result = parse({ ...validProfileInput(), thirdParties: [], crossBorderTransfers: [] });
    expect(result.ok && result.value.thirdParties).toEqual([]);
    expect(result.ok && result.value.crossBorderTransfers).toEqual([]);
  });

  it('не подставляет пустые списки: «никому» и «нет» должен подтвердить пользователь', () => {
    const result = parse({
      ...validProfileInput(),
      thirdParties: undefined,
      crossBorderTransfers: undefined,
    });
    expect(paths(result)).toEqual(['thirdParties', 'crossBorderTransfers']);
    expect(!result.ok && result.error.issues.map((issue) => issue.message)).toEqual([
      expect.stringContaining('пустой список []'),
      expect.stringContaining('пустой список []'),
    ]);
  });

  it('за один разбор перечисляет все обязательные поля — по-русски', () => {
    const result = parse({});
    expect(!result.ok && result.error.issues).toEqual([
      { path: 'name', message: 'Укажите наименование оператора (для ИП — ФИО)' },
      { path: 'inn', message: 'Укажите ИНН' },
      { path: 'legalAddress', message: 'Укажите адрес оператора' },
      {
        path: 'contactEmail',
        message: 'Укажите e-mail для обращений субъектов персональных данных',
      },
      {
        path: 'responsiblePerson',
        message: 'Укажите ответственного за организацию обработки персональных данных',
      },
      { path: 'purposes', message: 'Укажите хотя бы одну цель обработки' },
      {
        path: 'databaseLocation',
        message: 'Укажите место нахождения базы данных с персональными данными',
      },
      { path: 'thirdParties', message: expect.stringContaining('пустой список []') as string },
      {
        path: 'crossBorderTransfers',
        message: expect.stringContaining('пустой список []') as string,
      },
    ]);
  });

  it('у третьего лица требует роль: поручение и самостоятельный получатель — разные вещи', () => {
    const thirdParty = { name: 'ООО «Тест»', address: 'Москва', purpose: 'доставка' };
    expect(paths(parse({ ...validProfileInput(), thirdParties: [thirdParty] }))).toEqual([
      'thirdParties.0.role',
    ]);
    expect(
      parse({ ...validProfileInput(), thirdParties: [{ ...thirdParty, role: 'recipient' }] }).ok,
    ).toBe(true);
  });

  it.each([
    ['согласие субъекта персональных данных (п. 1 ч. 1 ст. 6 152-ФЗ)', true],
    ['Согласие', true],
    ['с согласия субъекта', true],
    ['п. 1 ч. 1 ст. 6', true],
    ['исполнение договора (п. 5 ч. 1 ст. 6 152-ФЗ)', false],
    ['договор, согласованный сторонами', false],
    ['обработка без согласия: п. 11 ч. 1 ст. 6', false],
    ['законный интерес, согласие не требуется', false],
  ])('основание «%s» — согласие: %s', (legalBasis, expected) => {
    expect(isConsentBasis(legalBasis)).toBe(expected);
  });

  it('у цели обработки перечисляет все недостающие сведения сразу', () => {
    const result = parse({ ...validProfileInput(), purposes: [{ title: 'Заявки' }] });
    expect(paths(result)).toEqual([
      'purposes.0.dataCategories',
      'purposes.0.subjectCategories',
      'purposes.0.legalBasis',
      'purposes.0.actions',
      'purposes.0.methods',
      'purposes.0.retention',
    ]);
  });

  it('проверяет ИНН и ОГРН по контрольной сумме', () => {
    const result = parse({ ...validProfileInput(), inn: '1234567890', ogrn: '1027700000009' });
    expect(paths(result)).toEqual(['inn', 'ogrn']);
  });

  it('не принимает пустые строки в списках', () => {
    const input = validProfileInput();
    const result = parse({
      ...input,
      purposes: [{ ...input.purposes[0], dataCategories: ['  '] }],
    });
    expect(!result.ok && result.error.issues[0]).toEqual({
      path: 'purposes.0.dataCategories.0',
      message: 'Укажите перечень персональных данных для этой цели',
    });
  });

  it('база данных за пределами РФ — ошибка со ссылкой на ст. 18 ч. 5', () => {
    const result = parse({
      ...validProfileInput(),
      databaseLocation: { country: 'DE', address: 'Франкфурт' },
    });
    const message = !result.ok && result.error.issues[0]?.message;
    expect(message).toContain('ст. 18 ч. 5');
    expect(message).toContain('пп. 2, 3, 4, 8 ч. 1 ст. 6');
    expect(message).toContain('не заменяйте его на RU');
  });

  it('RU в трансграничной передаче — ошибка', () => {
    const result = parse({
      ...validProfileInput(),
      crossBorderTransfers: [
        {
          country: 'RU',
          recipient: 'ООО «Тест»',
          purpose: 'хостинг',
          legalBasis: 'договор',
          dataCategories: ['e-mail'],
          subjectCategories: ['клиенты'],
          assessmentDate: '2026-10-01',
        },
      ],
    });
    expect(paths(result)).toEqual(['crossBorderTransfers.0.country']);
  });
});

describe('разделы профиля для отдельных документов', () => {
  const rknFields = {
    processingStartDate: '2026-11-01',
    processingEndCondition: 'ликвидация организации',
    cryptoTools: [],
    protectionLevel: '4',
  } as const;

  it('без разделов сведения уведомлений не требуются', () => {
    expect(parseFor([], validProfileInput()).ok).toBe(true);
  });

  it('уведомление в РКН требует свои поля — все за один разбор', () => {
    const result = parseFor(['rknNotification'], validProfileInput());
    expect(paths(result)).toEqual([
      'processingStartDate',
      'processingEndCondition',
      'cryptoTools',
      'protectionLevel',
    ]);
  });

  it('пустой список средств шифрования допустим: «не используются» — тоже ответ', () => {
    expect(parseFor(['rknNotification'], { ...validProfileInput(), ...rknFields }).ok).toBe(true);
  });

  it('дата — строго ГГГГ-ММ-ДД', () => {
    const result = parseFor(['rknNotification'], {
      ...validProfileInput(),
      ...rknFields,
      processingStartDate: '01.11.2026',
    });
    expect(!result.ok && result.error.issues[0]?.message).toContain('ГГГГ-ММ-ДД');
  });

  it('трансграничная передача требует хотя бы одну передачу и номер уведомления', () => {
    const result = parseFor(['crossBorder'], validProfileInput());
    expect(paths(result)).toEqual(['crossBorderTransfers', 'rknNotificationRef']);
  });

  it('разделы объединяются', () => {
    const result = parseFor(['consent', 'publicDistribution'], validProfileInput());
    expect(paths(result)).toEqual(['consentTerm', 'publicData']);
  });

  describe('ресурсы для распространения — адрес с http или https (п. 4 приказа РКН № 18)', () => {
    const withResources = (resources: string[]) =>
      parseFor(['publicDistribution'], {
        ...validProfileInput(),
        publicData: { purpose: 'размещение отзывов', dataCategories: ['имя'], resources },
      });

    it.each([['https://site.example/reviews'], ['http://site.example/reviews.html']])(
      'принимает %s',
      (url) => {
        expect(withResources([url]).ok).toBe(true);
      },
    );

    it.each([
      ['ftp://site.example/reviews'],
      ['mailto:info@site.example'],
      ['site.example/reviews'],
    ])('отклоняет %s', (url) => {
      const result = withResources([url]);
      expect(paths(result)).toEqual(['publicData.resources.0']);
      expect(!result.ok && result.error.issues[0]?.message).toContain('http или https');
    });
  });

  it('согласие на обработку не собирается, если ни одна цель не основана на согласии', () => {
    const input = validProfileInput();
    const result = parseFor(['processingConsent'], {
      ...input,
      purposes: [{ ...input.purposes[0], legalBasis: 'исполнение договора (п. 5 ч. 1 ст. 6)' }],
    });
    expect(paths(result)).toEqual(['purposes']);
    expect(parseFor(['processingConsent'], input).ok).toBe(true);
  });

  it('перечень разделов полный', () => {
    expect(PROFILE_SECTIONS).toEqual([
      'consent',
      'processingConsent',
      'publicDistribution',
      'rknNotification',
      'measures',
      'responsibleOrder',
      'mediaRegister',
      'protectionAssessment',
      'accessList',
      'harmAssessment',
      'destructionAct',
      'destructionProcedure',
      'processingAgreement',
      'incident',
      'crossBorder',
    ]);
  });

  it('меры нужно перечислить явно, пустой список допустим, неизвестная мера — ошибка', () => {
    expect(paths(parseFor(['measures'], validProfileInput()))).toEqual(['implementedMeasures']);
    expect(parseFor(['measures'], { ...validProfileInput(), implementedMeasures: [] }).ok).toBe(
      true,
    );
    expect(
      parseFor(['measures'], { ...validProfileInput(), implementedMeasures: ['всё сделано'] }).ok,
    ).toBe(false);
  });

  it('уровень защищённости можно честно не знать', () => {
    const result = parseFor(['rknNotification'], {
      ...validProfileInput(),
      ...rknFields,
      protectionLevel: 'not-determined',
    });
    expect(result.ok).toBe(true);
  });
});
