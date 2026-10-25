import { describe, expect, it } from 'vitest';

import { parseOfficialHtml } from './official-html';

const page = (body: string) =>
  `<!DOCTYPE html><html><head><title>t</title></head><body>${body}</body></html>`;

describe('parseOfficialHtml', () => {
  it('превращает надстрочный индекс в номер через точку', () => {
    const html = page(
      '<p class="H">Статья 10<span class="W9">1</span>. Особенности</p>' +
        '<p><span class="ed">2<span class="W9">1</span>) перечень данных;</span></p>',
    );
    expect(parseOfficialHtml(html).map((p) => p.text)).toEqual([
      'Статья 10.1. Особенности',
      '2.1) перечень данных;',
    ]);
  });

  it('выносит пометки портала в notes и сохраняет класс абзаца', () => {
    const html = page(
      '<p>1. Текст части. <span class="markx">(В редакции Федерального закона <span class="cmd">от 01.01.2026 № 1-ФЗ</span>)</span></p>',
    );
    expect(parseOfficialHtml(html)).toEqual([
      {
        cls: '',
        text: '1. Текст части.',
        notes: ['(В редакции Федерального закона от 01.01.2026 № 1-ФЗ)'],
      },
    ]);
  });

  it('абзац из одной пометки — только notes', () => {
    const html = page('<p><span class="mark">(Дополнение частью - Федеральный закон)</span></p>');
    expect(parseOfficialHtml(html)).toEqual([
      { cls: '', text: '', notes: ['(Дополнение частью - Федеральный закон)'] },
    ]);
  });

  it('утратившая силу часть сохраняет пометку в тексте', () => {
    const html = page(
      '<p>3. <span class="mark">(Часть утратила силу - Федеральный закон)</span></p>',
    );
    expect(parseOfficialHtml(html)).toEqual([
      { cls: '', text: '3. (Часть утратила силу - Федеральный закон)', notes: [] },
    ]);
  });

  it('нормализует пробелы, неразрывные пробелы, переносы строк и мягкие переносы', () => {
    const html = page(
      '<p class="T">ПОЛОЖЕНИЕ<br>об&nbsp;особен\u00adностях\n обработки</p><p>   </p>',
    );
    expect(parseOfficialHtml(html)).toEqual([
      { cls: 'T', text: 'ПОЛОЖЕНИЕ об особенностях обработки', notes: [] },
    ]);
  });
});
