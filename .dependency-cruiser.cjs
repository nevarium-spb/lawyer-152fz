/**
 * Машинная проверка границ гексагональной архитектуры (ADR-0002).
 * Нарушение любого правила с severity "error" валит `pnpm depcruise` и CI.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Циклические зависимости запрещены.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-independent',
      comment: 'core — центр гексагона: не знает ни об одном адаптере и точке сборки.',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: { path: '^packages/(knowledge|scanner|rules|documents|mcp-server)/' },
    },
    {
      name: 'core-no-io',
      comment: 'core без I/O: встроенные модули Node (fs, http, net, ...) запрещены.',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'rules-pure',
      comment: 'Правила аудита — чистые функции над снимками (ADR-0004), без модулей Node.',
      severity: 'error',
      from: { path: '^packages/rules/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'adapters-only-core',
      comment: 'Адаптеры зависят только от core, не друг от друга и не от точки сборки.',
      severity: 'error',
      from: { path: '^packages/(knowledge|scanner|rules|documents)/' },
      to: {
        path: '^packages/(knowledge|scanner|rules|documents|mcp-server)/',
        pathNot: '^packages/$1/',
      },
    },
    {
      name: 'no-unresolvable',
      comment: 'Импорт, который не разрешается, — ошибка конфигурации пакета.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
    },
  },
};
