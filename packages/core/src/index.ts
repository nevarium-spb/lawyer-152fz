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
export * from './domain/audit-report';
export type * from './domain/snapshots';
export type * from './domain/audit-rule';

export type * from './ports';
