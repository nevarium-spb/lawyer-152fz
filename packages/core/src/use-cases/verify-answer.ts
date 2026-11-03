import { z } from 'zod';

import {
  containsText,
  extractLabels,
  extractNormIds,
  extractProseRefs,
  extractQuotes,
  normalizeForMatch,
  splitStatements,
  stripLabels,
  stripMarkdown,
} from '../domain/answer-text';
import type { AnswerLabel } from '../domain/answer-text';
import { LEGAL_DISCLAIMER } from '../domain/audit-report';
import type { Norm } from '../domain/norm';
import { parseNormId } from '../domain/norm-id';
import type { NormRepository } from '../ports';
import type { ValidationError } from '../shared/errors';
import { ok } from '../shared/result';
import type { Result } from '../shared/result';
import { parseWith } from '../shared/validation';

export const MAX_ANSWER_LENGTH = 60_000;

export type VerificationSeverity = 'error' | 'warning';

export type VerificationCode =
  | 'unknown-norm-id'
  | 'unknown-prose-ref'
  | 'ref-id-mismatch'
  | 'ref-without-id'
  | 'quote-not-in-norm'
  | 'quote-from-other-norm'
  | 'edition-date-mismatch'
  | 'label-needs-norm'
  | 'inference-without-norm'
  | 'number-not-in-norm'
  | 'in-norm-outside-base'
  | 'missing-label'
  | 'no-labels'
  | 'secondary-source-undisclosed'
  | 'disclaimer-missing'
  | 'disclaimer-not-last';

export interface VerificationIssue {
  readonly code: VerificationCode;
  /** error — проверяемое нарушение, ответ нельзя отдавать как есть; warning — подозрение, проверь вручную. */
  readonly severity: VerificationSeverity;
  readonly message: string;
  /** Фрагмент ответа, к которому относится замечание. */
  readonly excerpt?: string;
}

export interface VerificationReport {
  /** true — ошибок нет (предупреждения возможны). Не значит «ответ юридически верен». */
  readonly ok: boolean;
  readonly issues: readonly VerificationIssue[];
  readonly checked: {
    readonly normIds: number;
    readonly quotes: number;
    readonly labeledStatements: number;
    readonly unlabeledStatements: number;
  };
  readonly notChecked: readonly string[];
}

export const NOT_CHECKED_BY_VERIFICATION: readonly string[] = [
  'Верность толкования и применения нормы к ситуации пользователя ([вывод], [спорно]): сверка проверяет ссылки, цитаты и метки, но не рассуждение.',
  'Актуальность редакции: используйте check_norm_freshness.',
  'Утверждения, которые в ответе не помечены и не содержат ссылок, чисел или обязательных формулировок.',
  'Числа, записанные в норме прописью, сверяются только цифрами: возможны ложные предупреждения.',
];

const answerSchema = z
  .string({ error: 'Передайте текст ответа' })
  .refine((text) => text.trim().length > 0, 'Текст ответа пуст')
  .refine((text) => text.length <= MAX_ANSWER_LENGTH, {
    error: `Ответ длиннее ${String(MAX_ANSWER_LENGTH)} символов`,
  });

export interface VerifyAnswerDeps {
  readonly norms: NormRepository;
}

export interface VerifyAnswer {
  verify(answer: unknown): Promise<Result<VerificationReport, ValidationError>>;
}

const OUTSIDE_BASE_PATTERN =
  /судебн|судов|суды|практик|разъяснени|письм[оа]\s+(?:Роскомнадзора|РКН|Минцифры)|приказ|GDPR|регламент\s+ЕС|обычно/iu;

const SUBSTANTIVE_PATTERN =
  /\d+\s*(?:дн|час|рабоч|месяц|лет|год|руб|тыс|млн|%)|обязан|должен|должна|должны|необходимо|нужно|запрещ|штраф|вправе|не\s+вправе/iu;

