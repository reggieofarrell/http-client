/**
 * Low-latency SonarJS-only ESLint configuration for coding-agent post-edit
 * hooks. It deliberately excludes type-aware rules; the normal lint and
 * pre-push gates retain the complete locally implemented profile.
 *
 * Ignores match the main ESLint config so the hook cannot fail on tests or
 * scripts — paths `npm run lint` never analyzes.
 */

import tsParser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import { sonarRules } from './scripts/sonar-rules/load.mjs';

export default [
  {
    ignores: [
      '**/coverage/**',
      '**/dist/**',
      'node_modules/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      'scripts/**',
      'tests/**',
      'tmp/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
      parser: tsParser,
    },
    plugins: sonarjs.configs.recommended.plugins,
    settings: sonarjs.configs.recommended.settings,
    rules: Object.fromEntries(sonarRules.fast.map(rule => [`sonarjs/${rule}`, 'error'])),
  },
];
