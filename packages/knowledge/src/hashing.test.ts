import { describe, expect, it } from 'vitest';

import { normalizeLineEndings, sha256 } from './hashing';

describe('sha256', () => {
  it('совпадает с эталонным значением', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('не зависит от переводов строк', () => {
    expect(sha256('часть 1\r\n\r\nчасть 2')).toBe(sha256('часть 1\n\nчасть 2'));
    expect(normalizeLineEndings('a\rb\r\nc')).toBe('a\nb\nc');
  });
});