const EXCERPT_LENGTH = 160;
/** Сколько непустых строк выше учитывать, когда норма названа не в самой строке с утверждением. */
const LOOKBACK_LINES = 3;
const MIN_STATEMENT_WORDS = 4;
const MAX_SEARCH_WORDS = 12;
const SEARCH_LIMIT = 5;

const excerptOf = (text: string): string =>
  text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}…` : text;

interface Statement {
  readonly text: string;
  readonly line: number;
  readonly labels: readonly AnswerLabel[];
}

/** Убирает из утверждения то, что не является «содержательным» числом: ссылки, даты, цитаты. */
const stripReferences = (text: string): string =>
  text
    .replace(/«[^«»]*»/gu, ' ')
    .replace(/(?<![\w/.-])[a-z0-9]+(?:-[a-z0-9]+)*\/(?:art|item)-[\d./a-z-]*/gu, ' ')
    .replace(/(?<![\p{L}])(?:п|ч|ст|пп|абз)\.\s*\d+(?:\.\d+)*/giu, ' ')
    .replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/gu, ' ')
    .replace(/152[-‑–]?ФЗ|№\s*\d+/giu, ' ');

/** Число с пробелами-разделителями тысяч («150 000») берётся целиком. */
const numbersIn = (text: string): string[] =>
  [...stripReferences(text).matchAll(/\d{1,3}(?:[\s]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/gu)].map(
    (match) => match[0].replace(/[\s]/gu, ''),
  );

const joinThousands = (text: string): string => text.replace(/(?<=\d)[\s](?=\d{3}(?!\d))/gu, '');

/** Утверждение само говорит, что нормы нет в базе: это честное признание, а не выдумка. */
const ABSENCE_PATTERN = /нет в (?:моей )?базе|в базе нет|вне базы|не найден|не нашёл|не нашел/iu;

/** Утверждение о том, что нормы или исключения в тексте нет: идентификатора у него быть не может. */
const NORM_ABSENT_PATTERN =
  /(?:в\s+(?:нормах|базе|тексте|законе|нём|ней|статье)|исключени[яй])[^.;]{0,50}\s(?:нет|отсутствуют?)(?![\p{L}])/iu;

const SUMMARY_HEADING = /^(?:кратко|коротко|резюме|итог(?:и|о)?)(?![\p{L}])/iu;
const HEADING_LINE = /^\s*(?:#{1,6}\s+|\*\*[^*]+\*\*:?\s*$|-{3,}\s*$)/u;

/** Номера строк раздела «Кратко»: от его заголовка до следующего заголовка или разделителя. */
function summarySectionLines(rawLines: readonly string[]): Set<number> {
  const inside = new Set<number>();
  let open = false;
  rawLines.forEach((line, index) => {
    if (HEADING_LINE.test(line)) {
      open = SUMMARY_HEADING.test(stripMarkdown(line));
      return;
    }
    if (open) inside.add(index);
  });
  return inside;
}

export function createVerifyAnswer(deps: VerifyAnswerDeps): VerifyAnswer {
  return {
    async verify(input) {
      const parsed = parseWith(answerSchema, input, 'Некорректный текст ответа');
      if (!parsed.ok) return parsed;
      return ok(await verifyText(deps.norms, parsed.value));
    },
  };
}

async function verifyText(norms: NormRepository, answer: string): Promise<VerificationReport> {
  const issues: VerificationIssue[] = [];
  const report = (
    code: VerificationCode,
    severity: VerificationSeverity,
    message: string,
    excerpt?: string,
  ): void => {
    issues.push({ code, severity, message, ...(excerpt !== undefined && { excerpt }) });
  };

  const rawLines = answer.split(/\r?\n/u);
  const lastLine = [...rawLines].reverse().find((line) => line.trim() !== '');
  const disclaimerAt = rawLines.findIndex((line) => stripMarkdown(line) === LEGAL_DISCLAIMER);
  if (disclaimerAt === -1) {
    report(
      'disclaimer-missing',
      'error',
      `В ответе нет дисклеймера дословно: «${LEGAL_DISCLAIMER}»`,
    );
  } else if (lastLine === undefined || stripMarkdown(lastLine) !== LEGAL_DISCLAIMER) {
    report('disclaimer-not-last', 'warning', 'Дисклеймер должен быть последней строкой ответа');
  }

  const bodyLines = rawLines.filter((_, index) => index !== disclaimerAt);
  const lines = bodyLines.map((line) => stripMarkdown(line));

  const indentOf = (lineIndex: number): number =>
    (bodyLines[lineIndex] ?? '').length - (bodyLines[lineIndex] ?? '').trimStart().length;
  const summaryLines = summarySectionLines(bodyLines);

  const cache = new Map<string, Norm | null>();
  const load = async (id: string): Promise<Norm | null> => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const normId = parseNormId(id);
    const found = normId.ok ? await norms.get(normId.value) : undefined;
    const norm = found?.ok ? found.value : null;
    cache.set(id, norm);
    return norm;
  };

  const idsByLine = bodyLines.map((line) => extractNormIds(line));
  const refsByLine = lines.map((line) => extractProseRefs(line));

  // Нормы: каждый идентификатор и каждая ссылка словами должны существовать в базе.
  // Если утверждение само признаёт, что нормы в базе нет, это предупреждение, а не ошибка.
  const missingSeverity = (lineIndex: number): VerificationSeverity =>
    ABSENCE_PATTERN.test(lines[lineIndex] ?? '') ? 'warning' : 'error';

  const reportedMissing = new Set<string>();
  for (const [index, ids] of idsByLine.entries()) {
    for (const id of ids) {
      if (!(await load(id)) && !reportedMissing.has(id)) {
        reportedMissing.add(id);
        report(
          'unknown-norm-id',
          missingSeverity(index),
          `Нормы «${id}» нет в базе: идентификатор выдуман или составлен по памяти`,
          excerptOf(lines[index] ?? ''),
        );
      }
    }
  }
  for (const [index, refs] of refsByLine.entries()) {
    for (const ref of refs) {
      if (!(await load(ref.id)) && !reportedMissing.has(ref.id)) {
        reportedMissing.add(ref.id);
        report(
          'unknown-prose-ref',
          missingSeverity(index),
          `Ссылка «${ref.text}» указывает на «${ref.id}», которой нет в базе`,
          excerptOf(lines[index] ?? ''),
        );
      }
    }
  }

  lines.forEach((line, index) => {
    const ids = idsByLine[index] ?? [];
    for (const ref of refsByLine[index] ?? []) {
      const [refArticle = ''] = ref.id.split('/part-');
      const related = ids.filter((id) => id === refArticle || id.startsWith(`${refArticle}/`));
      const consistent = related.some(
        (id) => id === ref.id || id.startsWith(`${ref.id}/`) || ref.id.startsWith(`${id}/`),
      );
      if (consistent) continue;
      if (related.length > 0) {
        // Та же статья, но другая часть: ссылка и идентификатор называют разные нормы.
        report(
          'ref-id-mismatch',
          'error',
          `Ссылка «${ref.text}» обозначает «${ref.id}», а в строке указано: ${related.join(', ')}`,
          excerptOf(line),
        );
      } else {
        report(
          'ref-without-id',
          'warning',
          `Ссылка «${ref.text}» без идентификатора из базы в той же строке`,
          excerptOf(line),
        );
      }
    }
  });

  const normsOfLine = async (lineIndex: number): Promise<Norm[]> => {
    const ids = new Set([
      ...(idsByLine[lineIndex] ?? []),
      ...(refsByLine[lineIndex] ?? []).map((ref) => ref.id),
    ]);
    const loaded = await Promise.all([...ids].map((id) => load(id)));
    return loaded.filter((norm): norm is Norm => norm !== null);
  };
  /** Нормы строки; если в ней их нет — нормы ближайших непустых строк выше (пункт списка под заголовком нормы). */
  const citedNorms = async (lineIndex: number): Promise<Norm[]> => {
    const own = await normsOfLine(lineIndex);
    if (own.length > 0) return own;
    let seen = 0;
    for (let previous = lineIndex - 1; previous >= 0 && seen < LOOKBACK_LINES; previous -= 1) {
      if ((lines[previous] ?? '') === '') continue;
      seen += 1;
      const found = await normsOfLine(previous);
      if (found.length > 0) return found;
    }
    // Вложенность списка: пункт опирается на нормы родительского пункта, а заголовок пункта — на нормы дочерних.
    const indent = indentOf(lineIndex);
    let limit = indent;
    for (let previous = lineIndex - 1; previous >= 0 && limit > 0; previous -= 1) {
      if ((lines[previous] ?? '') === '' || indentOf(previous) >= limit) continue;
      limit = indentOf(previous);
      const found = await normsOfLine(previous);
      if (found.length > 0) return found;
    }
    for (let next = lineIndex + 1; next < lines.length; next += 1) {
      if ((lines[next] ?? '') === '') continue;
      if (indentOf(next) <= indent) break;
      const found = await normsOfLine(next);
      if (found.length > 0) return found;
    }
    return [];
  };

  const allIds = new Set([...idsByLine.flat(), ...refsByLine.flat().map((ref) => ref.id)]);
  const allNorms = [...allIds]
    .map((id) => cache.get(id))
    .filter((norm): norm is Norm => norm !== null && norm !== undefined);
  if (
    allNorms.some((norm) => norm.sourceType === 'secondary') &&
    !/КонсультантПлюс/iu.test(answer)
  ) {
    report(
      'secondary-source-undisclosed',
      'error',
      'Среди норм есть текст из вторичного источника (КонсультантПлюс), но ответ об этом не сообщает',
    );
  }

  // Дата редакции рядом с идентификатором должна совпадать с базой.
  for (const [index, line] of lines.entries()) {
    const dates = [...line.matchAll(/редакци[яи]\s+от\s+(\d{2})\.(\d{2})\.(\d{4})/giu)];
    if (dates.length === 0) continue;
    // Одна дата в строке относится к нормам этой строки; несколько дат («152-ФЗ — от …, КоАП — от …») —
    // к нормам всего ответа.
    const cited = dates.length === 1 ? await normsOfLine(index) : allNorms;
    for (const date of dates) {
      const iso = `${date[3] ?? ''}-${date[2] ?? ''}-${date[1] ?? ''}`;
      if (cited.length > 0 && !cited.some((norm) => norm.editionDate === iso)) {
        report(
          'edition-date-mismatch',
          'error',
          `Дата редакции ${date[1] ?? ''}.${date[2] ?? ''}.${date[3] ?? ''} не совпадает с базой: ${cited
            .map((norm) => `${norm.id} — ${norm.editionDate}`)
            .join('; ')}`,
          excerptOf(line),
        );
      }
    }
  }

  // Цитаты: слова в «ёлочках» должны быть в тексте процитированных норм.
  const quotes = extractQuotes(lines);
  for (const quote of quotes) {
    const nearby = await citedNorms(quote.line);
    if (nearby.some((norm) => containsText(norm.text, quote.text))) continue;

    const known = [...cache.values()].filter((norm): norm is Norm => norm !== null);
    let other = known.find((norm) => containsText(norm.text, quote.text));
    if (!other) {
      const hits = await norms.search({
        text: normalizeForMatch(quote.text).split(' ').slice(0, MAX_SEARCH_WORDS).join(' '),
        limit: SEARCH_LIMIT,
      });
      const candidates = await Promise.all(hits.map((hit) => load(hit.id)));
      other =
        candidates.find((norm) => norm !== null && containsText(norm.text, quote.text)) ??
        undefined;
    }

    if (other) {
      report(
        'quote-from-other-norm',
        'warning',
        `Цитата есть в «${other.id}», но не в нормах, указанных рядом: укажите правильный идентификатор`,
        excerptOf(quote.text),
      );
    } else if (nearby.length > 0) {
      // Ошибка, когда ответ выдаёт текст за норму ([в норме]); иначе это может быть пересказ в кавычках.
      const claimsNorm = extractLabels(lines[quote.line] ?? '').includes('в норме');
      report(
        'quote-not-in-norm',
        claimsNorm ? 'error' : 'warning',
        'Цитаты нет дословно в тексте указанных рядом норм: она изменена, пересказана или выдумана',
        excerptOf(quote.text),
      );
    } else {
      report(
        'quote-not-in-norm',
        'warning',
        'Цитата не найдена в базе; если это пример формулировки, не выдавайте её за цитату нормы',
        excerptOf(quote.text),
      );
    }
  }

  // Метки уверенности.
  const statements: Statement[] = lines.flatMap((line, index) =>
    splitStatements(line).map((text) => ({ text, line: index, labels: extractLabels(text) })),
  );
  const labeled = statements.filter((statement) => statement.labels.length > 0);
  if (labeled.length === 0) {
    report(
      'no-labels',
      'error',
      'В ответе нет ни одной метки уверенности: [в норме], [вывод], [спорно], [вне базы]',
    );
  }

  for (const statement of labeled) {
    const cited = await citedNorms(statement.line);
    const body = stripLabels(statement.text).trim();
    if (statement.labels.includes('в норме')) {
      if (cited.length === 0) {
        if (NORM_ABSENT_PATTERN.test(body)) {
          report(
            'label-needs-norm',
            'warning',
            'Утверждение об отсутствии нормы помечено [в норме]: проверьте, не нужна ли [вывод] или [вне базы]',
            excerptOf(body),
          );
        } else if (summaryLines.has(statement.line) && allNorms.length > 0) {
          report(
            'label-needs-norm',
            'warning',
            'В кратком резюме [в норме] без идентификатора: норма должна быть названа в основной части ответа',
            excerptOf(body),
          );
        } else {
          report(
            'label-needs-norm',
            'error',
            'Метка [в норме] без идентификатора существующей нормы в строке',
            excerptOf(body),
          );
        }
        continue;
      }
      if (OUTSIDE_BASE_PATTERN.test(stripReferences(body))) {
        report(
          'in-norm-outside-base',
          'warning',
          'Метка [в норме], но речь о практике, разъяснениях, приказах или иностранном праве: возможно, нужна [вне базы]',
          excerptOf(body),
        );
      }
      const text = cited
        .map((norm) => ` ${normalizeForMatch(joinThousands(norm.text))} `)
        .join(' ');
      for (const number of new Set(numbersIn(body))) {
        if (!text.includes(` ${normalizeForMatch(number)} `)) {
          report(
            'number-not-in-norm',
            'warning',
            `Числа ${number} нет в тексте указанных норм (возможно, в норме оно прописью): проверьте вручную`,
            excerptOf(body),
          );
        }
      }
    } else if (statement.labels.includes('вывод') && cited.length === 0) {
      report(
        'inference-without-norm',
        'warning',
        'Метка [вывод] без названных норм: назовите нормы и шаг рассуждения',
        excerptOf(body),
      );
    }
  }

  const unlabeled = statements.filter(
    (statement) =>
      statement.labels.length === 0 &&
      statement.text.split(/\s+/u).length >= MIN_STATEMENT_WORDS &&
      !statement.text.endsWith('?') &&
      !statement.text.endsWith(':') &&
      (extractProseRefs(statement.text).length > 0 ||
        extractNormIds(statement.text).length > 0 ||
        SUBSTANTIVE_PATTERN.test(statement.text)),
  );
  for (const statement of unlabeled) {
    report(
      'missing-label',
      'warning',
      'Утверждение по существу без метки уверенности',
      excerptOf(statement.text),
    );
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
    checked: {
      normIds: allIds.size,
      quotes: quotes.length,
      labeledStatements: labeled.length,
      unlabeledStatements: unlabeled.length,
    },
    notChecked: NOT_CHECKED_BY_VERIFICATION,
  };
}
