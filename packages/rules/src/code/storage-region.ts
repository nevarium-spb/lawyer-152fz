import { normId } from '@lawyer-152fz/core';
import type { CodebaseRule, Finding } from '@lawyer-152fz/core';

import { MAX_EVIDENCE, fileEvidence, inFiles, matchingLines } from './shared';
import type { LineMatch } from './shared';

const LOCALIZATION = normId('152-fz/art-18/part-5');
const LOCALIZATION_FINE = normId('koap/art-13.11/part-8');

const ID = 'PD-CODE-STORAGE-REGION';

/**
 * Признаки хранилища за пределами РФ: регионы облаков и адреса облачных баз.
 * Российские регионы (Яндекс Облако `ru-central1`, `ru-msk` и т. п.) под шаблоны не попадают.
 */
const FOREIGN_STORAGE: readonly (readonly [RegExp, string])[] = [
  [
    /\b(?:us|eu|ap|sa|ca|me|af|il|mx)-(?:east|west|north|south|central|northeast|northwest|southeast|southwest)-\d\b/,
    'регион AWS',
  ],
  [
    /\b(?:us|europe|asia|australia|northamerica|southamerica|me|africa)-(?:east|west|central|north|south|northeast|northwest|southeast|southwest)\d\b/,
    'регион Google Cloud',
  ],
  [
    /\b(?:westeurope|northeurope|eastus2?|westus[23]?|centralus|uksouth|ukwest|germanywestcentral|francecentral|japaneast|southeastasia)\b/,
    'регион Azure',
  ],
  [/\.mongodb\.net\b/, 'MongoDB Atlas'],
  [/\.supabase\.co\b/, 'Supabase'],
  [/\.firebaseio\.com\b|firestore\.googleapis\.com/, 'Firebase'],
  [/\.rds\.amazonaws\.com\b|\.s3[.-][\w-]*\.?amazonaws\.com\b|\bs3\.amazonaws\.com\b/, 'AWS'],
  [/\.neon\.tech\b/, 'Neon'],
  [/\.psdb\.cloud\b/, 'PlanetScale'],
  [/\.upstash\.io\b/, 'Upstash'],
  [/\.documents\.azure\.com\b|\.database\.windows\.net\b/, 'Azure'],
];

const foreignStorageIn = (line: string) =>
  FOREIGN_STORAGE.find(([pattern]) => pattern.test(line))?.[1];

/** Регионы облаков и облачные базы за рубежом в коде и конфигурации. */
export const storageRegionRule: CodebaseRule = {
  id: ID,
  title: 'Хранилища и облака за пределами РФ',
  normRefs: [LOCALIZATION, LOCALIZATION_FINE],
  check(snapshot) {
    const matches: LineMatch[] = snapshot.files.flatMap((file) =>
      matchingLines(file, (line) => foreignStorageIn(line) !== undefined),
    );
    if (matches.length === 0) return [];

    const providers = [...new Set(matches.map(({ text }) => foreignStorageIn(text)))].join(', ');
    const files = new Set(matches.map(({ file }) => file.path)).size;
    const finding: Finding = {
      ruleId: ID,
      kind: 'risk',
      severity: 'high',
      confidence: 'needs-review',
      title: `В конфигурации есть хранилища или облака за пределами РФ (${providers})${inFiles(files)}`,
      evidence: matches.slice(0, MAX_EVIDENCE).map(fileEvidence),
      normRefs: [LOCALIZATION, LOCALIZATION_FINE],
      remediation:
        'Проверьте, что хранится в этих базах и хранилищах. Персональные данные граждан РФ при сборе должны ' +
        'записываться и храниться в базах на территории России; за рубеж допустима только последующая передача ' +
        'с уведомлением Роскомнадзора. Перенесите базы с ПДн к российскому провайдеру (например, Яндекс Облако, ' +
        'Selectel, VK Cloud, Timeweb Cloud).',
    };
    return [finding];
  },
};
