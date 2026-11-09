/**
 * @lawyer-152fz/core — домен, сценарии и порты.
 *
 * Правило пакета: никакого I/O и никаких зависимостей от адаптеров
 * (проверяется dependency-cruiser, см. ADR-0002).
 */
export * from './shared/result';
export * from './shared/errors';
export * from './shared/validation';

export * from './domain/norm-id';
export * from './domain/norm';
export * from './domain/finding';
export * from './domain/identifiers';
export * from './domain/operator-profile';
export * from './domain/protection-level';
export * from './domain/harm-assessment';
export * from './domain/audit-report';
export * from './domain/snapshots';
export * from './domain/special-categories';
export type * from './domain/audit-rule';

export type * from './ports';

export * from './use-cases/run-rules';
export * from './use-cases/lookup-norms';
export * from './use-cases/verify-answer';
export { ANSWER_LABELS } from './domain/answer-text';
export type { AnswerLabel } from './domain/answer-text';
export * from './use-cases/audit-site';
export * from './use-cases/audit-codebase';
export * from './use-cases/audit-html';
export * from './domain/document-warnings';
export * from './use-cases/generate-document';
