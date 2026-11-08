import { load } from 'cheerio';

import { normalizeText } from '../official/official-html';
import type { OfficialParagraph } from '../official/official-html';

/** Блок с текстом документа; всё вне него — навигация и меню сайта. */
const CONTENT_ROOT = 'div.reader_article_body > div';

/**
 * Сайт теряет надстрочный индекс: «статьи 18¹» отдаётся как «статьи 181». Исправляем только это
 * место и только в ссылке на закон: любое другое «181» остаётся как есть.
 */
const LOST_SUPERSCRIPT = /((?<![а-яё])стать[а-яё]+ )181( Федерального закона)/gu;

/** Скобка закрывает оговорку «(далее - …)»: сайт оставляет перед запятой или точкой пробел. */
const SPACE_AFTER_PAREN = /\)\s+([,.;:])/gu;

const cleanText = (text: string): string =>
  normalizeText(text)
    .replace(SPACE_AFTER_PAREN, ')$1')
    .replace(LOST_SUPERSCRIPT, (_match, before: string, after: string) => `${before}18.1${after}`);

/**
 * Разбирает страницу документа government.ru в абзацы того же вида, что у официального портала,
 * чтобы извлечение пунктов было общим. Заголовки `<h4>` — абзацы класса `C`.
 */
export function parseGovernmentHtml(html: string): OfficialParagraph[] {
  const $ = load(html);
  const root = $(CONTENT_ROOT).first();
  root.find('br').replaceWith(' ');

  const paragraphs: OfficialParagraph[] = [];
  root.find('p, h4').each((_, element) => {
    const text = cleanText($(element).text());
    if (text.length === 0) return;
    paragraphs.push({ cls: element.tagName === 'h4' ? 'C' : '', text, notes: [] });
  });

  return paragraphs;
}
