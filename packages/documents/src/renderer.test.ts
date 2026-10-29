import { describe, expect, it } from 'vitest';

import { compileTemplate, escapeMarkdown, renderTemplate, TemplateError } from './renderer';

const render = (source: string, view: Record<string, unknown>) =>
  renderTemplate(compileTemplate(source), view);

describe('рендерер шаблонов (ADR-0013)', () => {
  it('подставляет значения, вложенные поля и числа', () => {
    const view = { name: 'ООО «Ромашка»', person: { fullName: 'Иванов И. И.' }, count: 3 };
    expect(render('{{name}}, {{person.fullName}}: {{count}}', view)).toBe(
      'ООО «Ромашка», Иванов И. И.: 3',
    );
  });

  it('повторяет секцию для каждого элемента и видит внешние поля', () => {
    const source = '{{#items}}- {{.}} ({{owner}})\n{{/items}}';
    expect(render(source, { items: ['ФИО', 'телефон'], owner: 'Оператор' })).toBe(
      '- ФИО (Оператор)\n- телефон (Оператор)\n',
    );
  });

  it('секция-объект открывает его поля, инвертированная — выводится при пустом значении', () => {
    const source =
      '{{#person}}{{fullName}}{{/person}}{{^items}}нет{{/items}}{{^flag}}выкл{{/flag}}';
    expect(render(source, { person: { fullName: 'Иванов' }, items: [], flag: false })).toBe(
      'Ивановнетвыкл',
    );
    expect(render('{{#flag}}вкл{{/flag}}{{#empty}}x{{/empty}}', { flag: true, empty: '' })).toBe(
      'вкл',
    );
  });

  it('строки с одним тегом секции или комментарием удаляются целиком', () => {
    const source = '# Заголовок\n\n{{! для юриста }}\n{{#items}}\n- {{.}}\n{{/items}}\n\nКонец\n';
    expect(render(source, { items: ['а', 'б'] })).toBe('# Заголовок\n\n- а\n- б\n\nКонец\n');
  });

  it('экранирует служебные символы Markdown и HTML в данных', () => {
    expect(render('{{name}}', { name: 'Рога_и*копыта <script>' })).toBe(
      'Рога\\_и\\*копыта \\<script\\>',
    );
    expect(escapeMarkdown('[a](b) `c` # | \\')).toBe('\\[a\\](b) \\`c\\` \\# \\| \\\\');
  });

  describe('строгость: пропуск в документе — ошибка', () => {
    it.each([
      ['неизвестная метка', '\n{{nmae}}', { name: 'x' }, 'Строка 2: неизвестная метка {{nmae}}'],
      ['неизвестное вложенное поле', '{{person.age}}', { person: {} }, 'неизвестная метка'],
      ['поле внутри не-объекта', '{{name.first}}', { name: 'x' }, 'неизвестная метка'],
      ['пустая строка', '{{name}}', { name: '' }, '{{name}} — пустое значение'],
      ['null', '{{name}}', { name: null }, 'пустое значение'],
      ['объект вместо текста', '{{person}}', { person: {} }, '{{person}} — не текст'],
      ['неизвестная секция', '{{#items}}x{{/items}}', {}, 'неизвестная метка {{items}}'],
    ])('%s', (_, source, view, message) => {
      expect(() => render(source, view)).toThrow(message);
    });

    it.each([
      ['незакрытая секция', 'a\n{{#items}}x', 'Строка 2: секция {{#items}} не закрыта'],
      ['перепутанные секции', '{{#a}}{{#b}}{{/a}}{{/b}}', '{{/a}} закрывает секцию {{#b}}'],
      ['лишнее закрытие', '{{/a}}', 'несуществующую секцию'],
      ['некорректная метка', '{{имя}}', 'некорректная метка'],
      ['тройные скобки', '{{{name}}}', 'Тройные скобки'],
    ])('%s — ошибка разбора', (_, source, message) => {
      expect(() => compileTemplate(source)).toThrow(TemplateError);
      expect(() => compileTemplate(source)).toThrow(message);
    });
  });
});
