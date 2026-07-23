import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'evidence/**',
      'node_modules/**',
      'playwright-report/**',
      'public/**',
      'server/**',
      'test-results/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'worker/**/*.ts', 'tests/**/*.ts', 'vitest.worker.config.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'three', 'three/*', 'ws', 'ws/*', '@app/*', '@content/*', '@physics/*', '@net/*', '@render/*', '@ui/*', '@audio/*', '@platform/*'],
              message: 'Simulation source may import only relative modules that resolve inside src/sim.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'Simulation code cannot depend on the DOM.' },
        { name: 'window', message: 'Simulation code cannot depend on the browser window.' },
        { name: 'localStorage', message: 'Simulation code cannot depend on local persistence.' },
        { name: 'sessionStorage', message: 'Simulation code cannot depend on local persistence.' },
        { name: 'navigator', message: 'Simulation code cannot depend on browser services.' },
        { name: 'performance', message: 'Simulation code cannot read wall-clock time.' },
        { name: 'process', message: 'Simulation code cannot depend on the host process.' },
        { name: 'globalThis', message: 'Simulation code cannot bypass the deterministic global boundary.' },
        { name: 'crypto', message: 'Simulation randomness must use an explicit deterministic RNG stream.' },
        { name: 'fetch', message: 'Simulation code cannot perform network I/O.' },
        { name: 'WebSocket', message: 'Simulation code cannot perform network I/O.' },
        { name: 'XMLHttpRequest', message: 'Simulation code cannot perform network I/O.' },
        { name: 'setTimeout', message: 'Simulation code cannot use wall-clock timers.' },
        { name: 'setInterval', message: 'Simulation code cannot use wall-clock timers.' },
        { name: 'setImmediate', message: 'Simulation code cannot use host timers.' },
        { name: 'queueMicrotask', message: 'Simulation code must advance only through explicit ticks.' },
        { name: 'requestAnimationFrame', message: 'Simulation code cannot depend on presentation timing.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Simulation randomness must use an explicit deterministic RNG stream.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Simulation code cannot read wall-clock time.',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Simulation code cannot read wall-clock time.',
        },
        {
          selector: 'ImportExpression',
          message: 'Simulation source cannot dynamically import host or presentation modules.',
        },
      ],
    },
  },
);
