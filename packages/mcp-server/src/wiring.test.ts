import { describe, expect, it } from 'vitest';

/**
 * Дымовой тест каркаса: все внутренние пакеты разрешаются через workspace-ссылки
 * и поле `exports`. Если сломать `exports` или зависимость `workspace:*`, тест упадёт.
 */
describe('workspace wiring', () => {
  it.each([
    '@lawyer-152fz/core',
    '@lawyer-152fz/knowledge',
    '@lawyer-152fz/scanner',
    '@lawyer-152fz/rules',
    '@lawyer-152fz/documents',
  ])('%s подключается из точки сборки', async (name) => {
    const mod: unknown = await import(name);
    expect(mod).toBeTypeOf('object');
  });
});
