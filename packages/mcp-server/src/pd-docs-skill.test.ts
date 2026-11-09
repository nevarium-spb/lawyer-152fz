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

  it.each(['harm-assessment', 'destruction-act', 'destruction-procedure', 'processing-agreement'])(
    'описывает шаблон %s: в таблице выбора и в «Что дальше»',
    (id) => {
      const table = skill.slice(skill.indexOf('## 1.'), skill.indexOf('## 2.'));
      const next = skill.slice(skill.indexOf('## 4. Что дальше'));
      expect(table).toContain(`\`${id}\``);
      expect(next).toContain(`\`${id}\``);
    },
  );

  it('степень вреда не называет сам: её считает шаблон по случаям пользователя', () => {
    expect(skill).toContain('Степень вреда');
    expect(skill).toMatch(/Не\s+придумывай\s+случаи/);
  });
});
