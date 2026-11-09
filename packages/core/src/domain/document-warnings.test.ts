import { describe, expect, it } from 'vitest';

import { validProfileInput } from '../testing/fixtures';
import { documentWarnings } from './document-warnings';
import { IMPLEMENTED_MEASURES, operatorProfileSchema } from './operator-profile';
import type { ProfileSection } from './operator-profile';

const warn = (
  sections: readonly ProfileSection[],
  overrides: Record<string, unknown> = {},
  templateId = 'test-template',
) =>
  documentWarnings(
    sections,
    operatorProfileSchema.parse({ ...validProfileInput(), ...overrides }),
    '2026-11-02',
    templateId,
  );

describe('предупреждения к документу', () => {
  it('все меры подтверждены — предупреждений нет', () => {
    expect(warn(['measures'], { implementedMeasures: [...IMPLEMENTED_MEASURES] })).toEqual([]);
  });

  it('называет меры, которые не подтверждены', () => {
    const [warning] = warn(['measures'], { implementedMeasures: ['responsible-person'] });
    expect(warning).toContain('оценка вреда');
    expect(warning).not.toContain('ответственный');
  });

  it('юридическому лицу без ответственного напоминает об обязанности, ИП — нет', () => {
    expect(warn(['measures'], { implementedMeasures: [] }).join()).toContain('ч. 1 ст. 22.1');
    const individual = warn(['measures'], {
      inn: '500100732259',
      ogrn: undefined,
      implementedMeasures: [],
    });
    expect(individual.join()).not.toContain('ч. 1 ст. 22.1');
  });

  it('не определённый уровень защищённости — предупреждение, а не значение из примера', () => {
    const warnings = warn(['rknNotification'], { protectionLevel: 'not-determined' });
    expect(warnings.join()).toContain('Уровень защищённости не определён');
  });

  it('вся обработка без средств автоматизации — уведомление может быть не нужно (п. 8 ч. 2 ст. 22)', () => {
    const [purpose] = validProfileInput().purposes;
    const manual = warn(['rknNotification'], {
      purposes: [{ ...purpose, methods: 'non-automated' }],
    });
    expect(manual.join()).toContain('п. 8 ч. 2 ст. 22');
    const mixed = warn(['rknNotification'], { purposes: [{ ...purpose, methods: 'mixed' }] });
    expect(mixed.join()).not.toContain('п. 8 ч. 2 ст. 22');
  });

  it('дата начала обработки в прошлом — напоминание о ч. 1 ст. 22', () => {
    const past = warn(['rknNotification'], { processingStartDate: '2026-11-01' });
    expect(past.join()).toContain('ч. 1 ст. 22');
    expect(warn(['rknNotification'], { processingStartDate: '2026-11-02' })).toEqual([]);
  });

  it('после истечения приказа РКН № 18 просит проверить действующие требования', () => {
    const at = (today: string) =>
      documentWarnings(
        ['publicDistribution'],
        operatorProfileSchema.parse(validProfileInput()),
        today,
        'consent-distribution',
      );
    expect(at('2027-08-31')).toEqual([]);
    expect(at('2027-09-01').join()).toContain('№ 18');
  });

  describe('согласие для формы на сайте и специальные категории', () => {
    const [base] = validProfileInput().purposes;
    const withData = (dataCategories: string[], legalBasis = 'согласие субъекта') => ({
      purposes: [{ ...base, title: 'Подбор программы тренировок', dataCategories, legalBasis }],
    });

    it('данные о здоровье в цели по согласию — нужна письменная форма (п. 1 ч. 2 ст. 10, ч. 4 ст. 9)', () => {
      const warnings = warn(
        ['consent', 'processingConsent'],
        withData(['ФИО', 'сведения о состоянии здоровья']),
        'consent-processing-web',
      ).join();
      expect(warnings).toContain('«Подбор программы тренировок»');
      expect(warnings).toContain('п. 1 ч. 2 ст. 10');
      expect(warnings).toContain('ч. 4 ст. 9');
      expect(warnings).toContain('consent-processing');
    });

    it('биометрия — ссылка на ч. 1 ст. 11', () => {
      const warnings = warn(
        ['consent', 'processingConsent'],
        withData(['биометрическое изображение лица']),
        'consent-processing-web',
      ).join();
      expect(warnings).toContain('ч. 1 ст. 11');
    });

    it('письменный вариант, обычные данные и цель не по согласию — без этого предупреждения', () => {
      const special = withData(['сведения о состоянии здоровья']);
      const sections: ProfileSection[] = ['consent', 'processingConsent'];
      expect(warn(sections, special, 'consent-processing').join()).not.toContain('ч. 1 ст. 10');
      expect(
        warn(sections, withData(['ФИО', 'телефон']), 'consent-processing-web').join(),
      ).not.toContain('ч. 1 ст. 10');
      const contract = withData(
        ['сведения о состоянии здоровья'],
        'исполнение договора (п. 5 ч. 1 ст. 6)',
      );
      expect(warn(['consent'], contract, 'consent-processing-web').join()).not.toContain(
        'ч. 1 ст. 10',
      );
    });
  });

  describe('согласие на обработку', () => {
    const [base] = validProfileInput().purposes;
    const purpose = (title: string, legalBasis = 'согласие субъекта') => ({
      ...base,
      title,
      legalBasis,
    });

    it('напоминает, что получение согласия доказывает оператор (ч. 3 ст. 9), и про журнал', () => {
      const warnings = warn(['processingConsent'], { purposes: [purpose('Обработка заявок')] });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('ч. 3 ст. 9');
      expect(warnings[0]).toContain('журнал согласий');
      expect(warnings[0]).toContain('практическая рекомендация');
    });

    it('реклама вместе с другими целями — просит оформить отдельным согласием', () => {
      const warnings = warn(['processingConsent'], {
        purposes: [purpose('Обработка заявок'), purpose('Рекламная рассылка')],
      });
      expect(warnings[1]).toContain('Цель «Рекламная рассылка» похожа на продвижение');
      expect(warnings[1]).toContain('отдельным согласием');
      expect(warnings[1]).toContain('ст. 15');
      expect(warnings[1]).not.toContain('Обработка заявок');
    });

    it('согласие только на рекламу — не просит разделять, но напоминает про ст. 15', () => {
      const warnings = warn(['processingConsent'], {
        purposes: [purpose('Рассылка спецпредложений')],
      });
      expect(warnings[1]).toContain('Не объединяйте');
      expect(warnings[1]).not.toContain('соберите документ заново');
      expect(warnings[1]).toContain('ст. 15');
    });

    it('реклама не по согласию в документ не входит — про неё не предупреждает', () => {
      const warnings = warn(['processingConsent'], {
        purposes: [purpose('Обработка заявок'), purpose('Реклама', 'договор')],
      });
      expect(warnings).toHaveLength(1);
    });
  });

  describe('договор поручения', () => {
    const agreement = (overrides: Record<string, unknown> = {}) => ({
      number: '1-П',
      date: '2026-11-02',
      processor: {
        name: 'ООО «Хостинг»',
        address: 'г. Санкт-Петербург',
        country: 'RU',
        signatory: { fullName: 'Котов К. К.', position: 'директор' },
      },
      operatorSignatory: { fullName: 'Иванов И. И.', position: 'директор' },
      purposes: ['Обработка заявок с сайта'],
      dataCategories: ['номер телефона'],
      actions: ['хранение'],
      incidentNotice: 'в течение 4 часов с момента выявления',
      ...overrides,
    });
    const hosting = {
      role: 'processor',
      name: 'ООО «Хостинг»',
      address: 'СПб',
      purpose: 'хостинг',
    };

    it('обработчик есть в профиле, цели совпадают, он в РФ — предупреждений нет', () => {
      expect(
        warn(['processingAgreement'], {
          thirdParties: [hosting],
          processingAgreement: agreement(),
        }),
      ).toEqual([]);
    });

    it('обработчика нет среди processor — просит добавить в thirdParties', () => {
      const warnings = warn(['processingAgreement'], {
        thirdParties: [{ ...hosting, role: 'recipient' }],
        processingAgreement: agreement(),
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('thirdParties');
    });

    it('цель поручения не из профиля — называет её', () => {
      const warnings = warn(['processingAgreement'], {
        thirdParties: [hosting],
        processingAgreement: agreement({ purposes: ['Рассылка новостей'] }),
      });
      expect(warnings.join()).toContain('«Рассылка новостей»');
    });

    it('обработчик за рубежом — ч. 6 ст. 6, ст. 12 и ч. 5 ст. 18', () => {
      const warnings = warn(['processingAgreement'], {
        thirdParties: [hosting],
        processingAgreement: agreement({
          processor: { ...agreement().processor, country: 'DE' },
        }),
      });
      expect(warnings.join()).toContain('ч. 6 ст. 6');
      expect(warnings.join()).toContain('ст. 12');
      expect(warnings.join()).toContain('ч. 5 ст. 18');
    });
  });

  describe('положение об обработке', () => {
    const regulation = (dataKinds: unknown[]) => ({
      processingRegulation: {
        number: '1-ПД',
        date: '2026-11-02',
        signatory: { fullName: 'Иванов И. И.', position: 'директор' },
        dataKinds,
      },
    });
    const title = validProfileInput().purposes[0]?.title ?? '';

    it('категории названы для всех целей профиля — предупреждений нет', () => {
      expect(
        warn(['processingRegulation'], regulation([{ purpose: title, kinds: ['other'] }])),
      ).toEqual([]);
    });

    it('называет цели без категорий и категории для целей не из профиля', () => {
      const warnings = warn(
        ['processingRegulation'],
        regulation([{ purpose: 'Рассылка новостей', kinds: ['other'] }]),
      );
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain(`«${title}»`);
      expect(warnings[0]).toContain('п. 2 ч. 1 ст. 18.1');
      expect(warnings[1]).toContain('«Рассылка новостей»');
    });
  });

  describe('правила внутреннего контроля', () => {
    const rules = (extra: Record<string, unknown> = {}) => ({
      internalControlRules: {
        number: '1-ПД',
        date: '2026-11-02',
        signatory: { fullName: 'Иванов И. И.', position: 'директор' },
        schedule: 'ежегодно',
        ...extra,
      },
    });
    const purposesWith = (methods: string) =>
      validProfileInput().purposes.map((purpose) => ({ ...purpose, methods }));

    it('обработка в информационных системах без срока контроля — напоминает о п. 17 ПП № 1119', () => {
      const warnings = warn(['internalControlRules'], {
        ...rules(),
        purposes: purposesWith('mixed'),
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('п. 17 ПП РФ № 1119');
    });

    it('срок указан или обработка без средств автоматизации — предупреждений нет', () => {
      expect(
        warn(['internalControlRules'], {
          ...rules({ securityControlMonths: 24 }),
          purposes: purposesWith('automated'),
        }),
      ).toEqual([]);
      expect(
        warn(['internalControlRules'], { ...rules(), purposes: purposesWith('non-automated') }),
      ).toEqual([]);
    });
  });

  describe('приказ об ответственном за безопасность в информационной системе', () => {
    const order = {
      securityOfficerOrder: {
        number: '1-ПД',
        date: '2026-11-02',
        signatory: { fullName: 'Иванов И. И.', position: 'директор' },
        systems: [{ name: 'CRM', officer: { fullName: 'Петров П. П.', position: 'инженер' } }],
      },
    };
    const purposesWith = (methods: string) =>
      validProfileInput().purposes.map((purpose) => ({ ...purpose, methods }));
    const assessment = (name: string) => ({
      protectionAssessment: {
        date: '2026-11-01',
        systems: [
          { name, dataKind: 'other', employeesOnly: false, subjectsCount: 500, threatType: '3' },
        ],
      },
    });

    it('система есть в акте, обработка автоматизированная — предупреждений нет', () => {
      expect(
        warn(['securityOfficerOrder'], {
          ...order,
          ...assessment('CRM'),
          purposes: purposesWith('automated'),
        }),
      ).toEqual([]);
    });

    it('система не из акта и обработка без автоматизации — два предупреждения', () => {
      const warnings = warn(['securityOfficerOrder'], {
        ...order,
        ...assessment('Сайт'),
        purposes: purposesWith('non-automated'),
      });
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('п. 1');
      expect(warnings[1]).toContain('«CRM»');
    });
  });

  describe('акт о журнале пропуска', () => {
    const log = (purpose: string) => ({
      visitorLog: {
        number: '1-ПД',
        date: '2026-11-02',
        signatory: { fullName: 'Иванов И. И.', position: 'директор' },
        purpose,
        recordingMethod: 'запись в бумажном журнале',
        dataComposition: ['фамилия, имя, отчество'],
        accessPersons: ['охранник'],
        keepers: ['охранник'],
        retention: '1 год',
        unverifiedEntry: 'документ не проверяется',
      },
    });

    it('цель журнала есть в профиле — предупреждений нет', () => {
      const title = validProfileInput().purposes[0]?.title ?? '';
      expect(warn(['visitorLog'], log(title))).toEqual([]);
    });

    it('цели журнала нет в профиле — предупреждает', () => {
      const [warning] = warn(['visitorLog'], log('Пропуск посетителей'));
      expect(warning).toContain('«Пропуск посетителей»');
      expect(warning).toContain('п. 8 «а» ПП РФ № 687');
    });
  });

  it('раздел не нужен документу — и предупреждения по нему не нужны', () => {
    expect(warn([])).toEqual([]);
  });
});
