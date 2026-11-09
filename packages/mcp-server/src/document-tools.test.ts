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
    expect(templates.map((t) => t.id)).toHaveLength(20);
    expect(templates.find((t) => t.id === 'acknowledgment-sheet')?.requiredFields).toContain(
      'acknowledgmentSheet',
    );
    expect(templates.find((t) => t.id === 'visitor-log-act')?.requiredFields).toContain(
      'visitorLog',
    );
    expect(templates.find((t) => t.id === 'security-officer-order')?.requiredFields).toContain(
      'securityOfficerOrder',
    );
    expect(templates.find((t) => t.id === 'internal-control-rules')?.requiredFields).toContain(
      'internalControlRules',
    );
    expect(templates.find((t) => t.id === 'processing-regulation')?.requiredFields).toContain(
      'processingRegulation',
    );
    expect(templates.find((t) => t.id === 'processing-agreement')?.requiredFields).toContain(
      'processingAgreement',
    );
    expect(templates.find((t) => t.id === 'harm-assessment')?.requiredFields).toContain(
      'harmAssessment',
    );
    expect(templates.find((t) => t.id === 'destruction-act')?.requiredFields).toContain(
      'destructionAct',
    );
    expect(templates.find((t) => t.id === 'rkn-notification')?.requiredFields).toContain(
      'processingStartDate',
    );
    expect(textOf(result)).toContain('ч. 2 ст. 18.1 152-ФЗ');
  });

  it('render_document принимает поля каждого раздела: схема входа не режет их молча', async () => {
    const result = await render('incident-notification', FULL_REFERENCE_PROFILE);
    expect(result.isError).toBeFalsy();
    const { markdown } = result.structuredContent as { markdown: string };
    expect(markdown).toContain('открытое хранилище резервных копий');
    expect(markdown).toContain('Петрова Анна Сергеевна');
  });

  it('render_document заполняет шаблон и предлагает путь в проекте', async () => {
    const result = await render('privacy-policy', FULL_REFERENCE_PROFILE);
    expect(result.isError).toBeFalsy();
    const document = result.structuredContent as {
      markdown: string;
      disclaimer: string;
      suggestedPath: string;
    };
    expect(document.suggestedPath).toBe('docs/152-fz/privacy-policy.md');
    expect(document.markdown).toContain('Оператор: ООО «Ромашка»');
    expect(document.markdown).toContain('Редакция от 02.11.2026');
    // Политику публикуют как есть: дисклеймер плагина не должен попасть на сайт оператора.
    expect(document.disclaimer).toBe(LEGAL_DISCLAIMER);
    expect(document.markdown).not.toContain(LEGAL_DISCLAIMER);
    const text = textOf(result);
    expect(text).toMatch(/^Предлагаемый путь: docs\/152-fz\/privacy-policy\.md\n\n=== ТЕКСТ/);
    expect(text.indexOf(LEGAL_DISCLAIMER)).toBeGreaterThan(text.indexOf('=== КОНЕЦ ДОКУМЕНТА ==='));
  });

  it('предупреждения идут отдельно от текста документа', async () => {
    const result = await render('privacy-policy', {
      ...FULL_REFERENCE_PROFILE,
      implementedMeasures: [],
    });
    const document = result.structuredContent as { markdown: string; warnings: string[] };
    expect(document.warnings.join()).toContain('оценка вреда');
    expect(document.markdown).not.toContain('Не подтверждены');
    expect(textOf(result)).toContain('Предупреждения (покажи пользователю');
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
