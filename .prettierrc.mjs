import sharedPrettierConfig from '@casadega-development/ts-repo-tooling/prettier';

/**
 * Extends the shared formatting baseline while preserving the library's
 * established quote, wrapping, and ES5-compatible trailing-comma conventions.
 * The overrides avoid a repository-wide cosmetic rewrite in a tooling PR.
 */
export default {
  ...sharedPrettierConfig,
  arrowParens: 'avoid',
  printWidth: 100,
  proseWrap: 'always',
  singleQuote: true,
  trailingComma: 'es5',
};
