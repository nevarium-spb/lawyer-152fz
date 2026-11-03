import type { VerifyAnswer } from '@lawyer-152fz/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatError, formatVerification } from './format';

const issueShape = z.object({
  code: z.string(),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  excerpt: z.string().optional(),
});

const reportShape = {
  ok: z.boolean(),
  issues: z.array(issueShape),
  checked: z.object({
    normIds: z.number(),
    quotes: z.number(),
    labeledStatements: z.number(),
    unlabeledStatements: z.number(),
  }),
  notChecked: z.array(z.string()),
};

export function registerVerifyTools(server: McpServer, verifier: VerifyAnswer): void {
  server.registerTool(
    'verify_answer',
    {
      title: 'Сверка ответа с базой норм',
      description:
        'Проверяет черновик ответа юриста кодом по базе: каждый идентификатор нормы и ссылка «ч. N ст. M» ' +
        'существуют, цитаты в «ёлочках» дословно есть в тексте норм, дата редакции совпадает, у [в норме] ' +
        'есть существующая норма, у утверждений по существу есть метки, в конце дисклеймер. Вызывай на ' +
        'готовом ответе перед отправкой пользователю; исправь все error и повтори. Не проверяет верность ' +
        'толкования. / Verifies a draft answer against the norm base: ids, quotes, labels, disclaimer.',
      inputSchema: {
        answer: z
          .string()
          .describe('Полный текст ответа пользователю в Markdown, как он будет отправлен'),
      },
      outputSchema: reportShape,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ answer }) => {
      const result = await verifier.verify(answer);
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: formatError(result.error) }],
        };
      }
      const report = result.value;
      return {
        content: [{ type: 'text' as const, text: formatVerification(report) }],
        structuredContent: {
          ok: report.ok,
          issues: report.issues.map((issue) => ({ ...issue })),
          checked: { ...report.checked },
          notChecked: [...report.notChecked],
        },
      };
    },
  );
}
