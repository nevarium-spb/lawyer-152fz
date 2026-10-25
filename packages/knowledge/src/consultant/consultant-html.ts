import { load } from 'cheerio';

import { normalizeText } from '../official/official-html';
import type { OfficialParagraph } from '../official/official-html';

/** Блок с текстом документа; всё вне него — навигация, реклама и меню сайта. */
const CONTENT_ROOT = '.document-page__content';

/** Собственные примечания и комментарии КонсультантПлюс — не текст акта (ADR-0007, ADR-0012). */
const CONSULTANT_NOTE_PREFIX = 'КонсультантПлюс';

/**
 * Разбирает страницу документа КонсультантПлюс в абзацы того же вида, что у официального портала,
 * чтобы извлечение пунктов было общим. Центрированные абзацы — заголовки (класс `C`).
 */
export function parseConsultantHtml(html: string): OfficialParagraph[] {
  const $ = load(html);
  const root = $(CONTENT_ROOT).first();
  root.find('br').replaceWith(' ');

  const paragraphs: OfficialParagraph[] = [];
  root.find('p').each((_, element) => {
    const paragraph = $(element);
    const text = normalizeText(paragraph.text());
    if (text.length === 0 || text.startsWith(CONSULTANT_NOTE_PREFIX)) return;

    const isHeading = (paragraph.attr('class') ?? '').split(/\s+/).includes('align_center');
    paragraphs.push({ cls: isHeading ? 'C' : '', text, notes: [] });
  });

  return paragraphs;
}
