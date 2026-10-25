import type { KnowledgeBase } from '@lawyer-152fz/knowledge';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const KB_INFO_URI = 'lawyer://kb/info';

/** Сводка базы норм: версия, акты, даты редакций и тип источника. */
export interface KbInfo {
  readonly kbVersion: string;
  readonly normCount: number;
  readonly acts: readonly {
    readonly id: string;
    readonly title: string;
    readonly editionDate: string;
    readonly sourceType: 'official' | 'secondary';
  }[];
}

export function describeKnowledgeBase(knowledgeBase: KnowledgeBase): KbInfo {
  return {
    kbVersion: knowledgeBase.kbVersion,
    normCount: knowledgeBase.norms.length,
    acts: knowledgeBase.acts.map((act) => ({
      id: act.id,
      title: act.title,
      editionDate: act.editionDate,
      sourceType: act.source.type,
    })),
  };
}

export function registerKbInfo(server: McpServer, info: KbInfo): void {
  server.registerResource(
    'kb-info',
    KB_INFO_URI,
    {
      title: 'База норм: версия и состав',
      description:
        'Версия базы, акты, даты их редакций и тип источника (официальный или вторичный).',
      mimeType: 'application/json',
    },
    (uri) =>
      Promise.resolve({
        contents: [
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(info, null, 2) },
        ],
      }),
  );
}
