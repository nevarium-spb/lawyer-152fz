import { normId } from '@lawyer-152fz/core';
import { describe, expect, it } from 'vitest';

import { loadConfig } from './config';
import { findMissingNormRefs } from './integrity';

describe('loadConfig', () => {
  it('по умолчанию частные сети разрешены (режим плагина)', () => {
    expect(loadConfig({})).toEqual({ ok: true, value: { allowPrivateNetworks: true } });
  });

  it('флаг выключается для режима бота', () => {
    const config = loadConfig({ LAWYER_ALLOW_PRIVATE_NETWORKS: 'false' });
    expect(config.ok && config.value.allowPrivateNetworks).toBe(false);
  });

  it('неверное значение — ошибка с именем переменной', () => {
    const config = loadConfig({ LAWYER_ALLOW_PRIVATE_NETWORKS: 'maybe' });
    expect(!config.ok && config.error.issues[0]?.path).toBe('LAWYER_ALLOW_PRIVATE_NETWORKS');
  });
});

describe('findMissingNormRefs', () => {
  it('сообщает, какое правило ссылается на несуществующую норму', () => {
    const rule = { id: 'PD-TEST', normRefs: [normId('152-fz/art-9'), normId('152-fz/art-99')] };
    expect(findMissingNormRefs([rule], new Set(['152-fz/art-9']))).toEqual([
      'PD-TEST → 152-fz/art-99',
    ]);
  });
});
