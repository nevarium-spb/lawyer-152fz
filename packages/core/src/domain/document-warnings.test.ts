import { describe, expect, it } from 'vitest';

import { validProfileInput } from '../testing/fixtures';
import { documentWarnings } from './document-warnings';
import { IMPLEMENTED_MEASURES, operatorProfileSchema } from './operator-profile';
import type { ProfileSection } from './operator-profile';

const warn = (sections: readonly ProfileSection[], overrides: Record<string, unknown> = {}) =>
  documentWarnings(
    sections,
    operatorProfileSchema.parse({ ...validProfileInput(), ...overrides }),
    '2026-11-02',
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
      );
    expect(at('2027-08-31')).toEqual([]);
    expect(at('2027-09-01').join()).toContain('№ 18');
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

  it('раздел не нужен документу — и предупреждения по нему не нужны', () => {
    expect(warn([])).toEqual([]);
  });
});
