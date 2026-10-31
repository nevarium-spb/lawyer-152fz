import { describe, expect, it } from 'vitest';

import { validProfileInput } from '../testing/fixtures';
import { documentWarnings } from './document-warnings';
import { IMPLEMENTED_MEASURES, operatorProfileSchema } from './operator-profile';
import type { OperatorProfileInput } from './operator-profile';

const profile = (overrides: Partial<OperatorProfileInput> = {}) =>
  operatorProfileSchema.parse({ ...validProfileInput(), ...overrides });

describe('предупреждения к документу', () => {
  it('все меры подтверждены — предупреждений нет', () => {
    const warnings = documentWarnings(
      ['measures'],
      profile({ implementedMeasures: [...IMPLEMENTED_MEASURES] }),
    );
    expect(warnings).toEqual([]);
  });

  it('называет меры, которые не подтверждены', () => {
    const [warning] = documentWarnings(
      ['measures'],
      profile({ implementedMeasures: ['responsible-person'] }),
    );
    expect(warning).toContain('оценка вреда');
    expect(warning).not.toContain('ответственный');
  });

  it('юридическому лицу без ответственного напоминает об обязанности, ИП — нет', () => {
    const legalEntity = documentWarnings(['measures'], profile({ implementedMeasures: [] }));
    expect(legalEntity.join()).toContain('ч. 1 ст. 22.1');
    const individual = documentWarnings(
      ['measures'],
      profile({ inn: '500100732259', ogrn: undefined, implementedMeasures: [] }),
    );
    expect(individual.join()).not.toContain('ч. 1 ст. 22.1');
  });

  it('не определённый уровень защищённости — предупреждение, а не значение из примера', () => {
    const warnings = documentWarnings(
      ['rknNotification'],
      profile({ protectionLevel: 'not-determined' }),
    );
    expect(warnings.join()).toContain('Уровень защищённости не определён');
  });

  it('раздел не нужен документу — и предупреждения по нему не нужны', () => {
    expect(documentWarnings([], profile())).toEqual([]);
  });
});
