import { describe, expect, it } from 'vitest';

import {
  containsText,
  extractLabels,
  extractNormIds,
  extractProseRefs,
  extractQuotes,
  normalizeForMatch,
  splitStatements,
  stripLabels,
  stripMarkdown,
} from './answer-text';

describe('extractNormIds', () => {
  it('находит идентификаторы в обратных кавычках и без них, без повторов и без точки в конце', () => {
    const text =
      'ч. 5 ст. 18 (`152-fz/art-18/part-5`), см. koap/art-13.11/part-1.1. Ещё pp-1119/item-13 и `152-fz/art-18/part-5`.';
    expect(extractNormIds(text)).toEqual([
      '152-fz/art-18/part-5',
      'koap/art-13.11/part-1.1',
      'pp-1119/item-13',
    ]);
  });

  it('не принимает пути и даты за идентификаторы', () => {
    expect(extractNormIds('файл src/art-1.ts и дата 03/11/2026')).toEqual([]);
  });
});

describe('extractProseRefs', () => {
  it('разбирает «ч. N ст. M акт» и «ст. M акт»', () => {
    expect(
      extractProseRefs('ч. 5 ст. 18 152-ФЗ, ст. 13.11 КоАП РФ и ч. 1.1 ст. 13.11 КоАП').map(
        (ref) => ref.id,
      ),
    ).toEqual(['152-fz/art-18/part-5', 'koap/art-13.11', 'koap/art-13.11/part-1.1']);
  });

  it('пропускает ссылки на акты, которых не знает', () => {
    expect(extractProseRefs('ст. 5 ТК РФ')).toEqual([]);
  });
});

describe('метки', () => {
  it('извлекает метки в любом регистре и убирает их из текста', () => {
    expect(extractLabels('Срок 30 дней. **[В норме]** и [вывод]')).toEqual(['в норме', 'вывод']);
    expect(stripLabels('Текст [вне базы] конец').replace(/\s+/gu, ' ')).toBe('Текст конец');
  });
});

describe('normalizeForMatch / containsText', () => {
  it('игнорирует регистр, ё, пунктуацию и пробелы, но не слова', () => {
    expect(normalizeForMatch('Всё,  ЧТО «нужно»…')).toBe('все что нужно');
    expect(
      containsText(
        '5. При сборе персональных данных, оператор обязан',
        'при сборе персональных данных оператор',
      ),
    ).toBe(true);
    expect(containsText('при сборе данных', 'при сборе персональных данных')).toBe(false);
    expect(containsText('любой текст', '   ')).toBe(false);
  });
});

describe('extractQuotes', () => {
  it('берёт цитаты от четырёх слов и делит их по многоточию', () => {
    const quotes = extractQuotes([
      'Термин «утечка» не цитата.',
      'Норма: «оператор обязан уведомить уполномоченный орган … в течение двадцати четырёх часов».',
    ]);
    expect(quotes.map((quote) => quote.text)).toEqual([
      'оператор обязан уведомить уполномоченный орган',
      'в течение двадцати четырёх часов',
    ]);
    expect(quotes.every((quote) => quote.line === 1)).toBe(true);
  });
});

describe('stripMarkdown', () => {
  it('убирает заголовки, маркеры, выделение и обратные кавычки', () => {
    expect(stripMarkdown('## Кратко')).toBe('Кратко');
    expect(stripMarkdown('- **[в норме]** текст `152-fz/art-1`')).toBe(
      '[в норме] текст 152-fz/art-1',
    );
    expect(stripMarkdown('1. пункт')).toBe('пункт');
    expect(stripMarkdown('> цитата')).toBe('цитата');
    expect(stripMarkdown('_курсив_')).toBe('курсив');
  });
});

describe('splitStatements', () => {
  it('не делит по сокращениям и по точкам внутри «ёлочек»', () => {
    expect(
      splitStatements(
        'Согласно ч. 5 ст. 18 152-ФЗ нужно так. Норма: «5. При сборе данных. Далее». Конец.',
      ),
    ).toEqual([
      'Согласно ч. 5 ст. 18 152-ФЗ нужно так.',
      'Норма: «5. При сборе данных. Далее».',
      'Конец.',
    ]);
  });

  it('присоединяет метку после точки к предыдущему предложению', () => {
    expect(
      splitStatements('Срок 15 дней (152-fz/art-22/part-7). [в норме] Следующее предложение.'),
    ).toEqual(['Срок 15 дней (152-fz/art-22/part-7). [в норме]', 'Следующее предложение.']);
  });

  it('строка, начинающаяся с метки, — одно утверждение', () => {
    expect(splitStatements('[вывод] Первое. Второе.')).toEqual(['[вывод] Первое. Второе.']);
  });

  it('пустая строка не даёт утверждений', () => {
    expect(splitStatements('   ')).toEqual([]);
  });
});
