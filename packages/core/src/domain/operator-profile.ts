import { z } from 'zod';

import { isValidInn, isValidOgrn } from './identifiers';

const requiredText = (message: string) => z.string({ error: message }).trim().min(1, message);

const nonEmptyList = (message: string) =>
  z.array(requiredText(message), { error: message }).min(1, message);

const countryCode = z
  .string({ error: 'Укажите код страны' })
  .regex(/^[A-Z]{2}$/, 'Код страны — две заглавные латинские буквы по ISO 3166-1, например RU');

/**
 * Профиль оператора персональных данных — вход для генерации документов.
 * Черновая схема вехи M1; состав полей уточняется в задаче T6.2.
 * Все недостающие поля сообщаются за один разбор, чтобы модель дозапросила их разом.
 */
export const operatorProfileSchema = z
  .object({
    name: requiredText('Укажите наименование оператора'),
    inn: z
      .string({ error: 'Укажите ИНН' })
      .refine(isValidInn, 'ИНН некорректен: 10 или 12 цифр с верной контрольной суммой'),
    ogrn: z
      .string()
      .refine(isValidOgrn, 'ОГРН/ОГРНИП некорректен: 13 или 15 цифр с верной контрольной суммой')
      .optional(),
    legalAddress: requiredText('Укажите юридический адрес'),
    contactEmail: z.email({ error: 'Укажите e-mail для обращений субъектов персональных данных' }),
    responsiblePerson: z.object(
      {
        fullName: requiredText('Укажите ФИО ответственного за организацию обработки ПДн'),
        position: requiredText('Укажите должность ответственного за организацию обработки ПДн'),
      },
      { error: 'Укажите ответственного за организацию обработки персональных данных' },
    ),
    purposes: nonEmptyList('Укажите хотя бы одну цель обработки'),
    dataCategories: nonEmptyList('Укажите категории обрабатываемых персональных данных'),
    subjectCategories: nonEmptyList('Укажите категории субъектов персональных данных'),
    thirdParties: z
      .array(
        z.object({
          name: requiredText('Укажите наименование третьего лица'),
          purpose: requiredText('Укажите цель передачи третьему лицу'),
        }),
      )
      .default([]),
    storageCountry: countryCode,
    crossBorderTransfers: z
      .array(
        z.object({
          country: countryCode,
          recipient: requiredText('Укажите получателя за рубежом'),
        }),
      )
      .default([]),
  })
  .refine((profile) => profile.crossBorderTransfers.every((t) => t.country !== 'RU'), {
    error: 'Передача внутри РФ не является трансграничной — уберите RU из списка',
    path: ['crossBorderTransfers'],
  });

export type OperatorProfile = z.output<typeof operatorProfileSchema>;
export type OperatorProfileInput = z.input<typeof operatorProfileSchema>;
