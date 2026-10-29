/**
 * Строгий рендерер подмножества Mustache (ADR-0013): `{{имя}}`, `{{а.б}}`, `{{.}}`,
 * секции `{{#имя}}…{{/имя}}`, инвертированные `{{^имя}}…{{/имя}}` и `{{! комментарии }}`.
 * Неизвестное имя, пустое значение или объект вместо текста — ошибка, а не пропуск в документе.
 */

type Node =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'value'; readonly name: string; readonly line: number }
  | {
      readonly kind: 'section';
      readonly name: string;
      readonly inverted: boolean;
      readonly line: number;
      readonly children: readonly Node[];
    };

export type CompiledTemplate = readonly Node[];

export class TemplateError extends Error {
  override readonly name = 'TemplateError';
}

const TAG = /\{\{([#^/!]?)\s*([^{}]*?)\s*\}\}/g;
const NAME = /^(?:\.|[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)$/;

const lineAt = (source: string, offset: number) => source.slice(0, offset).split('\n').length;

/**
 * Тег секции или комментария один на строке — строка удаляется целиком, как в спецификации
 * Mustache: иначе Markdown документа зарастал бы пустыми строками.
 */
function standalone(source: string, start: number, end: number): [number, number] | undefined {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const newline = source.indexOf('\n', end);
  const lineEnd = newline === -1 ? source.length : newline + 1;
  const before = source.slice(lineStart, start);
  const after = source.slice(end, newline === -1 ? source.length : newline);
  return /^[ \t]*$/.test(before) && /^[ \t\r]*$/.test(after) ? [lineStart, lineEnd] : undefined;
}

export function compileTemplate(source: string): CompiledTemplate {
  if (source.includes('{{{')) throw new TemplateError('Тройные скобки {{{ }}} запрещены');

  const root: Node[] = [];
  const stack: { name: string; inverted: boolean; line: number; children: Node[] }[] = [];
  const current = () => stack.at(-1)?.children ?? root;
  let cursor = 0;

  for (const match of source.matchAll(TAG)) {
    const [tag, sigil = '', name = ''] = match;
    const line = lineAt(source, match.index);
    const [start, end] = (sigil === ''
      ? undefined
      : standalone(source, match.index, match.index + tag.length)) ?? [
      match.index,
      match.index + tag.length,
    ];

    if (start > cursor) current().push({ kind: 'text', text: source.slice(cursor, start) });
    cursor = end;

    if (sigil === '!') continue;
    if (!NAME.test(name)) {
      throw new TemplateError(`Строка ${String(line)}: некорректная метка «${tag}»`);
    }

    if (sigil === '#' || sigil === '^') {
      stack.push({ name, inverted: sigil === '^', line, children: [] });
    } else if (sigil === '/') {
      const open = stack.pop();
      if (open?.name !== name) {
        const opened = open ? `секцию {{#${open.name}}}` : 'несуществующую секцию';
        throw new TemplateError(`Строка ${String(line)}: {{/${name}}} закрывает ${opened}`);
      }
      current().push({ kind: 'section', ...open });
    } else {
      current().push({ kind: 'value', name, line });
    }
  }

  const unclosed = stack.at(-1);
  if (unclosed) {
    throw new TemplateError(
      `Строка ${String(unclosed.line)}: секция {{#${unclosed.name}}} не закрыта`,
    );
  }
  if (cursor < source.length) root.push({ kind: 'text', text: source.slice(cursor) });
  return root;
}

/** Служебные символы Markdown и HTML экранируются: данные профиля не становятся разметкой. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_`[\]<>#|]/g, '\\$&');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const unknownName = (name: string, line: number) =>
  new TemplateError(`Строка ${String(line)}: неизвестная метка {{${name}}}`);

function lookup(stack: readonly unknown[], name: string, line: number): unknown {
  if (name === '.') return stack.at(-1);

  const [head = '', ...rest] = name.split('.');
  const scope = stack.findLast((frame) => isRecord(frame) && head in frame);
  if (!isRecord(scope)) throw unknownName(name, line);

  let value: unknown = scope[head];
  for (const key of rest) {
    if (!isRecord(value) || !(key in value)) throw unknownName(name, line);
    value = value[key];
  }
  return value;
}

const isTruthy = (value: unknown) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

function renderValue(value: unknown, name: string, line: number): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value !== '') return escapeMarkdown(value);

  const problem = value === '' || value == null ? 'пустое значение' : 'не текст';
  throw new TemplateError(`Строка ${String(line)}: {{${name}}} — ${problem}`);
}

function renderNodes(nodes: readonly Node[], stack: readonly unknown[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.kind === 'text') {
      out += node.text;
      continue;
    }

    const value = lookup(stack, node.name, node.line);
    if (node.kind === 'value') {
      out += renderValue(value, node.name, node.line);
    } else if (node.inverted) {
      if (!isTruthy(value)) out += renderNodes(node.children, stack);
    } else if (Array.isArray(value)) {
      for (const item of value) out += renderNodes(node.children, [...stack, item]);
    } else if (isTruthy(value)) {
      out += renderNodes(node.children, isRecord(value) ? [...stack, value] : stack);
    }
  }
  return out;
}

/** Заполняет шаблон; бросает `TemplateError`, если представление не подходит шаблону. */
export function renderTemplate(
  template: CompiledTemplate,
  view: Readonly<Record<string, unknown>>,
): string {
  return renderNodes(template, [view]);
}
