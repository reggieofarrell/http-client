import {
  createEslintConfig,
  createSonarEslintConfig,
  eslintPrettierConfig,
} from '@casadega-development/ts-repo-tooling/eslint';
import { loadSonarRuleSet } from '@casadega-development/ts-repo-tooling/sonar';
import { defineConfig } from 'eslint/config';

/**
 * Validated, generated intersection of the server profile and the SonarJS rules
 * that shared tooling can execute locally.
 */
const sonarRuleSet = loadSonarRuleSet(new URL('./scripts/sonar-rules/rules.json', import.meta.url));

export default defineConfig(
  ...createEslintConfig({
    documentation: 'quality',
    ignores: ['tmp/**', 'eslint.sonar-hook.config.mjs'],
    tsconfigProjects: ['./tsconfig.json'],
    tsconfigRootDir: import.meta.dirname,
  }),
  {
    files: ['src/**/*.ts'],
    rules: {
      // `RequestType` is part of the currently published API. Replacing that
      // enum requires an intentional major release rather than a tooling-only
      // migration that silently breaks existing consumers.
      'casadega/no-typescript-enum': 'off',

      // The v3 public API intentionally exposes `any` in legacy extension
      // hooks and generic defaults. Tightening those contracts is valuable,
      // but it is a separately reviewed breaking API change.
      '@typescript-eslint/no-explicit-any': 'off',

      // Several established public fallbacks deliberately treat an empty
      // string as absent. A mechanical `||` to `??` migration would therefore
      // change v3 behavior and belongs in a separately tested API change.
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      // Shared quality mode validates authored JSDoc blocks without requiring
      // every block to repeat parameters and return types already expressed by
      // TypeScript. The shared RuleSync policy still requires purpose-focused
      // documentation whenever declarations are added or materially changed.
      'jsdoc/require-param': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-throws-type': 'off',
    },
  },
  ...createSonarEslintConfig({
    files: ['src/**/*.ts'],
    ruleSet: sonarRuleSet,
  }),
  eslintPrettierConfig
);
