import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const skill = await readFile(
  new URL('../../../plugins/lawyer-152fz/skills/pd-docs/SKILL.md', import.meta.url),
  'utf8',
);

describe('скилл pd-docs (T7.7)', () => {
  it('не называет шаблоны проверенными: юрист их не смотрел', () => {
    expect(skill).not.toMatch(/заполняет проверенные/);
    expect(skill).toContain('практикующий юрист их не проверял');
  });

  it.each(['thirdParties', 'crossBorderTransfers', 'implementedMeasures', 'protectionLevel'])(
    'требует подтверждения %s от пользователя',
    (field) => {
      expect(skill).toContain(`\`${field}\``);
    },
  );

  it('в «Что дальше» говорит о том, чего документы не заменяют', () => {
    const next = skill.slice(skill.indexOf('## 4. Что дальше'));
    expect(next).toContain('локальные акты');
    expect(next).toContain('договор поручения');
    expect(next).toContain('24 часа');
  });
});
