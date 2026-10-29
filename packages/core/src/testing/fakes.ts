/**
 * Фейковые адаптеры портов для тестов сценариев. Поведение простое и предсказуемое;
 * настоящие адаптеры обязаны проходить те же контрактные тесты.
 */
import { toExcerpt } from '../domain/finding';
import type { Norm } from '../domain/norm';
import type { NormId } from '../domain/norm-id';
import type { OperatorProfile } from '../domain/operator-profile';
import type { CodebaseSnapshot, SiteSnapshot } from '../domain/snapshots';
import type {
  Clock,
  CodebaseScanner,
  DocumentTemplates,
  FreshnessStatus,
  NormRepository,
  RenderContext,
  SiteScanOptions,
  SiteScanner,
  SourceFreshnessChecker,
  TemplateInfo,
} from '../ports';
import { notFound } from '../shared/errors';
import type { ForbiddenError, SourceUnavailableError } from '../shared/errors';
import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export function fixedClock(iso = '2026-10-24T10:00:00Z'): Clock {
  return { now: () => new Date(iso) };
}

/** База норм в памяти: поиск — по числу слов запроса, встречающихся в заголовке и тексте. */
export function createInMemoryNormRepository(
  norms: readonly Norm[],
  kbVersion = 'kb-2026.10.24',
): NormRepository {
  const byId = new Map<NormId, Norm>(norms.map((norm) => [norm.id, norm]));

  return {
    kbVersion,
    get: (id) => {
      const norm = byId.get(id);
      return Promise.resolve(norm ? ok(norm) : err(notFound('norm', id)));
    },
    search: ({ text, acts, limit }) => {
      const words = text.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = norms
        .filter((norm) => !acts || acts.includes(norm.act))
        .map((norm) => {
          const haystack = `${norm.heading} ${norm.text}`.toLowerCase();
          return { norm, score: words.filter((word) => haystack.includes(word)).length };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.norm.id.localeCompare(b.norm.id))
        .slice(0, limit)
        .map(({ norm, score }) => ({
          id: norm.id,
          heading: norm.heading,
          snippet: toExcerpt(norm.text, 160),
          editionDate: norm.editionDate,
          score,
        }));
      return Promise.resolve(hits);
    },
  };
}

export function createStubFreshnessChecker(
  statuses: Readonly<Record<string, FreshnessStatus>> = {},
  clock: Clock = fixedClock(),
): SourceFreshnessChecker {
  return {
    check: (norm) =>
      Promise.resolve({
        id: norm.id,
        status: statuses[norm.id] ?? 'fresh',
        checkedAt: clock.now().toISOString(),
      }),
  };
}

type ScanError = SourceUnavailableError | ForbiddenError;

export interface RecordedScan {
  readonly target: string;
  readonly options?: SiteScanOptions;
}

/** Сканер сайта с заранее заданным результатом; запоминает вызовы. */
export function createStubSiteScanner(
  result: Result<SiteSnapshot, ScanError>,
): SiteScanner & { readonly calls: readonly RecordedScan[] } {
  const calls: RecordedScan[] = [];
  return {
    calls,
    scan: (target, options) => {
      calls.push({ target, options });
      return Promise.resolve(result);
    },
  };
}

export function createStubCodebaseScanner(
  result: Result<CodebaseSnapshot, ScanError>,
): CodebaseScanner & { readonly calls: readonly RecordedScan[] } {
  const calls: RecordedScan[] = [];
  return {
    calls,
    scan: (target) => {
      calls.push({ target });
      return Promise.resolve(result);
    },
  };
}

export interface InMemoryTemplate {
  readonly info: TemplateInfo;
  readonly render: (profile: OperatorProfile, context: RenderContext) => string;
}

export function createInMemoryTemplates(templates: readonly InMemoryTemplate[]): DocumentTemplates {
  return {
    list: () => templates.map((template) => template.info),
    render: (id, profile, context) => {
      const template = templates.find((candidate) => candidate.info.id === id);
      return template ? ok(template.render(profile, context)) : err(notFound('template', id));
    },
  };
}
