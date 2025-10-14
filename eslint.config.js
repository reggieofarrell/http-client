const tsParser = require('@typescript-eslint/parser');
const globals = require('globals');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const jest = require('eslint-plugin-jest');
const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');

module.exports = [
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
      parserOptions: { project: './tsconfig.json', ecmaVersion: 2020, sourceType: 'module' },
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
    },
  },
  // Prettier configuration (should be last to override formatting rules)
  prettier,
];
