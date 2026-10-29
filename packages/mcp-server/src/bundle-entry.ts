/**
 * Точка входа бандла плагина (ADR-0005): база норм и шаблоны документов вшиты при сборке
 * через `define`, поэтому сервер не читает диск и работает офлайн.
 */
import type { TemplateFile } from '@lawyer-152fz/documents';
import type { KnowledgeFile } from '@lawyer-152fz/knowledge';

import { runStdioServer } from './run';

declare const __EMBEDDED_KNOWLEDGE_FILES__: readonly KnowledgeFile[];
declare const __EMBEDDED_TEMPLATE_FILES__: readonly TemplateFile[];

await runStdioServer({
  knowledgeFiles: __EMBEDDED_KNOWLEDGE_FILES__,
  templateFiles: __EMBEDDED_TEMPLATE_FILES__,
});
