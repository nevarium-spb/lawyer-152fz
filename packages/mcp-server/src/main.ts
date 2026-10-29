/** Запуск из исходников (разработка): база норм и шаблоны читаются из каталогов пакетов. */
import { readTemplateFiles } from '@lawyer-152fz/documents';
import { readKnowledgeFiles } from '@lawyer-152fz/knowledge';

import { runStdioServer } from './run';

await runStdioServer({
  knowledgeFiles: await readKnowledgeFiles(),
  templateFiles: await readTemplateFiles(),
});
