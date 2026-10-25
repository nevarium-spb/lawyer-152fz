/**
 * Точка входа бандла плагина (ADR-0005): база норм вшита при сборке через `define`,
 * поэтому сервер не читает диск и работает офлайн.
 */
import type { KnowledgeFile } from '@lawyer-152fz/knowledge';

import { runStdioServer } from './run';

declare const __EMBEDDED_KNOWLEDGE_FILES__: readonly KnowledgeFile[];

await runStdioServer(__EMBEDDED_KNOWLEDGE_FILES__);
