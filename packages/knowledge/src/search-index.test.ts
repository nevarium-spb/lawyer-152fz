import { makeNorm } from '@lawyer-152fz/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadKnowledgeBase } from './load-from-dir';
import { createSearchIndex, expandQuery, processTerm } from './search-index';
import type { SearchIndex } from './search-index';

describe('processTerm', () => {
  it('сводит словоформы к одной основе', () => {
    expect(processTerm('Согласие')).toBe(processTerm('согласия'));
    expect(processTerm('персональных')).toBe(processTerm('персональные'));
  });

  it('ё = е, стоп-слова отбрасываются, числа не стеммируются', () => {
    expect(processTerm('её')).toBe(processTerm('ее'));
    expect(processTerm('и')).toBeNull();
    expect(processTerm('18.1')).toBe('18.1');
  });
});

describe('expandQuery', () => {
  it('дописывает формулировку закона к бытовому термину в любой форме', () => {
    expect(expandQuery('штраф за утечку')).toContain('неправомерная');
    expect(expandQuery('требование локализации')).toContain('на территории Российской Федерации');
  });

  it('запрос без бытовых терминов не меняется', () => {
    expect(expandQuery('согласие субъекта')).toBe('согласие субъекта');
  });
});

describe('createSearchIndex на синтетических нормах', () => {
  const index = createSearchIndex([
    makeNorm({ id: '152-fz/art-9', heading: 'Статья 9. Согласие', text: 'Согласие субъекта.' }),
    makeNorm({ id: 'koap/art-1', act: 'koap', heading: 'Статья 1', text: 'Штраф за согласие.' }),
  ]);

  it('фильтрует по актам и соблюдает лимит', () => {
    expect(index.search({ text: 'согласие', acts: ['koap'], limit: 5 }).map((h) => h.id)).toEqual([
      'koap/art-1',
    ]);
    expect(index.search({ text: 'согласие', limit: 1 })).toHaveLength(1);
  });

  it('возвращает заголовок, фрагмент и дату редакции; запрос из стоп-слов — пусто', () => {
    const [hit] = index.search({ text: 'согласия субъекта', limit: 1 });
    expect(hit).toMatchObject({
      id: '152-fz/art-9',
      heading: 'Статья 9. Согласие',
      snippet: 'Согласие субъекта.',
      editionDate: '2025-01-01',
    });
    expect(index.search({ text: 'и в на', limit: 5 })).toEqual([]);
  });
});

/**
 * Качество поиска на настоящей базе (критерий T2.4). Ожидания — по смыслу закона,
 * а не по тому, что поиск выдал: нужная норма должна быть в первой тройке.
 */
describe('качество поиска по базе норм', () => {
  let index: SearchIndex;

  beforeAll(async () => {
    const knowledgeBase = await loadKnowledgeBase();
    if (!knowledgeBase.ok) throw new Error(knowledgeBase.error.message);
    index = createSearchIndex(knowledgeBase.value.norms);
  });

  it.each([
    [
      'согласие на обработку персональных данных, разрешенных для распространения',
      '152-fz/art-10.1',
    ],
    ['локализация баз данных', '152-fz/art-18/part-5'],
    ['трансграничная передача персональных данных', '152-fz/art-12'],
    ['уведомление об обработке персональных данных в уполномоченный орган', '152-fz/art-22'],
    [
      'опубликовать документ, определяющий политику в отношении обработки',
      '152-fz/art-18.1/part-2',
    ],
    ['утечка — уведомить в течение двадцати четырех часов', '152-fz/art-21/part-3.1'],
    ['лицо, ответственное за организацию обработки персональных данных', '152-fz/art-22.1'],
    ['биометрические персональные данные', '152-fz/art-11'],
    ['специальные категории: расовая, национальная принадлежность', '152-fz/art-10/part-1'],
    ['согласие в письменной форме', '152-fz/art-9/part-4'],
    ['право субъекта на доступ к его персональным данным', '152-fz/art-14'],
    ['отзыв согласия', '152-fz/art-9'],
    ['уничтожение персональных данных при достижении цели обработки', '152-fz/art-21/part-4'],
    ['оценка вреда', '152-fz/art-18.1/part-1'],
    ['полномочия РКН', '152-fz/art-23'],
  ])('«%s» → %s', (text, expected) => {
    const ids = index.search({ text, limit: 3 }).map((hit) => hit.id);
    expect(ids).toContain(expected);
  });

  it.each([
    ['обработка без согласия в письменной форме — штраф', 'koap', 'koap/art-13.11/part-2'],
    ['типовые формы документов', 'pp-687', 'pp-687/item-7'],
  ])('«%s» в акте %s → %s', (text, act, expected) => {
    const ids = index.search({ text, acts: [act], limit: 3 }).map((hit) => hit.id);
    expect(ids).toContain(expected);
  });

  it('бессмысленный запрос — пустой результат', () => {
    expect(index.search({ text: 'zzzqqqxx', limit: 5 })).toEqual([]);
  });
});
