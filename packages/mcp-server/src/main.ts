/** Запуск из исходников (разработка): база норм читается из каталога пакета knowledge. */
import { readKnowledgeFiles } from '@lawyer-152fz/knowledge';

import { runStdioServer } from './run';

await runStdioServer(await readKnowledgeFiles());
