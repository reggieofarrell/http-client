import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import jest from 'eslint-plugin-jest';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import { sonarRules } from './scripts/sonar-rules/load.mjs';

/**
 * Enforce every active server rule that eslint-plugin-sonarjs implements. The
 * server remains authoritative for rules and analyzers unavailable locally,
 * while the locally reproducible intersection is a hard gate from day one.
 */
const sonarEnforcedRules = Object.fromEntries(
  sonarRules.all.map(rule => [`sonarjs/${rule}`, 'error'])
);

const rootDir = dirname(fileURLToPath(import.meta.url));

export default [
  // Global ignores
  { ignores: ['dist/**/*', 'node_modules/**/*', 'coverage/**/*', 'tmp/**/*'] },
  // Base configuration for all files
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest },
    },
  },
  // Apply recommended JavaScript rules
  js.configs.recommended,
  // TypeScript-specific configuration
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: rootDir,
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': typescriptEslint, jest },
    rules: {
      // TypeScript ESLint recommended rules
      ...typescriptEslint.configs.recommended.rules,
      // Jest recommended rules
      ...jest.configs.recommended.rules,
      // Custom rule overrides
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // TypeScript's own compiler already checks this far more accurately (it understands
      // ambient type namespaces like `NodeJS`/`BufferEncoding` and lib-scoped globals like
      // `XMLHttpRequest` from a per-file `/// <reference lib="dom" />`, which plain no-undef
      // does not) - this is the standard recommendation for TS + ESLint setups.
      'no-undef': 'off',
    },
  },
  // Locally implementable SonarJS profile on production library source only.
  // Tests and scripts stay ignored (same as the rest of ESLint). Type-aware
  // plugin rules need a program; the block above already supplies tsconfig.
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.spec.ts'],
    plugins: sonarjs.configs.recommended.plugins,
    settings: sonarjs.configs.recommended.settings,
    rules: sonarEnforcedRules,
  },
  // Prettier configuration (should be last to override formatting rules)
  prettier,
];
