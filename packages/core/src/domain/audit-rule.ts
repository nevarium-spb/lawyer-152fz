import type { Finding } from './finding';
import type { NormId } from './norm-id';
import type { CodebaseSnapshot, SiteSnapshot } from './snapshots';

/**
 * Правило аудита (ADR-0004): чистая функция над снимком, без I/O.
 * Находки правила могут ссылаться только на нормы из `normRefs` —
 * так проверка ссылочной целостности базы покрывает и находки.
 */
export interface AuditRule<TSnapshot> {
  readonly id: string;
  readonly title: string;
  readonly normRefs: readonly NormId[];
  check(snapshot: TSnapshot): readonly Finding[];
}

export type SiteRule = AuditRule<SiteSnapshot>;
export type CodebaseRule = AuditRule<CodebaseSnapshot>;
