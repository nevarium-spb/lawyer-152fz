/**
 * Доменные ошибки — размеченное объединение по полю `kind`.
 * Сообщения на русском: их показывает пользователю модель или бот.
 */
export type DomainError = ValidationError | NotFoundError | SourceUnavailableError | ForbiddenError;

export interface ValidationIssue {
  /** Путь к полю через точку, например `responsiblePerson.fullName`. */
  readonly path: string;
  readonly message: string;
}

export interface ValidationError {
  readonly kind: 'validation';
  readonly message: string;
  readonly issues: readonly ValidationIssue[];
}

export interface NotFoundError {
  readonly kind: 'not-found';
  readonly message: string;
  readonly entity: 'norm' | 'template';
  readonly id: string;
}

export interface SourceUnavailableError {
  readonly kind: 'source-unavailable';
  readonly message: string;
  readonly source: string;
}

/** Отказ по политике, например SSRF-защита запретила адрес (ADR-0006). */
export interface ForbiddenError {
  readonly kind: 'forbidden';
  readonly message: string;
  readonly reason: string;
}

export const validationError = (
  message: string,
  issues: readonly ValidationIssue[] = [],
): ValidationError => ({ kind: 'validation', message, issues });

export const notFound = (entity: NotFoundError['entity'], id: string): NotFoundError => ({
  kind: 'not-found',
  entity,
  id,
  message: entity === 'norm' ? `Норма «${id}» не найдена в базе` : `Шаблон «${id}» не найден`,
});

export const sourceUnavailable = (source: string, detail: string): SourceUnavailableError => ({
  kind: 'source-unavailable',
  source,
  message: `Источник ${source} недоступен: ${detail}`,
});

export const forbidden = (reason: string): ForbiddenError => ({
  kind: 'forbidden',
  reason,
  message: `Действие запрещено: ${reason}`,
});
