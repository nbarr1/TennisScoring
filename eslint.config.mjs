import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const commonGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Headers: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  alert: 'readonly',
  FormData: 'readonly',
  File: 'readonly',
  Blob: 'readonly',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/lib/**',
      '**/.next/**',
      '**/coverage/**',
      '**/android/**',
      '**/ios/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        ...commonGlobals,
        ...browserGlobals,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
];
