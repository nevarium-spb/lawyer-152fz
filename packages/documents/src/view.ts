import {
  HARM_DEGREE_INFO,
  determineHarmDegree,
  determineProtectionLevel,
  isConsentBasis,
} from '@lawyer-152fz/core';
import type {
  ImplementedMeasure,
  OperatorProfile,
  ProcessingMethod,
  ProcessingPurpose,
  RenderContext,
  SystemDataKind,
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
  'responsible-person':
    'назначено лицо, ответственное за организацию обработки персональных данных',
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

/** Записи реестра носителей; одинаковое место хранения у разных целей помечается (п. 14). */
function mediaRegisterView(profile: OperatorProfile) {
  const entries = profile.mediaRegister ?? [];
  const placeKey = (location: string) => location.trim().toLowerCase();
  const covered = new Set(entries.map((entry) => entry.purpose.trim()));
  const uncovered = profile.purposes
    .filter((purpose) => purpose.methods !== 'automated' && !covered.has(purpose.title.trim()))
    .map((purpose) => purpose.title);
  return {
    entries: entries.map((entry, index) => {
      const sharing = unique(
        entries
          .filter(
            (other) =>
              other.purpose !== entry.purpose &&
              placeKey(other.location) === placeKey(entry.location),
          )
          .map((other) => `«${other.purpose}»`),
      );
      return {
        number: index + 1,
        purpose: entry.purpose,
        dataCategories: joinList(entry.dataCategories),
        medium: entry.medium,
        location: entry.location,
        accessPersons: joinList(entry.accessPersons),
        safeguards: joinList(entry.safeguards),
        responsible: entry.responsible,
        sharedWith: sharing.length > 0 ? sharing.join(', ') : null,
      };
    }),
    // Цели с бумажной обработкой, для которых в реестре нет ни одной записи (п. 13).
    uncovered,
    hasUncovered: uncovered.length > 0,
  };
}

const DATA_KIND_TEXT: Record<SystemDataKind, string> = {
  special:
    'специальные категории (раса, национальность, политические взгляды, религиозные или философские убеждения, состояние здоровья, интимная жизнь)',
  biometric: 'биометрические персональные данные',
  public: 'общедоступные персональные данные (только из общедоступных источников, ст. 8 Закона)',
  other: 'иные категории персональных данных',
};

/** Требования пп. 13–16 Требований (ПП РФ № 1119); каждый следующий уровень включает предыдущий. */
const REQUIREMENTS_L4 = [
  'организовать режим обеспечения безопасности помещений, в которых размещена информационная система, исключающий неконтролируемое проникновение или пребывание в них лиц без права доступа (пп. «а» п. 13)',
  'обеспечить сохранность носителей персональных данных (пп. «б» п. 13)',
  'утвердить руководителем оператора документ с перечнем лиц, доступ которых к персональным данным в системе необходим для служебных (трудовых) обязанностей (пп. «в» п. 13)',
  'использовать средства защиты информации, прошедшие оценку соответствия, когда они нужны для нейтрализации актуальных угроз (пп. «г» п. 13)',
];
const REQUIREMENTS_L3 = [
  ...REQUIREMENTS_L4,
  'назначить должностное лицо (работника), ответственное за обеспечение безопасности персональных данных в системе (п. 14)',
];
const REQUIREMENTS_L2 = [
  ...REQUIREMENTS_L3,
  'допустить к содержанию электронного журнала сообщений только должностных лиц (работников) оператора или уполномоченного лица, которым эти сведения нужны для служебных (трудовых) обязанностей (п. 15)',
];
const REQUIREMENTS_L1 = [
  ...REQUIREMENTS_L2,
  'автоматически регистрировать в электронном журнале безопасности изменение полномочий сотрудника оператора по доступу к персональным данным в системе (пп. «а» п. 16)',
  'создать структурное подразделение, ответственное за обеспечение безопасности персональных данных в системе, либо возложить эти функции на одно из подразделений (пп. «б» п. 16)',
];
const REQUIREMENTS: Record<1 | 2 | 3 | 4, readonly string[]> = {
  1: REQUIREMENTS_L1,
  2: REQUIREMENTS_L2,
  3: REQUIREMENTS_L3,
  4: REQUIREMENTS_L4,
};

/** Уровень защищённости каждой системы считает код по пп. 9–12; тип угроз называет пользователь (п. 7). */
function protectionAssessmentView(profile: OperatorProfile) {
  const assessment = profile.protectionAssessment;
  const systems = (assessment?.systems ?? []).map((system, index) => {
    const result = determineProtectionLevel(system);
    return {
      number: index + 1,
      name: system.name,
      dataKind: DATA_KIND_TEXT[system.dataKind],
      subjects: system.employeesOnly
        ? 'только сотрудники оператора'
        : `${system.subjectsCount.toLocaleString('ru-RU')} (не сотрудники оператора)`,
      threatType: system.threatType,
      hasLevel: result.kind === 'level',
      level: result.kind === 'level' ? result.level : null,
      basis: result.kind === 'level' ? result.basis : null,
      reason: result.kind === 'undetermined' ? result.reason : null,
      requirements: result.kind === 'level' ? REQUIREMENTS[result.level] : [],
    };
  });
  return {
    date: assessment ? formatDate(assessment.date) : null,
    systems,
    hasUndetermined: systems.some((system) => !system.hasLevel),
  };
}

/** Перечень допущенных по информационным системам (пп. «в» п. 13 ПП № 1119). */
function accessListView(profile: OperatorProfile) {
  const list = profile.accessList;
  if (!list) return null;
  const names = unique(list.entries.map((entry) => entry.system));
  return {
    number: list.number,
    date: formatDate(list.date),
    signatory: list.signatory,
    systems: names.map((name) => ({
      name,
      rows: list.entries
        .filter((entry) => entry.system === name)
        .map((entry, index) => ({
          number: index + 1,
          position: entry.position,
          duties: entry.duties,
          dataCategories: joinList(entry.dataCategories),
        })),
    })),
  };
}

/** Акт оценки вреда (приказ № 178): степень считает код по отмеченным случаям, при разных — высшая (п. 6). */
function harmAssessmentView(profile: OperatorProfile) {
  const assessment = profile.harmAssessment;
  if (!assessment) return null;
  const result = determineHarmDegree(assessment.cases);
  const degree = result.kind === 'degree' ? HARM_DEGREE_INFO[result.degree] : null;
  return {
    date: formatDate(assessment.date),
    assessmentDate: formatDate(assessment.assessmentDate),
    byResponsible: assessment.conductedBy === 'responsible-person',
    assessors: assessment.assessors,
    hasDegree: degree !== null,
    degree: degree?.title ?? null,
    basis: degree?.point ?? null,
    mixed: result.kind === 'degree' && result.mixed,
    cases:
      result.kind === 'degree'
        ? result.cases.map((harmCase, index) => ({
            number: index + 1,
            text: harmCase.text,
            degree: HARM_DEGREE_INFO[harmCase.degree].title,
            point: HARM_DEGREE_INFO[harmCase.degree].point,
          }))
        : [],
    reason: result.kind === 'undetermined' ? result.reason : null,
  };
}

/** Акт об уничтожении (приказ № 179): выгрузка из журнала нужна, если данные были в информационных системах. */
function destructionActView(profile: OperatorProfile) {
  const act = profile.destructionAct;
  if (!act) return null;
  const media = act.media ?? [];
  const systems = act.systems ?? [];
  const processors = act.processors ?? [];
  return {
    destructionDate: formatDate(act.destructionDate),
    hasProcessors: processors.length > 0,
    processors,
    subjects: act.subjects,
    destroyers: act.destroyers,
    dataCategories: joinList(act.dataCategories),
    hasMedia: media.length > 0,
    media: media.map((medium, index) => ({ number: index + 1, ...medium })),
    hasSystems: systems.length > 0,
    systems,
    method: act.method,
    reason: act.reason,
  };
}

/** Порядок уничтожения: какие документы подтверждают уничтожение, зависит от способа обработки (пп. 1, 2, 7 приказа № 179). */
function destructionProcedureView(profile: OperatorProfile) {
  const procedure = profile.destructionProcedure;
  if (!procedure) return null;
  const automated = profile.purposes.some((purpose) => purpose.methods !== 'non-automated');
  const nonAutomated = profile.purposes.some((purpose) => purpose.methods !== 'automated');
  return {
    number: procedure.number,
    date: formatDate(procedure.date),
    signatory: procedure.signatory,
    executors: procedure.executors,
    methods: procedure.methods,
    hasAutomated: automated,
    automatedOnly: automated && !nonAutomated,
    nonAutomatedOnly: nonAutomated && !automated,
    both: automated && nonAutomated,
  };
}

/** Договор поручения (ч. 3 ст. 6): иностранный обработчик меняет ответственность (ч. 6 ст. 6). */
function processingAgreementView(profile: OperatorProfile) {
  const agreement = profile.processingAgreement;
  if (!agreement) return null;
  const extra = agreement.extraSecurityRequirements ?? [];
  return {
    number: agreement.number,
    date: formatDate(agreement.date),
    processor: {
      name: agreement.processor.name,
      address: agreement.processor.address,
      country: country(agreement.processor.country),
      signatory: agreement.processor.signatory,
    },
    foreign: agreement.processor.country !== 'RU',
    operatorSignatory: agreement.operatorSignatory,
    purposes: agreement.purposes,
    dataCategories: agreement.dataCategories,
    actions: joinList(agreement.actions),
    incidentNotice: agreement.incidentNotice,
    term: agreement.term ?? null,
    hasExtraSecurityRequirements: extra.length > 0,
    extraSecurityRequirements: extra,
  };
}

const PURPOSE_DATA_KIND_TEXT: Record<SystemDataKind, string> = {
  special: 'специальные категории персональных данных (ст. 10 Закона)',
  biometric: 'биометрические персональные данные (ст. 11 Закона)',
  public: 'общедоступные персональные данные (ст. 8 Закона)',
  other: 'иные персональные данные',
};

/** Положение (п. 2 ч. 1 ст. 18.1): цели из профиля, категории данных по каждой — со слов оператора. */
function processingRegulationView(profile: OperatorProfile) {
  const regulation = profile.processingRegulation;
  if (!regulation) return null;
  const key = (text: string) => text.trim().toLowerCase();
  const kindsOf = (title: string): SystemDataKind[] => [
    ...new Set(
      regulation.dataKinds
        .filter((entry) => key(entry.purpose) === key(title))
        .flatMap((entry) => entry.kinds),
    ),
  ];
  const purposes = profile.purposes.map((purpose, index) => {
    const kinds = kindsOf(purpose.title);
    return {
      ...purposeView(purpose, index),
      hasKinds: kinds.length > 0,
      kinds: joinList(kinds.map((kind) => PURPOSE_DATA_KIND_TEXT[kind])),
    };
  });
  const allKinds = profile.purposes.flatMap((purpose) => kindsOf(purpose.title));
  return {
    number: regulation.number,
    date: formatDate(regulation.date),
    signatory: regulation.signatory,
    purposes,
    hasSensitive: allKinds.includes('special') || allKinds.includes('biometric'),
  };
}

/** «1 месяц», «3 месяца», «12 месяцев». */
function monthsText(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const number = String(count);
  if (mod10 === 1 && mod100 !== 11) return `${number} месяц`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${number} месяца`;
  return `${number} месяцев`;
}

/** Правила внутреннего контроля (п. 4 ч. 1 ст. 18.1): контроль по ПП № 1119 нужен, если есть обработка в информационных системах. */
function internalControlRulesView(profile: OperatorProfile) {
  const rules = profile.internalControlRules;
  if (!rules) return null;
  const inspectors = rules.inspectors ?? [];
  const triggers = rules.unscheduledTriggers ?? [];
  return {
    number: rules.number,
    date: formatDate(rules.date),
    signatory: rules.signatory,
    schedule: rules.schedule,
    hasAutomated: profile.purposes.some((purpose) => purpose.methods !== 'non-automated'),
    securityControlPeriod:
      rules.securityControlMonths === undefined ? null : monthsText(rules.securityControlMonths),
    hasInspectors: inspectors.length > 0,
    inspectors,
    hasTriggers: triggers.length > 0,
    triggers,
  };
}

/**
 * Приказ по п. 14 ПП № 1119: назначение обязательно с 3-го уровня (пп. 15, 16 включают п. 14).
 * Уровень системы — из акта уровня защищённости (пп. 9–12), иначе из профиля; сам код его не подбирает.
 */
function securityOfficerOrderView(profile: OperatorProfile) {
  const order = profile.securityOfficerOrder;
  if (!order) return null;
  const key = (text: string) => text.trim().toLowerCase();
  const assessed = profile.protectionAssessment?.systems ?? [];
  const declared = profile.protectionLevel;
  const systems = order.systems.map((system, index) => {
    const match = assessed.find((candidate) => key(candidate.name) === key(system.name));
    const result = match ? determineProtectionLevel(match) : null;
    const level =
      result?.kind === 'level'
        ? result.level
        : !match && declared !== undefined && declared !== 'not-determined'
          ? Number(declared)
          : null;
    return {
      number: index + 1,
      name: system.name,
      officer: system.officer,
      level,
      fromAssessment: result?.kind === 'level',
    };
  });
  const names = (items: typeof systems) => items.map((system) => `«${system.name}»`).join(', ');
  const optional = systems.filter((system) => system.level === 4);
  const undetermined = systems.filter((system) => system.level === null);
  return {
    number: order.number,
    date: formatDate(order.date),
    signatory: order.signatory,
    systems,
    optionalSystems: optional.length > 0 ? names(optional) : null,
    undeterminedSystems: undetermined.length > 0 ? names(undetermined) : null,
    hasLevel1: systems.some((system) => system.level === 1),
  };
}

export function buildView(profile: OperatorProfile, context: RenderContext) {
  const processors = profile.thirdParties.filter((party) => party.role === 'processor');
  const recipients = profile.thirdParties.filter((party) => party.role === 'recipient');

  return {
    date: formatDate(context.date),
    operator: {
      name: profile.name,
      inn: profile.inn,
      ogrn: profile.ogrn ?? null,
      // ИНН юридического лица — десять цифр, у предпринимателя и физического лица — двенадцать.
      isLegalEntity: profile.inn.length === 10,
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
    hasNonAutomated: profile.purposes.some((purpose) => purpose.methods !== 'automated'),
    mediaRegister: mediaRegisterView(profile),
    protectionAssessment: protectionAssessmentView(profile),
    accessList: accessListView(profile),
    harmAssessment: harmAssessmentView(profile),
    destructionAct: destructionActView(profile),
    destructionProcedure: destructionProcedureView(profile),
    processingAgreement: processingAgreementView(profile),
    processingRegulation: processingRegulationView(profile),
    internalControlRules: internalControlRulesView(profile),
    securityOfficerOrder: securityOfficerOrderView(profile),
    responsibleOrder: profile.responsibleOrder
      ? {
          number: profile.responsibleOrder.number,
          date: formatDate(profile.responsibleOrder.date),
          signatory: profile.responsibleOrder.signatory,
        }
      : null,
    incident: profile.incident
      ? {
          discoveredAt: profile.incident.discoveredAt,
          description: profile.incident.description,
          suspectedCauses: profile.incident.suspectedCauses,
          suspectedHarm: profile.incident.suspectedHarm,
          measuresTaken: profile.incident.measuresTaken,
          contact: profile.incident.contact,
          hasInvestigation: profile.incident.investigationResults !== undefined,
          investigationResults: profile.incident.investigationResults ?? '',
          hasResponsiblePersons: (profile.incident.responsiblePersons ?? []).length > 0,
          responsiblePersons: profile.incident.responsiblePersons ?? [],
        }
      : null,
    rknNotificationRef: profile.rknNotificationRef
      ? {
          number: profile.rknNotificationRef.number,
          date: formatDate(profile.rknNotificationRef.date),
        }
      : null,
  };
}

export type DocumentView = ReturnType<typeof buildView>;
