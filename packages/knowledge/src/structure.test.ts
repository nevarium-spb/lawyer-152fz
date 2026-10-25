import { describe, expect, it } from 'vitest';

import { findNumberingProblem, splitNumbered } from './structure';

describe('splitNumbered', () => {
  it('делит статью на части, включая дробные; пункты остаются внутри части', () => {
    const text = [
      'Вводный абзац статьи.',
      '1. Первая часть:',
      '1) первый пункт;',
      '2.1) пункт с индексом.',
      '1.1. Часть один-один.',
      '2. Вторая часть.',
    ].join('\n\n');

    expect(splitNumbered(text)).toEqual([
      { number: '1', text: '1. Первая часть:\n\n1) первый пункт;\n\n2.1) пункт с индексом.' },
      { number: '1.1', text: '1.1. Часть один-один.' },
      { number: '2', text: '2. Вторая часть.' },
    ]);
  });

  it('примечания к статье с собственной нумерацией частями не считаются', () => {
    const text = [
      '17. Семнадцатая часть.',
      '18. Восемнадцатая часть.',
      'Примечания:',
      '1. Первое примечание.',
      '2. Второе примечание.',
    ].join('\n\n');
    expect(splitNumbered(text).map((part) => part.number)).toEqual(['17', '18']);
    expect(splitNumbered(text).at(-1)?.text).toBe('18. Восемнадцатая часть.');
  });

  it('статья без нумерованных частей — пустой список', () => {
    expect(splitNumbered('1) понятие;\n\n2) другое понятие.')).toEqual([]);
  });
});

describe('findNumberingProblem', () => {
  it('принимает возрастающую нумерацию', () => {
    const children = ['1', '1.1', '1.2', '2', '10'].map((number) => ({ number, text: '' }));
    expect(findNumberingProblem(children)).toBeUndefined();
  });

  it.each([
    [['1', '3', '2'], '3 → 2'],
    [['1', '1'], '1 → 1'],
    [['1.1', '1'], '1.1 → 1'],
  ])('находит нарушение %j', (numbers, fragment) => {
    const children = numbers.map((number) => ({ number, text: '' }));
    expect(findNumberingProblem(children)).toContain(fragment);
  });
});
