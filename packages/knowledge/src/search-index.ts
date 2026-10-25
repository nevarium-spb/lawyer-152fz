import { toExcerpt } from '@lawyer-152fz/core';
import type { Norm, NormSearchHit, NormSearchQuery } from '@lawyer-152fz/core';
import MiniSearch from 'minisearch';
import { newStemmer } from 'snowball-stemmers';

const stemmer = newStemmer('russian');

/** Служебные слова: встречаются почти в каждой норме и только размывают ранжирование. */
const STOP_WORDS = new Set([
  'а',
  'без',
  'в',
  'во',
  'для',
  'до',
  'же',
  'за',
  'и',
  'из',
  'или',
  'к',
  'ко',
  'ли',
  'на',
  'не',
  'но',
  'о',
  'об',
  'от',
  'по',
  'при',
  'с',
  'со',
  'то',
  'у',
  'что',
  'это',
  'как',
]);

/**
 * Нормализация слова для индекса и запроса: регистр, «ё», стоп-слова, основа слова.
 * Числа не стеммируются: «18.1» и «24» должны находиться точно.
 */
export function processTerm(term: string): string | null {
  const word = term.toLowerCase().replaceAll('ё', 'е');
  if (STOP_WORDS.has(word)) return null;
  return /^\d/.test(word) ? word : stemmer.stem(word);
}

/**
 * Бытовые термины → формулировки закона. Клиенты спрашивают «локализация» и «утечка»,
 * а в законе — «базы данных, находящиеся на территории РФ» и «неправомерная передача».
 * Ключ — основа слова, значение дописывается к запросу.
 */
const PLAIN_TO_LEGAL: readonly (readonly [string, string])[] = [
  ['локализация', 'запись хранение баз данных находящихся на территории Российской Федерации'],
  ['утечка', 'неправомерная случайная передача предоставление распространение доступ'],
  ['ркн', 'уполномоченный орган по защите прав субъектов персональных данных'],
  ['роскомнадзор', 'уполномоченный орган по защите прав субъектов персональных данных'],
  ['пдн', 'персональные данные'],
];

const EXPANSIONS = new Map(
  PLAIN_TO_LEGAL.map(([plain, legal]) => [processTerm(plain) ?? plain, legal]),
);

/** Дописывает к запросу юридические формулировки для бытовых терминов. */
export function expandQuery(text: string): string {
  const additions = text
    .split(/[\s\p{P}]+/u)
    .map((word) => EXPANSIONS.get(processTerm(word) ?? ''))
    .filter((addition): addition is string => addition !== undefined);
  return [text, ...new Set(additions)].join(' ');
}

const SNIPPET_LENGTH = 200;

interface IndexedNorm {
  readonly id: string;
  readonly act: string;
  readonly heading: string;
  readonly text: string;
}

export interface SearchIndex {
  search(query: NormSearchQuery): NormSearchHit[];
}

/**
 * Полнотекстовый индекс BM25 по заголовкам и текстам норм (ADR-0003).
 * Индексируются и статьи, и их части: короткая часть точнее отвечает на узкий вопрос.
 */
export function createSearchIndex(norms: readonly Norm[]): SearchIndex {
  const byId = new Map(norms.map((norm) => [norm.id as string, norm]));
  const index = new MiniSearch<IndexedNorm>({
    fields: ['heading', 'text'],
    storeFields: ['act'],
    processTerm,
    searchOptions: { boost: { heading: 2 }, processTerm },
  });
  index.addAll(norms.map(({ id, act, heading, text }) => ({ id, act, heading, text })));

  return {
    search({ text, acts, limit }) {
      const results = index.search(expandQuery(text), {
        ...(acts && { filter: (result) => acts.includes(String(result['act'])) }),
      });

      return results.slice(0, limit).flatMap((result) => {
        const norm = byId.get(String(result.id));
        return norm
          ? [
              {
                id: norm.id,
                heading: norm.heading,
                snippet: toExcerpt(norm.text, SNIPPET_LENGTH),
                editionDate: norm.editionDate,
                score: Math.round(result.score * 1000) / 1000,
              },
            ]
          : [];
      });
    },
  };
}
