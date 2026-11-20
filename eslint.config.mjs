import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.expo/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'apps/api/uploads/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['packages/**/*.js', 'apps/api/**/*.js', 'apps/worker/**/*.js', '*.js', '*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['apps/mobile/**/*.js'],
    ignores: ['apps/mobile/*.config.js'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.jest,
        __DEV__: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'writable',
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // CommonJS config files of the Expo app.
    files: ['apps/mobile/*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
];
