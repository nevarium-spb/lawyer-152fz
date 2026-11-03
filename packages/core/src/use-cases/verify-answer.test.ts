import { describe, expect, it } from 'vitest';

import { LEGAL_DISCLAIMER } from '../domain/audit-report';
import { createInMemoryNormRepository } from '../testing/fakes';
import { makeNorm } from '../testing/fixtures';
import { createVerifyAnswer } from './verify-answer';
import type { VerificationCode, VerificationReport } from './verify-answer';

const ART_18_5 = makeNorm({
  id: '152-fz/art-18/part-5',
  text: '5. При сборе персональных данных, в том числе посредством информационно-телекоммуникационной сети «Интернет», оператор обязан обеспечить запись, систематизацию и хранение персональных данных граждан Российской Федерации с использованием баз данных, находящихся на территории Российской Федерации.',
  editionDate: '2026-07-26',
  verifiedAt: '2026-10-29',
});
const ART_18_6 = makeNorm({
  id: '152-fz/art-18/part-6',
  text: '6. Штраф за нарушение составляет от 150 000 до 300 000 рублей.',
  editionDate: '2026-07-26',
  verifiedAt: '2026-10-29',
});
const ART_22_7 = makeNorm({
  id: '152-fz/art-22/part-7',
  text: '7. В случае изменения сведений оператор обязан уведомить уполномоченный орган не позднее 15-го числа месяца, следующего за месяцем возникновения таких изменений.',
  editionDate: '2026-07-26',
  verifiedAt: '2026-10-29',
});
const PP_1119_13 = makeNorm({
  id: 'pp-1119/item-13',
  act: 'pp-1119',
  text: '13. Оператор обязан назначить лицо, ответственное за обеспечение безопасности персональных данных в информационной системе.',
  sourceType: 'secondary',
  sourceUrl: 'https://www.consultant.ru/document/cons_doc_LAW_137356/',
  officialPublication: '«Российская газета», 07.11.2012, № 256',
  editionDate: '2012-11-01',
  verifiedAt: '2026-10-29',
});

const verifier = createVerifyAnswer({
  norms: createInMemoryNormRepository([ART_18_5, ART_18_6, ART_22_7, PP_1119_13]),
});

async function verify(answer: string): Promise<VerificationReport> {
  const result = await verifier.verify(answer);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const withDisclaimer = (...lines: string[]): string => [...lines, '', LEGAL_DISCLAIMER].join('\n');

const codes = (report: VerificationReport): VerificationCode[] =>
  report.issues.map((issue) => issue.code);

const severityOf = (report: VerificationReport, code: VerificationCode) =>
  report.issues.find((issue) => issue.code === code)?.severity;

describe('verify_answer: чистый ответ', () => {
  it('ссылки, цитата, дата, метки и дисклеймер в порядке — ошибок и предупреждений нет', async () => {
    const report = await verify(
      withDisclaimer(
        '## Кратко',
        'Базы данных с персональными данными граждан РФ должны находиться в России: ч. 5 ст. 18 152-ФЗ (`152-fz/art-18/part-5`), редакция от 26.07.2026. **[в норме]**',
        '',
        '## Обоснование',
        'Норма: «обеспечить запись, систематизацию и хранение персональных данных граждан Российской Федерации» (`152-fz/art-18/part-5`). **[в норме]**',
        'Срок для уведомления — не позднее 15-го числа месяца: ч. 7 ст. 22 152-ФЗ (`152-fz/art-22/part-7`). **[в норме]**',
        'Ваша резервная копия в иностранном облаке, скорее всего, подпадает под эту обязанность (`152-fz/art-18/part-5`). **[вывод]**',
      ),
    );
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checked).toMatchObject({ normIds: 2, quotes: 1, unlabeledStatements: 0 });
    expect(report.notChecked.length).toBeGreaterThan(0);
  });
});

