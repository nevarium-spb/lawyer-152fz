import { isConsentBasis } from '@lawyer-152fz/core';
import type {
  OperatorProfile,
  ProcessingMethod,
  ProcessingPurpose,
  RenderContext,
} from '@lawyer-152fz/core';

/**
 * Представление профиля для шаблонов (ADR-0013): все формулировки, которые зависят от данных,
 * готовятся здесь, чтобы в шаблоне не было логики. Необязательное и не заполненное — `null`:
 * шаблон, который подставит его без секции, упадёт в тестах, а не выдаст пропуск.
 */

const METHOD_TEXT: Record<ProcessingMethod, string> = {
  automated: 'автоматизированная обработка (с использованием средств автоматизации)',
  'non-automated': 'неавтоматизированная обработка (без использования средств автоматизации)',
  mixed: 'смешанная обработка (с использованием средств автоматизации и без них)',
};

const regionNames = new Intl.DisplayNames(['ru'], { type: 'region' });

/** «2026-11-02» → «02.11.2026». */
export function formatDate(iso: string): string {
  const [year = '', month = '', day = ''] = iso.split('-');
  return `${day}.${month}.${year}`;
}

const joinList = (items: readonly string[]) => items.join('; ');
const country = (code: string) => `${regionNames.of(code) ?? code} (${code})`;
const unique = (items: readonly string[]) => [...new Set(items)];

const purposeView = (purpose: ProcessingPurpose, index: number) => ({
  number: index + 1,
  title: purpose.title,
  dataCategories: joinList(purpose.dataCategories),
  subjectCategories: joinList(purpose.subjectCategories),
  legalBasis: purpose.legalBasis,
  actions: joinList(purpose.actions),
  methods: METHOD_TEXT[purpose.methods],
  retention: purpose.retention,
});

export function buildView(profile: OperatorProfile, context: RenderContext) {
  const processors = profile.thirdParties.filter((party) => party.role === 'processor');
  const recipients = profile.thirdParties.filter((party) => party.role === 'recipient');

  return {
    date: formatDate(context.date),
    operator: {
      name: profile.name,
      inn: profile.inn,
      ogrn: profile.ogrn ?? null,
      address: profile.legalAddress,
      email: profile.contactEmail,
      website: profile.website ?? null,
    },
    responsible: profile.responsiblePerson,
    purposes: profile.purposes.map(purposeView),
    // Цели по договору или закону не попадают в согласие: иначе они становятся отзывными.
    consentPurposes: profile.purposes
      .filter((purpose) => isConsentBasis(purpose.legalBasis))
      .map(purposeView),
    allDataCategories: joinList(unique(profile.purposes.flatMap((p) => p.dataCategories))),
    allActions: joinList(unique(profile.purposes.flatMap((p) => p.actions))),
    allMethods: joinList(unique(profile.purposes.map((p) => METHOD_TEXT[p.methods]))),
    database: {
      country: country(profile.databaseLocation.country),
      address: profile.databaseLocation.address,
    },
    hasProcessors: processors.length > 0,
    processors,
    hasRecipients: recipients.length > 0,
    recipients,
    hasCrossBorderTransfers: profile.crossBorderTransfers.length > 0,
    crossBorderTransfers: profile.crossBorderTransfers.map((transfer) => ({
      country: country(transfer.country),
      recipient: transfer.recipient,
      purpose: transfer.purpose,
      legalBasis: transfer.legalBasis,
      dataCategories: joinList(transfer.dataCategories),
      subjectCategories: joinList(transfer.subjectCategories),
      assessmentDate: formatDate(transfer.assessmentDate),
    })),
    crossBorderCountries: joinList(
      unique(profile.crossBorderTransfers.map((transfer) => country(transfer.country))),
    ),
    consentTerm: profile.consentTerm ?? null,
    publicData: profile.publicData ?? null,
    processingStartDate: profile.processingStartDate
      ? formatDate(profile.processingStartDate)
      : null,
    processingEndCondition: profile.processingEndCondition ?? null,
    cryptoTools: profile.cryptoTools ?? null,
    protectionLevel: profile.protectionLevel ?? null,
    rknNotificationRef: profile.rknNotificationRef
      ? {
          number: profile.rknNotificationRef.number,
          date: formatDate(profile.rknNotificationRef.date),
        }
      : null,
  };
}

export type DocumentView = ReturnType<typeof buildView>;
