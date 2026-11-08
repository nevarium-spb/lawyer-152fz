/**
 * Оценка вреда субъектам ПДн (приказ Роскомнадзора от 27.10.2022 № 178, `rkn-order-178`).
 * Степень вреда определяется по случаям пп. 2.1–2.3 п. 2 Требований; если по итогам оценки
 * возможны разные степени, применяется более высокая (п. 6). Какие случаи имеют место у оператора,
 * решает пользователь — код только сопоставляет их с нормой и не угадывает.
 */

export const HARM_DEGREES = ['high', 'medium', 'low'] as const;
export type HarmDegree = (typeof HARM_DEGREES)[number];

/** Степень вреда словами и пункт Требований, который её устанавливает. */
export const HARM_DEGREE_INFO: Record<
  HarmDegree,
  { readonly title: string; readonly point: string }
> = {
  high: { title: 'высокая', point: 'подпункт 2.1 пункта 2' },
  medium: { title: 'средняя', point: 'подпункт 2.2 пункта 2' },
  low: { title: 'низкая', point: 'подпункт 2.3 пункта 2' },
};

/** Случаи из пп. 2.1–2.3 п. 2 Требований; формулировки сокращены, смысл норм сохранён. */
export const HARM_CASES = [
  {
    id: 'biometric',
    degree: 'high',
    text: 'обработка биометрических персональных данных, которые используются оператором для установления личности субъекта (кроме случаев, установленных федеральными законами)',
  },
  {
    id: 'special-categories',
    degree: 'high',
    text: 'обработка специальных категорий персональных данных (расовая и национальная принадлежность, политические взгляды, религиозные или философские убеждения, состояние здоровья, интимная жизнь, сведения о судимости), кроме случаев, установленных федеральными законами',
  },
  {
    id: 'minors-contract',
    degree: 'high',
    text: 'обработка персональных данных несовершеннолетних для исполнения договора с их участием или для заключения такого договора по их инициативе в случаях, не предусмотренных законодательством Российской Федерации',
  },
  {
    id: 'depersonalization',
    degree: 'high',
    text: 'обезличивание персональных данных, в том числе для оценочных (скоринговых) исследований, прогнозирования поведения потребителей и иных исследований, не предусмотренных пунктом 9 части 1 статьи 6 Закона',
  },
  {
    id: 'foreign-processor',
    degree: 'high',
    text: 'поручение иностранному лицу (иностранным лицам) обработки персональных данных граждан Российской Федерации',
  },
  {
    id: 'foreign-database',
    degree: 'high',
    text: 'сбор персональных данных с использованием баз данных, находящихся за пределами Российской Федерации',
  },
  {
    id: 'public-distribution',
    degree: 'medium',
    text: 'распространение персональных данных на официальном сайте оператора в сети «Интернет» либо предоставление их неограниченному кругу лиц, кроме случаев, установленных федеральными законами',
  },
  {
    id: 'additional-purposes',
    degree: 'medium',
    text: 'обработка персональных данных в дополнительных целях, отличных от первоначальной цели сбора',
  },
  {
    id: 'direct-marketing',
    degree: 'medium',
    text: 'продвижение товаров, работ, услуг прямыми контактами с потенциальным потребителем с использованием баз персональных данных, владельцем которых является иной оператор',
  },
  {
    id: 'anonymous-site-consent',
    degree: 'medium',
    text: 'получение согласия на обработку персональных данных через функционал официального сайта, не предполагающий дальнейшей идентификации и (или) аутентификации субъекта',
  },
  {
    id: 'incompatible-purposes-consent',
    degree: 'medium',
    text: 'получение согласия, содержащего положения о праве обрабатывать персональные данные определённому и (или) неопределённому кругу лиц в целях, несовместимых между собой',
  },
  {
    id: 'public-sources',
    degree: 'low',
    text: 'ведение общедоступных источников персональных данных, сформированных в соответствии со статьёй 8 Закона',
  },
  {
    id: 'non-staff-responsible',
    degree: 'low',
    text: 'назначение ответственным за обработку персональных данных лица, не являющегося штатным сотрудником оператора',
  },
] as const satisfies readonly { id: string; degree: HarmDegree; text: string }[];

export type HarmCase = (typeof HARM_CASES)[number];
export type HarmCaseId = HarmCase['id'];
export const HARM_CASE_IDS = HARM_CASES.map((harmCase) => harmCase.id) as [
  HarmCaseId,
  ...HarmCaseId[],
];

export type HarmResult =
  | {
      readonly kind: 'degree';
      readonly degree: HarmDegree;
      /** Отмеченные случаи в порядке Требований. */
      readonly cases: readonly HarmCase[];
      /** Среди отмеченных случаев есть случаи разных степеней: применяется высшая (п. 6). */
      readonly mixed: boolean;
    }
  | { readonly kind: 'undetermined'; readonly reason: string };

const RANK: Record<HarmDegree, number> = { high: 3, medium: 2, low: 1 };

/** Степень вреда по отмеченным случаям: при разных степенях — более высокая (п. 6 Требований). */
export function determineHarmDegree(selected: readonly HarmCaseId[]): HarmResult {
  const cases = HARM_CASES.filter((harmCase) => selected.includes(harmCase.id));
  const top = cases.reduce<HarmDegree | undefined>(
    (best, harmCase) =>
      best === undefined || RANK[harmCase.degree] > RANK[best] ? harmCase.degree : best,
    undefined,
  );
  if (top === undefined) {
    return {
      kind: 'undetermined',
      reason:
        'Ни один из случаев подпунктов 2.1–2.3 пункта 2 Требований не отмечен, поэтому степень вреда по ним не определяется. Требования не называют степень вреда для обработки вне этих случаев: проверьте перечень случаев и, если ни один не подходит, определите степень сами и обоснуйте её.',
    };
  }
  return {
    kind: 'degree',
    degree: top,
    cases,
    mixed: new Set(cases.map((harmCase) => harmCase.degree)).size > 1,
  };
}
