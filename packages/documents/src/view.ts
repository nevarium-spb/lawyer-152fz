import { isConsentBasis } from '@lawyer-152fz/core';
import type {
  ImplementedMeasure,
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

const MEASURE_TEXT: Record<ImplementedMeasure, string> = {
  'responsible-person': 'назначено лицо, ответственное за организацию обработки персональных данных',
  'policy-and-local-acts':
    'изданы документы, определяющие политику в отношении обработки персональных данных, и локальные акты по вопросам обработки',
  'security-measures':
    'применяются правовые, организационные и технические меры по обеспечению безопасности персональных данных в соответствии со статьёй 19 Закона',
  'internal-control':
    'осуществляется внутренний контроль и (или) аудит соответствия обработки персональных данных Закону и локальным актам',
  'harm-assessment':
    'проведена оценка вреда, который может быть причинён субъектам персональных данных в случае нарушения Закона',
  'staff-training':
    'работники, непосредственно осуществляющие обработку персональных данных, ознакомлены с законодательством о персональных данных и локальными актами',
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

/** Приказ РКН № 18, подп. 6: данные перечисляются по категориям. */
const publicDataRows = (data: NonNullable<OperatorProfile['publicData']>) => [
  ...data.dataCategories.map((item) => ({ category: 'Персональные данные', item })),
  ...(data.specialCategories ?? []).map((item) => ({
    category: 'Специальные категории персональных данных',
    item,
  })),
  ...(data.biometricData ?? []).map((item) => ({
    category: 'Биометрические персональные данные',
    item,
  })),
];

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
    publicDataRows: profile.publicData ? publicDataRows(profile.publicData) : [],
    hasSensitivePublicData:
      (profile.publicData?.specialCategories ?? []).length > 0 ||
      (profile.publicData?.biometricData ?? []).length > 0,
    processingStartDate: profile.processingStartDate
      ? formatDate(profile.processingStartDate)
      : null,
    processingEndCondition: profile.processingEndCondition ?? null,
    cryptoTools: profile.cryptoTools ?? null,
    protectionLevel:
      profile.protectionLevel === 'not-determined' ? null : (profile.protectionLevel ?? null),
    hasMeasures: (profile.implementedMeasures ?? []).length > 0,
    measures: (profile.implementedMeasures ?? []).map((measure) => MEASURE_TEXT[measure]),
    rknNotificationRef: profile.rknNotificationRef
      ? {
          number: profile.rknNotificationRef.number,
          date: formatDate(profile.rknNotificationRef.date),
        }
      : null,
  };
}

export type DocumentView = ReturnType<typeof buildView>;