describe('verify_answer: нормы и ссылки', () => {
  it('выдуманный идентификатор — ошибка, повтор не дублируется', async () => {
    const report = await verify(
      withDisclaimer(
        'Есть такая норма (`152-fz/art-99/part-1`). **[в норме]**',
        'И ещё раз `152-fz/art-99/part-1`. **[вывод]**',
      ),
    );
    expect(codes(report).filter((code) => code === 'unknown-norm-id')).toHaveLength(1);
    expect(report.ok).toBe(false);
  });

  it('ссылка «ч. N ст. M» на несуществующую часть — ошибка', async () => {
    const report = await verify(
      withDisclaimer('Это следует из ч. 9 ст. 18 152-ФЗ (`152-fz/art-18/part-5`). **[в норме]**'),
    );
    expect(codes(report)).toContain('unknown-prose-ref');
    expect(report.ok).toBe(false);
  });

  it('ссылка и идентификатор называют разные части одной статьи — ошибка', async () => {
    const report = await verify(
      withDisclaimer(
        'Локализация предусмотрена ч. 5 ст. 18 152-ФЗ (`152-fz/art-18/part-6`). **[в норме]**',
      ),
    );
    expect(severityOf(report, 'ref-id-mismatch')).toBe('error');
  });

  it('идентификатор всей статьи рядом со ссылкой на её часть — не расхождение', async () => {
    const report = await verify(
      withDisclaimer('Локализация: ч. 5 ст. 18 152-ФЗ (`152-fz/art-18`). **[вывод]**'),
    );
    expect(codes(report)).not.toContain('ref-id-mismatch');
    expect(codes(report)).not.toContain('ref-without-id');
  });

  it('идентификатор другой статьи не делает ссылку расхождением — это ссылка без идентификатора', async () => {
    const report = await verify(
      withDisclaimer('Уведомить нужно по ч. 5 ст. 18 152-ФЗ (`152-fz/art-22/part-7`). **[вывод]**'),
    );
    expect(codes(report)).not.toContain('ref-id-mismatch');
    expect(severityOf(report, 'ref-without-id')).toBe('warning');
  });

  it('честное «в базе нет» про отсутствующую норму — предупреждение, а не ошибка', async () => {
    const report = await verify(
      withDisclaimer(
        'Ч. 9 ст. 18 152-ФЗ в базе нет, проверьте по pravo.gov.ru. **[вне базы]**',
        'Идентификатор `152-fz/art-18/part-8` не найден в базе. **[вне базы]**',
      ),
    );
    expect(severityOf(report, 'unknown-prose-ref')).toBe('warning');
    expect(severityOf(report, 'unknown-norm-id')).toBe('warning');
    expect(report.ok).toBe(true);
  });

  it('ссылка без идентификатора — предупреждение', async () => {
    const report = await verify(
      withDisclaimer('Локализация предусмотрена ч. 5 ст. 18 152-ФЗ. **[вывод]**'),
    );
    expect(severityOf(report, 'ref-without-id')).toBe('warning');
  });

  it('текст вторичного источника без упоминания КонсультантПлюс — ошибка', async () => {
    const hidden = await verify(
      withDisclaimer('Нужен ответственный (`pp-1119/item-13`). **[в норме]**'),
    );
    expect(codes(hidden)).toContain('secondary-source-undisclosed');

    const disclosed = await verify(
      withDisclaimer(
        'Нужен ответственный (`pp-1119/item-13`); текст взят из КонсультантПлюс, публикация: «Российская газета», 07.11.2012, № 256. **[в норме]**',
      ),
    );
    expect(codes(disclosed)).not.toContain('secondary-source-undisclosed');
  });

  it('дата редакции, не совпадающая с базой, — ошибка', async () => {
    const report = await verify(
      withDisclaimer(
        'Ч. 5 ст. 18 152-ФЗ (`152-fz/art-18/part-5`), редакция от 01.01.2020. **[в норме]**',
      ),
    );
    expect(codes(report)).toContain('edition-date-mismatch');
  });

  it('несколько дат в строке сверяются с нормами всего ответа', async () => {
    const report = await verify(
      withDisclaimer(
        'Нормы 152-ФЗ даны в редакции от 26.07.2026, нормы Х в редакции от 01.01.2020. **[вывод]**',
        'Локализация (`152-fz/art-18/part-5`). **[вывод]**',
      ),
    );
    expect(codes(report)).toContain('edition-date-mismatch');
    expect(report.issues.filter((issue) => issue.code === 'edition-date-mismatch')).toHaveLength(1);
  });
});

