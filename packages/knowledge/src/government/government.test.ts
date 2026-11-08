import { describe, expect, it } from 'vitest';

import { extractDecreeItems } from '../official/extract';
import { createGovernmentClient, governmentDocumentUrl } from './government-client';
import type { TextFetchLike } from './government-client';
import { parseGovernmentHtml } from './government-html';

const page = (content: string) =>
  `<html><body><nav><p>Меню сайта</p></nav><div class="reader_article_body" itemprop="articleBody"><p class="reader_article_lead">Об утверждении</p><div class="reader_article_body"><div>${content}</div></div></div><footer><p>Подвал</p></footer></body></html>`;

describe('parseGovernmentHtml', () => {
  const html = page(
    '<p> </p>' +
      '<h4>ПОСТАНОВЛЕНИЕ</h4>' +
      '<p>1. Утвердить требования.</p>' +
      '<p>УТВЕРЖДЕНЫ постановлением</p>' +
      '<h4>ТРЕБОВАНИЯ к защите данных</h4>' +
      '<p>1. Оператор (далее - оператор) , или лицо (далее - лицо) . Первый пункт.</p>' +
      '<p>а) подпункт;</p>' +
      '<p>2. Учёт по пункту 5 части 1 статьи 181 Федерального закона и число 181 в тексте.</p>' +
      '<p>_____________</p>',
  );

  it('берёт только текст документа, заголовки <h4> — класс C', () => {
    const paragraphs = parseGovernmentHtml(html);
    expect(paragraphs.map((paragraph) => paragraph.cls)).toEqual([
      'C',
      '',
      '',
      'C',
      '',
      '',
      '',
      '',
    ]);
    expect(paragraphs[0]?.text).toBe('ПОСТАНОВЛЕНИЕ');
    expect(paragraphs.some((paragraph) => paragraph.text.includes('Меню'))).toBe(false);
    expect(paragraphs.some((paragraph) => paragraph.text.includes('Подвал'))).toBe(false);
  });

  it('убирает пробел перед запятой и точкой после скобки', () => {
    const [item] = extractDecreeItems(parseGovernmentHtml(html), /^ТРЕБОВАНИЯ/);
    expect(item?.text).toContain('(далее - оператор), или лицо (далее - лицо). Первый пункт.');
  });

  it('возвращает надстрочный индекс только в ссылке на закон', () => {
    const items = extractDecreeItems(parseGovernmentHtml(html), /^ТРЕБОВАНИЯ/);
    expect(items[1]?.text).toBe(
      '2. Учёт по пункту 5 части 1 статьи 18.1 Федерального закона и число 181 в тексте.',
    );
  });

  it('совместим с извлечением пунктов постановления', () => {
    expect(
      extractDecreeItems(parseGovernmentHtml(html), /^ТРЕБОВАНИЯ/).map((i) => i.number),
    ).toEqual(['1', '2']);
  });

  it('страница без блока документа — пустой список', () => {
    expect(parseGovernmentHtml('<html><body><p>Текст</p></body></html>')).toEqual([]);
  });
});

describe('клиент government.ru', () => {
  it('запрашивает страницу документа с честным User-Agent', async () => {
    const calls: { url: string; agent: string | undefined }[] = [];
    const fetchImpl: TextFetchLike = (url, init) => {
      calls.push({ url, agent: init.headers['user-agent'] });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<html/>') });
    };
    const result = await createGovernmentClient(fetchImpl).documentHtml('84743');
    expect(result).toEqual({ ok: true, value: '<html/>' });
    expect(calls).toEqual([
      {
        url: 'http://government.ru/docs/all/84743/',
        agent: 'lawyer-152fz (+https://github.com/nevarium-spb/lawyer-152fz)',
      },
    ]);
  });

  it.each([
    [
      'HTTP 500',
      () => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('') }),
    ],
    ['сеть', () => Promise.reject(new Error('ETIMEDOUT'))],
  ] as [string, TextFetchLike][])('%s → source-unavailable', async (_case, fetchImpl) => {
    const result = await createGovernmentClient(fetchImpl).documentHtml('84743');
    expect(!result.ok && result.error.kind).toBe('source-unavailable');
  });

  it('ссылка на документ', () => {
    expect(governmentDocumentUrl('84743')).toBe('https://government.ru/docs/all/84743/');
  });
});
