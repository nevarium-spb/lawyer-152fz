import { LEGAL_DISCLAIMER } from '@lawyer-152fz/core';
import {
  FULL_REFERENCE_PROFILE,
  MINIMAL_REFERENCE_PROFILE,
  readTemplateFiles,
} from '@lawyer-152fz/documents';
import { readKnowledgeFiles } from '@lawyer-152fz/knowledge';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeAll, describe, expect, it } from 'vitest';

import { composeServer } from './compose';

let client: Client;

beforeAll(async () => {
  const composed = composeServer(
    { knowledgeFiles: await readKnowledgeFiles(), templateFiles: await readTemplateFiles() },
    { now: () => new Date('2026-11-02T09:00:00Z') },
  );
  if (!composed.ok) throw new Error(composed.error.message);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await composed.value.server.connect(serverTransport);
  client = new Client({ name: 'documents-test', version: '0.0.0' });
  await client.connect(clientTransport);
});

type CallResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (result: CallResult) => (result.content as { text?: string }[])[0]?.text ?? '';
const render = (templateId: string, profile: unknown) =>
  client.callTool({ name: 'render_document', arguments: { templateId, profile } });

describe('инструменты документов (T6.4)', () => {
  it('list_document_templates перечисляет шаблоны с обязательными полями', async () => {
    const result = await client.callTool({ name: 'list_document_templates', arguments: {} });
    const { templates } = result.structuredContent as {
      templates: { id: string; requiredFields: string[] }[];
    };
    expect(templates.map((t) => t.id)).toHaveLength(5);
    expect(templates.find((t) => t.id === 'rkn-notification')?.requiredFields).toContain(
      'processingStartDate',
    );
    expect(textOf(result)).toContain('ч. 2 ст. 18.1 152-ФЗ');
  });

  it('render_document заполняет шаблон и предлагает путь в проекте', async () => {
    const result = await render('privacy-policy', FULL_REFERENCE_PROFILE);
    expect(result.isError).toBeFalsy();
    const document = result.structuredContent as { markdown: string; suggestedPath: string };
    expect(document.suggestedPath).toBe('docs/152-fz/privacy-policy.md');
    expect(document.markdown).toContain('Оператор: ООО «Ромашка»');
    expect(document.markdown).toContain('Редакция от 02.11.2026');
    expect(document.markdown.trimEnd().endsWith(`_${LEGAL_DISCLAIMER}_`)).toBe(true);
    expect(textOf(result)).toMatch(/^Предлагаемый путь: docs\/152-fz\/privacy-policy\.md\n\n# /);
  });

  it('пустой профиль — все недостающие поля одним сообщением, по-русски', async () => {
    const result = await render('privacy-policy', {});
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('Для документа «Политика в отношении обработки персональных данных»');
    for (const field of ['name', 'inn', 'legalAddress', 'purposes', 'databaseLocation']) {
      expect(text).toContain(`- ${field}: `);
    }
  });

  it('уведомление в РКН требует свои поля', async () => {
    const result = await render('rkn-notification', MINIMAL_REFERENCE_PROFILE);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('- protectionLevel: Укажите уровень защищённости');
  });

  it('неизвестный шаблон — понятная ошибка', async () => {
    const result = await render('nda', FULL_REFERENCE_PROFILE);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('nda');
  });
});
