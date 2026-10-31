import { describe, expect, it } from 'vitest';

import { validProfileInput } from '../testing/fixtures';
import { documentWarnings } from './document-warnings';
import { IMPLEMENTED_MEASURES, operatorProfileSchema } from './operator-profile';
import type { OperatorProfileInput, ProfileSection } from './operator-profile';

const warn = (sections: readonly ProfileSection[], overrides: Partial<OperatorProfileInput> = {}) =>
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

  it('раздел не нужен документу — и предупреждения по нему не нужны', () => {
    expect(warn([])).toEqual([]);
  });
});
