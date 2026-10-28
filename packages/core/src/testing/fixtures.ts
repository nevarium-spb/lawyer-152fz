/**
 * Фикстуры для тестов всех пакетов. Значения синтетические:
 * текст нормы — не настоящий текст закона, реквизиты — валидные, но вымышленные.
 */
import { findingSchema } from '../domain/finding';
import type { Finding, FindingInput } from '../domain/finding';
import { normSchema } from '../domain/norm';
import type { Norm, NormInput } from '../domain/norm';
import type { OperatorProfileInput } from '../domain/operator-profile';
import type { CodebaseSnapshot, PageSnapshot, SiteSnapshot } from '../domain/snapshots';

export function makeNorm(overrides: Partial<NormInput> = {}): Norm {
  return normSchema.parse({
    id: '152-fz/art-9/part-1',
    act: '152-fz',
    heading: 'Статья 9 (тестовая)',
    text: 'Текст нормы для тестов: согласие на обработку персональных данных.',
    editionDate: '2025-01-01',
    sourceUrl: 'http://actual.pravo.gov.ru/content/content.html#hash=test',
    verifiedAt: '2026-10-24',
    sha256: 'a'.repeat(64),
    ...overrides,
  });
}

export function makeFinding(overrides: Partial<FindingInput> = {}): Finding {
  return findingSchema.parse({
    ruleId: 'PD-TEST-001',
    kind: 'violation',
    severity: 'high',
    title: 'Тестовая находка',
    evidence: [{ type: 'page', url: 'https://example.ru/contacts', selector: 'form#feedback' }],
    normRefs: ['152-fz/art-9/part-1'],
    remediation: 'Тестовая рекомендация',
    confidence: 'deterministic',
    ...overrides,
  });
}

export function validProfileInput(): OperatorProfileInput {
  return {
    name: 'ООО «Тестовый оператор»',
    inn: '1234567894',
    ogrn: '1027700000008',
    legalAddress: '190000, г. Санкт-Петербург, тестовая ул., д. 1',
    contactEmail: 'privacy@example.ru',
    responsiblePerson: { fullName: 'Иванов Иван Иванович', position: 'Директор' },
    purposes: ['Обработка заявок с сайта'],
    dataCategories: ['ФИО', 'номер телефона', 'адрес электронной почты'],
    subjectCategories: ['Посетители сайта'],
    thirdParties: [],
    storageCountry: 'RU',
    crossBorderTransfers: [],
  };
}

export function makePage(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: 'https://example.ru/',
    isHttps: true,
    forms: [],
    thirdParties: [],
    cookies: [],
    policyLinks: [],
    hasCookieNotice: false,
    renderedByScript: false,
    ...overrides,
  };
}

export function makeSiteSnapshot(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  return { rootUrl: 'https://example.ru/', pages: [makePage()], notChecked: [], ...overrides };
}

export function makeCodebaseSnapshot(overrides: Partial<CodebaseSnapshot> = {}): CodebaseSnapshot {
  return {
    rootPath: '/repo',
    files: [{ path: 'src/index.ts', content: 'export {};' }],
    notChecked: [],
    ...overrides,
  };
}
