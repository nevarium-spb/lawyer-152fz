import { describe, expect, it } from 'vitest';

import { extractDecreeItems } from '../official/extract';
import { consultantDocumentUrl, createConsultantClient } from './consultant-client';
import type { TextFetchLike } from './consultant-client';
import { parseConsultantHtml } from './consultant-html';

const page = (content: string) =>
  `<html><body><nav><p>Меню сайта</p></nav><div class="document-page__content">${content}</div><footer><p>Подвал</p></footer></body></html>`;

describe('parseConsultantHtml', () => {
  const html = page(
    '<p class="align_right no-indent">Утверждены постановлением</p>' +
      '<p class="align_center no-indent">ТРЕБОВАНИЯ<br>К ЗАЩИТЕ ДАННЫХ</p>' +
      '<p>1. Первый пункт.</p>' +
      '<p>КонсультантПлюс: примечание. Комментарий редакции.</p>' +
      '<p>а) подпункт;</p>' +
      '<p>2. Второй пункт.</p>',
  );

  it('берёт только текст документа и отбрасывает примечания КонсультантПлюс', () => {
    expect(parseConsultantHtml(html)).toEqual([
      { cls: '', text: 'Утверждены постановлением', notes: [] },
      { cls: 'C', text: 'ТРЕБОВАНИЯ К ЗАЩИТЕ ДАННЫХ', notes: [] },
      { cls: '', text: '1. Первый пункт.', notes: [] },
      { cls: '', text: 'а) подпункт;', notes: [] },
      { cls: '', text: '2. Второй пункт.', notes: [] },
    ]);
  });

  it('совместим с извлечением пунктов постановления', () => {
    expect(extractDecreeItems(parseConsultantHtml(html), /^ТРЕБОВАНИЯ/)).toEqual([
      { number: '1', heading: '', text: '1. Первый пункт.\n\nа) подпункт;', notes: [] },
      { number: '2', heading: '', text: '2. Второй пункт.', notes: [] },
    ]);
  });

  it('страница без блока документа — пустой список', () => {
    expect(parseConsultantHtml('<html><body><p>Текст</p></body></html>')).toEqual([]);
  });
});

describe('клиент КонсультантПлюс', () => {
  it('запрашивает раздел документа с честным User-Agent', async () => {
    const calls: { url: string; agent: string | undefined }[] = [];
    const fetchImpl: TextFetchLike = (url, init) => {
      calls.push({ url, agent: init.headers['user-agent'] });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<html/>') });
    };
    const result = await createConsultantClient(fetchImpl).documentHtml('LAW_1', 'abc');
    expect(result).toEqual({ ok: true, value: '<html/>' });
    expect(calls).toEqual([
      {
        url: 'https://www.consultant.ru/document/cons_doc_LAW_1/abc/',
        agent: 'lawyer-152fz (+https://github.com/nevarium-spb/lawyer-152fz)',
      },
    ]);
  });

  it.each([
    [
      'HTTP 403',
      () => Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve('') }),
    ],
    ['сеть', () => Promise.reject(new Error('ETIMEDOUT'))],
  ] as [string, TextFetchLike][])('%s → source-unavailable', async (_case, fetchImpl) => {
    const result = await createConsultantClient(fetchImpl).documentHtml('LAW_1');
    expect(!result.ok && result.error.kind).toBe('source-unavailable');
  });

  it('ссылка на документ без раздела', () => {
    expect(consultantDocumentUrl('LAW_137356')).toBe(
      'https://www.consultant.ru/document/cons_doc_LAW_137356/',
    );
  });
});
