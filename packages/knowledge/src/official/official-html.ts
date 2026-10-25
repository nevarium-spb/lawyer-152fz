import { load } from 'cheerio';

/** Абзац официального текста. */
export interface OfficialParagraph {
  /** Класс абзаца в разметке портала: H — заголовок статьи/главы, Y/P — подпись, C — раздел. */
  readonly cls: string;
  readonly text: string;
  /** Пометки портала «(В редакции…)», «(Дополнение…)» — справка, а не текст закона. */
  readonly notes: readonly string[];
}

const BARE_NUMBER = /^\d+(?:\.\d+)*[.)]?$/;

const normalize = (text: string): string =>
  text
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Нормализация пробелов, общая для всех источников текстов. */
export const normalizeText = normalize;

/**
 * Разбирает HTML редакции с actual.pravo.gov.ru в абзацы.
 * Особенности разметки портала:
 * - надстрочный индекс `<span class="W9">` — часть номера: «10¹» → «10.1»;
 * - `<span class="mark|markx">` — пометки о редакциях, выносятся в `notes`;
 * - `<br>` внутри абзаца — пробел, иначе слова склеиваются.
 */
export function parseOfficialHtml(html: string): OfficialParagraph[] {
  const $ = load(html);

  $('br').replaceWith(' ');
  $('span.W9').each((_, element) => {
    const index = $(element).text().trim();
    $(element).replaceWith(/^\d+$/.test(index) ? `.${index}` : index);
  });

  const paragraphs: OfficialParagraph[] = [];
  $('body p').each((_, element) => {
    const paragraph = $(element);
    const full = normalize(paragraph.text());
    const marks = paragraph.find('span.mark, span.markx');
    const notes = marks
      .map((_index, mark) => normalize($(mark).text()))
      .get()
      .filter((note) => note.length > 0);
    marks.remove();

    const rest = normalize(paragraph.text());
    // «3. (Часть утратила силу …)»: без пометки от части остался бы голый номер — сохраняем её целиком.
    const keepMarks = rest.length > 0 && BARE_NUMBER.test(rest);
    const text = keepMarks ? full : rest;

    if (text.length > 0 || notes.length > 0) {
      paragraphs.push({ cls: paragraph.attr('class') ?? '', text, notes: keepMarks ? [] : notes });
    }
  });

  return paragraphs;
}