describe('verify_answer: цитаты', () => {
  it('изменённая цитата рядом с нормой — ошибка', async () => {
    const report = await verify(
      withDisclaimer(
        'Оператор обязан хранить данные только на серверах в Москве (`152-fz/art-18/part-5`): «обеспечить хранение персональных данных исключительно на серверах в Москве». **[в норме]**',
      ),
    );
    expect(severityOf(report, 'quote-not-in-norm')).toBe('error');
  });

  it('неточная цитата без метки [в норме] — предупреждение: это может быть пересказ в кавычках', async () => {
    const report = await verify(
      withDisclaimer(
        'Закон ограничивает хранение (`152-fz/art-18/part-5`): «обеспечить хранение персональных данных исключительно в Москве». **[вывод]**',
      ),
    );
    expect(severityOf(report, 'quote-not-in-norm')).toBe('warning');
    expect(report.ok).toBe(true);
  });

  it('ссылка вроде «ч. 4 ст. 13.11 КоАП» в ёлочках цитатой не считается', async () => {
    const report = await verify(
      withDisclaimer('Смотрите «ч. 4 ст. 13.11 КоАП» (`152-fz/art-18/part-5`). **[вывод]**'),
    );
    expect(report.checked.quotes).toBe(0);
  });

  it('цитата из другой нормы базы — предупреждение с подсказкой', async () => {
    const report = await verify(
      withDisclaimer(
        'Срок указан в ч. 7 ст. 22 152-ФЗ (`152-fz/art-22/part-7`): «обеспечить запись систематизацию и хранение персональных данных граждан Российской Федерации». **[в норме]**',
      ),
    );
    const issue = report.issues.find((item) => item.code === 'quote-from-other-norm');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain('152-fz/art-18/part-5');
  });

  it('цитата, которой нет в базе и рядом нет нормы, — предупреждение, а не ошибка', async () => {
    const report = await verify(
      withDisclaimer(
        'Пример формулировки: «Я даю согласие на обработку моих данных в целях исполнения договора». **[вне базы]**',
      ),
    );
    expect(severityOf(report, 'quote-not-in-norm')).toBe('warning');
    expect(report.ok).toBe(true);
  });

  it('цитата в строке под ссылкой на норму берёт норму из предыдущей строки', async () => {
    const report = await verify(
      withDisclaimer(
        'ч. 5 ст. 18 152-ФЗ (`152-fz/art-18/part-5`): **[в норме]**',
        '«на территории Российской Федерации».',
      ),
    );
    expect(codes(report)).not.toContain('quote-not-in-norm');
  });
});

