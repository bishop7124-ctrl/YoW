import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'dist-test',
    'broken-files',
    'functions',
    'node_modules',
    'node_modules.broken-*',
    '.claude',
    'vite.config.mjs.timestamp-*',
  ]),
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
      }],
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // Node-context source: Vercel API routes, one-off scripts, and the test
    // suite (all run under Node — via Vercel's runtime or Vitest — never a
    // browser). These previously had zero lint coverage at all (npm run
    // lint only ever targeted src); layering Node's globals on top of the
    // block above (rather than replacing it) is enough to make them lint
    // cleanly, since none of this code is React-shaped — the react-hooks/
    // react-refresh rules above simply don't match anything here.
    files: ['api/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
