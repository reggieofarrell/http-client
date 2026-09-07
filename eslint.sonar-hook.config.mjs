import { createSonarHookEslintConfig } from '@casadega-development/ts-repo-tooling/eslint';
import { loadSonarRuleSet } from '@casadega-development/ts-repo-tooling/sonar';

/**
 * Generated server-aligned rule profile shared with the complete ESLint gate.
 * The shared hook factory selects only type-independent rules so coding agents
 * receive fast feedback without maintaining a second local rule mapper.
 */
const sonarRuleSet = loadSonarRuleSet(new URL('./scripts/sonar-rules/rules.json', import.meta.url));

export default createSonarHookEslintConfig({
  ignores: ['**/*.test.ts', '**/*.spec.ts', 'scripts/**', 'tests/**', 'tmp/**'],
  ruleSet: sonarRuleSet,
});
