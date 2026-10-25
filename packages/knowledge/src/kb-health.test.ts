import { describe, expect, it } from 'vitest';

import { findStaleNorms } from './kb-health';

describe('findStaleNorms', () => {
  const today = new Date('2026-10-25T12:00:00Z');

  it('находит нормы со сверкой старше 180 дней', () => {
    const stale = findStaleNorms(
      [
        { id: 'a', verifiedAt: '2026-10-25' },
        { id: 'b', verifiedAt: '2026-04-28' },
        { id: 'c', verifiedAt: '2026-04-27' },
      ],
      today,
    );
    expect(stale).toEqual([{ id: 'c', verifiedAt: '2026-04-27', ageDays: 181 }]);
  });

  it('порог настраивается', () => {
    expect(findStaleNorms([{ id: 'a', verifiedAt: '2026-10-20' }], today, 3)).toHaveLength(1);
  });
});
