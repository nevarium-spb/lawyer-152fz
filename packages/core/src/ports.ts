/**
 * Порты — интерфейсы, через которые ядро получает данные извне (ADR-0002).
 * Реализации (адаптеры) живут в других пакетах и подключаются в точке сборки.
 * Здесь только типы: ноль импортов I/O.
 */
import type { NormId } from './domain/norm-id';
import type { Norm } from './domain/norm';
import type { OperatorProfile } from './domain/operator-profile';
import type { CodebaseSnapshot, PageSnapshot, SiteSnapshot } from './domain/snapshots';
import type { ForbiddenError, NotFoundError, SourceUnavailableError } from './shared/errors';
import type { Result } from './shared/result';

// ─── База норм — реализует packages/knowledge ────────────────────────────────

export interface NormSearchQuery {
  readonly text: string;
  /** Ограничить поиск актами, например `['152-fz', 'koap']`. */
  readonly acts?: readonly string[] | undefined;
  readonly limit: number;
}

export interface NormSearchHit {
  readonly id: NormId;
  readonly heading: string;
  /** Короткий фрагмент текста для выбора; цитировать — только полный текст из `get`. */
  readonly snippet: string;
  readonly editionDate: string;
  readonly score: number;
}

export interface NormRepository {
  /** Версия базы норм, например `kb-2026.10.24`. */
  readonly kbVersion: string;
  get(id: NormId): Promise<Result<Norm, NotFoundError>>;
  /** Результаты отсортированы по убыванию релевантности, не длиннее `limit`. */
  search(query: NormSearchQuery): Promise<readonly NormSearchHit[]>;
}

export type FreshnessStatus = 'fresh' | 'stale' | 'unknown';

export interface FreshnessReport {
  readonly id: NormId;
  readonly status: FreshnessStatus;
  /** Момент проверки, ISO 8601 UTC. */
  readonly checkedAt: string;
  readonly detail?: string;
}

/**
 * Сверка нормы с официальным источником. Никогда не бросает исключений и не выдаёт
 * «fresh» без проверки: недоступный источник — это `unknown` (ADR-0003).
 */
export interface SourceFreshnessChecker {
  check(norm: Norm): Promise<FreshnessReport>;
}

// ─── Сканирование — реализует packages/scanner ───────────────────────────────

export interface SiteScanOptions {
  readonly maxPages: number;
  /** Рендерить страницы в браузере (для SPA); способ определяется спайком S1. */
  readonly render: boolean;
}

export interface SiteScanner {
  scan(
    url: string,
    options: SiteScanOptions,
  ): Promise<Result<SiteSnapshot, SourceUnavailableError | ForbiddenError>>;
}

/** Только чтение: сканер не пишет в проект пользователя (ADR-0006). */
export interface CodebaseScanner {
  scan(path: string): Promise<Result<CodebaseSnapshot, SourceUnavailableError | ForbiddenError>>;
}

/** Разбор уже полученного HTML страницы без сети — для DOM от браузера хоста (ADR-0010). */
export interface PageAnalyzer {
  analyze(page: { readonly url: string; readonly html: string }): PageSnapshot;
}

// ─── Шаблоны документов — реализует packages/documents ───────────────────────

export interface TemplateInfo {
  readonly id: string;
  readonly title: string;
  readonly normRefs: readonly NormId[];
}

export interface DocumentTemplates {
  list(): readonly TemplateInfo[];
  /** Markdown без дисклеймера: его добавляет сценарий, единообразно для всех документов. */
  render(id: string, profile: OperatorProfile): Result<string, NotFoundError>;
}

// ─── Время ───────────────────────────────────────────────────────────────────

/** Источник текущего времени; в тестах подменяется фиксированным. */
export interface Clock {
  now(): Date;
}
