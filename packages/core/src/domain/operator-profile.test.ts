import { describe, expect, it } from 'vitest';

import { validProfileInput } from '../testing/fixtures';
import { parseWith } from '../shared/validation';
import { operatorProfileSchema } from './operator-profile';

const parse = (input: unknown) => parseWith(operatorProfileSchema, input, 'Профиль неполный');

describe('профиль оператора', () => {
  it('принимает корректный профиль и подставляет пустые списки по умолчанию', () => {
    const result = parse({
      ...validProfileInput(),
      thirdParties: undefined,
      crossBorderTransfers: undefined,
    });
    expect(result.ok && result.value.thirdParties).toEqual([]);
    expect(result.ok && result.value.crossBorderTransfers).toEqual([]);
  });

  it('за один разбор перечисляет все обязательные поля — по-русски', () => {
    const result = parse({});
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.issues).toEqual([
      { path: 'name', message: 'Укажите наименование оператора' },
      { path: 'inn', message: 'Укажите ИНН' },
      { path: 'legalAddress', message: 'Укажите юридический адрес' },
      {
        path: 'contactEmail',
        message: 'Укажите e-mail для обращений субъектов персональных данных',
      },
      {
        path: 'responsiblePerson',
        message: 'Укажите ответственного за организацию обработки персональных данных',
      },
      { path: 'purposes', message: 'Укажите хотя бы одну цель обработки' },
      { path: 'dataCategories', message: 'Укажите категории обрабатываемых персональных данных' },
      { path: 'subjectCategories', message: 'Укажите категории субъектов персональных данных' },
      { path: 'storageCountry', message: 'Укажите код страны' },
    ]);
  });

  it('проверяет ИНН и ОГРН по контрольной сумме', () => {
    const result = parse({ ...validProfileInput(), inn: '1234567890', ogrn: '1027700000009' });
    expect(!result.ok && result.error.issues.map((i) => i.path)).toEqual(['inn', 'ogrn']);
  });

  it('не принимает пустые строки в списках', () => {
    const result = parse({ ...validProfileInput(), purposes: ['  '] });
    expect(!result.ok && result.error.issues[0]).toEqual({
      path: 'purposes.0',
      message: 'Укажите хотя бы одну цель обработки',
    });
  });

  it('RU в трансграничной передаче — ошибка', () => {
    const result = parse({
      ...validProfileInput(),
      crossBorderTransfers: [{ country: 'RU', recipient: 'ООО «Тест»' }],
    });
    expect(!result.ok && result.error.issues[0]?.path).toBe('crossBorderTransfers');
  });
});
