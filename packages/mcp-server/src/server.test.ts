import { LEGAL_DISCLAIMER } from '@lawyer-152fz/core';
import { createDocumentTemplates, readTemplateFiles } from '@lawyer-152fz/documents';
import type { TemplateFile } from '@lawyer-152fz/documents';
import { buildKnowledgeBase, readKnowledgeFiles } from '@lawyer-152fz/knowledge';
import type { KnowledgeFile } from '@lawyer-152fz/knowledge';
import { CODEBASE_RULES, SITE_RULES } from '@lawyer-152fz/rules';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeAll, describe, expect, it } from 'vitest';

import { composeServer } from './compose';
import { findMissingNormRefs } from './integrity';
import { KB_INFO_URI } from './kb-info';

let files: KnowledgeFile[];
let templateFiles: TemplateFile[];
let client: Client;

beforeAll(async () => {
  files = await readKnowledgeFiles();
  templateFiles = await readTemplateFiles();
  const composed = composeServer(
    { knowledgeFiles: files, templateFiles },
    { now: () => new Date('2026-10-25T10:00:00Z') },
  );
  if (!composed.ok) throw new Error(composed.error.message);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await composed.value.server.connect(serverTransport);
  client = new Client({ name: 'lawyer-152fz-test', version: '0.0.0' });
  await client.connect(clientTransport);
});

type CallResult = Awaited<ReturnType<Client['callTool']>>;

const textOf = (result: CallResult): string =>
  (result.content as { type: string; text?: string }[])[0]?.text ?? '';

const call = (name: string, args: Record<string, unknown>) =>
  client.callTool({ name, arguments: args });

describe('контракт MCP-инструментов (T3.3)', () => {
  it('схемы, описания и аннотации инструментов не меняются незаметно', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'search_norms',
      'get_norm',
      'check_norm_freshness',
      'audit_site',
      'audit_html',
      'audit_codebase',
      'list_document_templates',
      'render_document',
    ]);
    expect(tools).toMatchSnapshot();
  });
});

describe('инструкции сервера', () => {
  it('требуют базы вместо памяти, идентификаторов норм и дисклеймера', () => {
    const instructions = client.getInstructions() ?? '';
    expect(instructions).toContain('Не отвечай по памяти');
    expect(instructions).toContain('lawyer-152fz');
    expect(instructions).toContain('`152-fz/art-18/part-5`');
    expect(instructions).toContain(LEGAL_DISCLAIMER);
    expect(instructions).toContain('audit_html');
    expect(instructions).toContain('только после его согласия');
    expect(instructions).toContain('check_norm_freshness');
    expect(instructions).toContain('GDPR');
    for (const label of ['[в норме]', '[вывод]', '[спорно]', '[вне базы]']) {
      expect(instructions).toContain(label);
    }
  });
});

describe('search_norms', () => {
  it('находит норму по бытовому термину и подсказывает получить полный текст', async () => {
    const result = await call('search_norms', { text: 'локализация баз данных', limit: 3 });
    const { hits } = result.structuredContent as { hits: { id: string }[] };
    expect(hits.map((hit) => hit.id)).toContain('152-fz/art-18/part-5');
    expect(textOf(result)).toContain('get_norm');
  });

  it('ошибки валидации — на русском, с указанием поля', async () => {
    const result = await call('search_norms', { text: 'а' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('text: Запрос слишком короткий');
  });
});

describe('get_norm', () => {
  it('официальная норма — с датой редакции и официальным источником', async () => {
    const result = await call('get_norm', { id: '152-fz/art-18/part-5' });
    const { norm } = result.structuredContent as { norm: { sourceType: string; text: string } };
    expect(norm.sourceType).toBe('official');
    expect(norm.text).toMatch(/^5\. При сборе персональных данных/);
    expect(textOf(result)).toMatch(/Редакция от: \d{4}-\d{2}-\d{2}/);
    expect(textOf(result)).toContain('Источник: официальный портал правовой информации');
  });

  it('вторичный источник раскрывается прямо в ответе (ADR-0012)', async () => {
    const text = textOf(await call('get_norm', { id: 'pp-1119/item-13' }));
    expect(text).toContain('⚠ Вторичный источник (КонсультантПлюс)');
    expect(text).toContain('«Российская газета», 07.11.2012, № 256');
    expect(text).toContain('сообщите пользователю');
  });

  it.each([
    ['ст. 18', 'например 152-fz/art-18/part-5'],
    ['152-fz/art-99', 'не найдена в базе'],
  ])('«%s» — понятная ошибка', async (id, fragment) => {
    const result = await call('get_norm', { id });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(fragment);
  });
});

describe('ресурс lawyer://kb/info', () => {
  it('отдаёт версию базы, акты и тип источника', async () => {
    const { contents } = await client.readResource({ uri: KB_INFO_URI });
    const info = JSON.parse((contents[0] as { text: string }).text) as {
      kbVersion: string;
      normCount: number;
      acts: { id: string; sourceType: string }[];
    };
    expect(info.kbVersion).toMatch(/^kb-\d{4}\.\d{2}\.\d{2}$/);
    expect(info.acts.map((act) => act.id).sort()).toEqual(['152-fz', 'koap', 'pp-1119', 'pp-687']);
    expect(info.acts.find((act) => act.id === 'pp-1119')?.sourceType).toBe('secondary');
    expect(info.normCount).toBeGreaterThan(250);
  });
});

describe('ссылочная целостность правил и шаблонов (T3.3)', () => {
  const existingIds = () => {
    const knowledgeBase = buildKnowledgeBase(files);
    if (!knowledgeBase.ok) throw new Error(knowledgeBase.error.message);
    return new Set<string>(knowledgeBase.value.norms.map((norm) => norm.id));
  };

  it('все нормы, на которые ссылаются правила аудита, есть в базе', () => {
    expect(findMissingNormRefs([...SITE_RULES, ...CODEBASE_RULES], existingIds())).toEqual([]);
  });

  it('все нормы, на которые ссылаются шаблоны документов, есть в базе', () => {
    const templates = createDocumentTemplates(templateFiles);
    if (!templates.ok) throw new Error(templates.error.message);
    expect(findMissingNormRefs(templates.value.list(), existingIds())).toEqual([]);
  });
});