describe('verify_answer: метки', () => {
  it('[в норме] без существующей нормы в строке — ошибка', async () => {
    const report = await verify(withDisclaimer('Штраф составляет много денег. **[в норме]**'));
    expect(codes(report)).toContain('label-needs-norm');
    expect(report.ok).toBe(false);
  });

  it('ответ без единой метки — ошибка', async () => {
    const report = await verify(withDisclaimer('Просто текст без меток.'));
    expect(codes(report)).toContain('no-labels');
  });

  it('число, которого нет в тексте нормы, — предупреждение', async () => {
    const report = await verify(
      withDisclaimer('Срок — 30 дней (`152-fz/art-22/part-7`). **[в норме]**'),
    );
    expect(severityOf(report, 'number-not-in-norm')).toBe('warning');
  });

  it('сумма с пробелами-разделителями тысяч сверяется целиком', async () => {
    const found = await verify(
      withDisclaimer(
        'Штраф — от 150 000 до 300 000 рублей (`152-fz/art-18/part-6`). **[в норме]**',
      ),
    );
    expect(codes(found)).not.toContain('number-not-in-norm');

    const wrong = await verify(
      withDisclaimer('Штраф — от 15 000 рублей (`152-fz/art-18/part-6`). **[в норме]**'),
    );
    expect(codes(wrong)).toContain('number-not-in-norm');
  });

  it('норма в предыдущих строках списка засчитывается утверждению ниже', async () => {
    const near = await verify(
      withDisclaimer(
        '1. ч. 5 ст. 18 152-ФЗ (`152-fz/art-18/part-5`):',
        '',
        'Оператор обязан хранить данные в России. **[в норме]**',
      ),
    );
    expect(codes(near)).not.toContain('label-needs-norm');

    const far = await verify(
      withDisclaimer(
        'ч. 5 ст. 18 152-ФЗ (`152-fz/art-18/part-5`):',
        'Первое. [вывод]',
        'Второе. [вывод]',
        'Третье. [вывод]',
        'Оператор обязан хранить данные в России. **[в норме]**',
      ),
    );
    expect(codes(far)).toContain('label-needs-norm');
  });

  it('пункт вложенного списка опирается на норму родительского пункта', async () => {
    const report = await verify(
      withDisclaimer(
        '- Обязанности по ч. 5 ст. 18 152-ФЗ (`152-fz/art-18/part-5`):',
        '  - Первое. [вывод]',
        '  - Второе. [вывод]',
        '  - Третье. [вывод]',
        '  - Оператор обязан хранить данные в России. **[в норме]**',
      ),
    );
    expect(codes(report)).not.toContain('label-needs-norm');
  });

  it('заголовок пункта опирается на нормы его дочерних пунктов', async () => {
    const report = await verify(
      withDisclaimer(
        '- **Хранение данных зависит от места баз.** **[в норме]**',
        '  - Базы в России: (`152-fz/art-18/part-5`);',
      ),
    );
    expect(codes(report)).not.toContain('label-needs-norm');
  });

  it('[в норме] об отсутствии нормы — предупреждение, а не ошибка', async () => {
    const report = await verify(
      withDisclaimer(
        'Исключения для резервных копий в тексте статьи нет. **[в норме]**',
        'Слов «cookie» в нормах из базы нет. **[в норме]**',
        'Если оснований хранить данные нет, их нужно уничтожить. **[в норме]**',
      ),
    );
    const labelIssues = report.issues.filter((issue) => issue.code === 'label-needs-norm');
    expect(labelIssues.map((issue) => issue.severity)).toEqual(['warning', 'warning', 'error']);
  });

  it('в кратком резюме [в норме] без идентификатора — предупреждение, если норма названа ниже', async () => {
    const answer = withDisclaimer(
      '**Кратко**',
      'Хранить данные нужно в России. **[в норме]**',
      '',
      '**Обоснование**',
      'Ч. 5 ст. 18 152-ФЗ (`152-fz/art-18/part-5`). **[в норме]**',
      'Оператор обязан хранить данные в России. **[в норме]**',
    );
    expect(severityOf(await verify(answer), 'label-needs-norm')).toBe('warning');

    const noNorms = await verify(
      withDisclaimer('**Кратко**', 'Хранить данные нужно в России. **[в норме]**'),
    );
    expect(severityOf(noNorms, 'label-needs-norm')).toBe('error');

    const body = await verify(
      withDisclaimer(
        '**Кратко**',
        'Всё в порядке. **[вывод]**',
        '**Обоснование**',
        'Хранить данные нужно в России. **[в норме]**',
        'Ч. 5 ст. 18 152-ФЗ (`152-fz/art-18/part-5`). **[в норме]**',
        '',
        '',
        '',
        '',
        'Оператор обязан хранить данные в России. **[в норме]**',
      ),
    );
    expect(severityOf(body, 'label-needs-norm')).toBe('error');
  });

  it('число в ссылке, дате и цитате за содержательное не считается', async () => {
    const report = await verify(
      withDisclaimer(
        'ч. 7 ст. 22 152-ФЗ (`152-fz/art-22/part-7`), редакция от 26.07.2026: «не позднее 15-го числа месяца». **[в норме]**',
      ),
    );
    expect(codes(report)).not.toContain('number-not-in-norm');
  });

  it('[в норме] про судебную практику — предупреждение', async () => {
    const report = await verify(
      withDisclaimer('Суды обычно штрафуют за это (`152-fz/art-18/part-5`). **[в норме]**'),
    );
    expect(severityOf(report, 'in-norm-outside-base')).toBe('warning');
  });

  it('[вывод] без названной нормы — предупреждение', async () => {
    const report = await verify(withDisclaimer('Скорее всего, вам это не подходит. **[вывод]**'));
    expect(severityOf(report, 'inference-without-norm')).toBe('warning');
  });

  it('утверждение по существу без метки — предупреждение, вопросы и заголовки не считаются', async () => {
    const report = await verify(
      withDisclaimer(
        'Что нужно сделать:',
        'Оператор обязан уведомить уполномоченный орган в течение 24 часов.',
        'Какой у вас сайт?',
        'Да, это так. **[вывод]** (`152-fz/art-18/part-5`)',
      ),
    );
    expect(report.issues.filter((issue) => issue.code === 'missing-label')).toHaveLength(1);
    expect(report.checked.unlabeledStatements).toBe(1);
  });
});

describe('verify_answer: дисклеймер и вход', () => {
  it('нет дисклеймера — ошибка; дисклеймер не последней строкой — предупреждение', async () => {
    const missing = await verify('Ответ (`152-fz/art-18/part-5`). **[в норме]**');
    expect(codes(missing)).toContain('disclaimer-missing');

    const notLast = await verify(
      `${LEGAL_DISCLAIMER}\nОтвет (\`152-fz/art-18/part-5\`). **[в норме]**`,
    );
    expect(severityOf(notLast, 'disclaimer-not-last')).toBe('warning');
  });

  it('дисклеймер в курсиве принимается', async () => {
    const report = await verify(
      `Ответ (\`152-fz/art-18/part-5\`). **[в норме]**\n\n_${LEGAL_DISCLAIMER}_`,
    );
    expect(codes(report)).not.toContain('disclaimer-missing');
  });

  it.each([[''], ['   '], [42], [undefined]])('вход %j отклоняется', async (input) => {
    const result = await verifier.verify(input);
    expect(result.ok).toBe(false);
  });

  it('слишком длинный ответ отклоняется', async () => {
    const result = await verifier.verify('а'.repeat(60_001));
    expect(result.ok).toBe(false);
  });
});
