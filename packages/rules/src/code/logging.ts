import { normId } from '@lawyer-152fz/core';
import type { CodebaseRule, Finding } from '@lawyer-152fz/core';

import { MAX_EVIDENCE, fileEvidence, isCode, matchingLines } from './shared';

const PROTECTION = normId('152-fz/art-19/part-1');

const ID = 'PD-CODE-LOGGING';

const LOG_CALL =
  /\b(?:console\.(?:log|info|debug|warn|error)|logger\.\w+|log\.(?:info|debug|warn|error|trace)|logging\.\w+|print|println|fmt\.Print\w*|error_log|var_dump|print_r)\s*\(/;
const PERSONAL_DATA =
  /\b(?:e_?mail|phone|tel|passport|snils|inn|birth_?date|birthday|dob|fio|full_?name|first_?name|last_?name|surname|address|(?:req|request|ctx\.request)\.body)\b/i;

/** Вызовы логирования, в которые попадают поля с ПДн или всё тело запроса. */
export const loggingRule: CodebaseRule = {
  id: ID,
  title: 'Персональные данные в логах',
  normRefs: [PROTECTION],
  check(snapshot) {
    return snapshot.files.filter(isCode).flatMap((file): Finding[] => {
      const matches = matchingLines(
        file,
        (line) => LOG_CALL.test(line) && PERSONAL_DATA.test(line),
      );
      if (matches.length === 0) return [];
      return [
        {
          ruleId: ID,
          kind: 'risk',
          severity: 'medium',
          confidence: 'needs-review',
          title: `Персональные данные могут попадать в логи: ${file.path}`,
          evidence: matches.slice(0, MAX_EVIDENCE).map(fileEvidence),
          normRefs: [PROTECTION],
          remediation:
            'Не пишите в логи e-mail, телефоны, данные документов и тело запроса целиком: логи хранятся дольше, ' +
            'доступны большему кругу людей и часто уходят во внешние сервисы. Логируйте идентификатор записи или ' +
            'маскируйте значения (например, i***@mail.ru, +7 *** ***-12-34).',
        },
      ];
    });
  },
};
