/**
 * Frontend ESLint gate for this take-home.
 * Local rules copied from tilemap/eslint-rules — do not weaken or disable them.
 */
const js = require('@eslint/js')
const typescript = require('@typescript-eslint/eslint-plugin')
const typescriptParser = require('@typescript-eslint/parser')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const prettier = require('eslint-config-prettier')
const unusedImports = require('eslint-plugin-unused-imports')
const localRules = require('./eslint-rules')
const codeMetricsLimits = require('./scripts/code-metrics-limits.cjs')

const strictTypeScriptRules = typescript.configs.strict?.rules ?? {}

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      'frontend/out/**',
      'frontend/dist/**',
      'eslint-rules/**',
      'backend/**',
      'demos/**',
      'specs/**',
      '.specify/**',
      '.cursor/**',
    ],
  },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      react,
      'react-hooks': reactHooks,
      'unused-imports': unusedImports,
      local: localRules,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...typescript.configs.recommended.rules,
      ...strictTypeScriptRules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...prettier.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'local/no-magic-string': ['error', { allowJsx: true }],
      'max-lines': [
        'warn',
        {
          max: codeMetricsLimits.fileLines.warn,
          skipBlankLines: codeMetricsLimits.fileLines.skipBlankLines,
          skipComments: codeMetricsLimits.fileLines.skipComments,
        },
      ],
      'local/max-lines-strict': [
        'error',
        {
          max: codeMetricsLimits.fileLines.error,
          skipBlankLines: codeMetricsLimits.fileLines.skipBlankLines,
          skipComments: codeMetricsLimits.fileLines.skipComments,
        },
      ],
      complexity: ['warn', { max: codeMetricsLimits.complexity.warn }],
      'local/complexity-strict': [
        'error',
        { max: codeMetricsLimits.complexity.error },
      ],
      'local/no-repeated-array-filter': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      indent: 'off',
    },
    settings: {
      // Prefer installed frontend React when present; fall back for pre-scaffold runs.
      react: { version: '19.0' },
    },
  },
  {
    files: [
      'frontend/**/__tests__/**/*.{ts,tsx}',
      'frontend/**/*.{test,spec}.{ts,tsx}',
    ],
    rules: {
      'local/no-magic-string': 'off',
    },
  },
  {
    files: [
      'frontend/constants/**/*.{ts,tsx}',
      'frontend/**/constants/**/*.{ts,tsx}',
      'frontend/**/Enums.ts',
      'frontend/**/enums.ts',
      'frontend/**/*-wire.ts',
      'frontend/**/*-schema.ts',
    ],
    rules: {
      // Definition artifacts for wire/domain literals (rule also allows these paths).
      'local/no-magic-string': 'off',
    },
  },
  {
    files: [
      'frontend/**/*.config.{ts,js,mjs,cjs}',
      'frontend/next-env.d.ts',
    ],
    rules: {
      'local/no-magic-string': 'off',
      'local/max-lines-strict': 'off',
      'local/complexity-strict': 'off',
      quotes: 'off',
      semi: 'off',
    },
  },
]
