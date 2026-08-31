/**
 * Asserts the dual ESM/CJS build produced everything consumers rely on.
 *
 * Run after `npm run build`. Exits non-zero on any violation:
 *   - required entrypoints exist (root bundled types, ESM index, CJS index + its types)
 *   - dist/esm/package.json exists and declares `"type": "module"` (see finalize-esm-build.mjs;
 *     without it, Node's ESM loader treats dist/esm/*.js as CommonJS by default and prints a
 *     MODULE_TYPELESS_PACKAGE_JSON warning for every consumer instead of loading cleanly)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_FILES = [
  'dist/index.d.ts',
  'dist/esm/index.js',
  'dist/esm/index.d.ts',
  'dist/cjs/index.js',
  'dist/cjs/index.d.ts',
  // @reggieofarrell/http-client/upload-progress subpath - see src/upload-progress.ts and
  // the "./upload-progress" entry in package.json's "exports".
  'dist/upload-progress.d.ts',
  'dist/esm/upload-progress.js',
  'dist/esm/upload-progress.d.ts',
  'dist/cjs/upload-progress.js',
  'dist/cjs/upload-progress.d.ts',
  // Browser-bundler variant, resolved via package.json's "browser" export condition - see
  // src/upload-progress.browser.ts.
  'dist/upload-progress.browser.d.ts',
  'dist/esm/upload-progress.browser.js',
  'dist/esm/upload-progress.browser.d.ts',
  'dist/cjs/upload-progress.browser.js',
  'dist/cjs/upload-progress.browser.d.ts',
];

const violations = [];

for (const relativePath of REQUIRED_FILES) {
  if (!existsSync(join(repoRoot, relativePath))) {
    violations.push(`Missing required build output: ${relativePath}`);
  }
}

const esmPackageJsonPath = join(repoRoot, 'dist/esm/package.json');
if (existsSync(esmPackageJsonPath)) {
  const esmPackageJson = JSON.parse(readFileSync(esmPackageJsonPath, 'utf8'));
  if (esmPackageJson.type !== 'module') {
    violations.push(
      `dist/esm/package.json must declare "type": "module", got ${JSON.stringify(esmPackageJson.type)}`
    );
  }
} else {
  violations.push('Missing dist/esm/package.json (expected { "type": "module" })');
}

if (violations.length > 0) {
  console.error('❌ Build output check failed:');
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log('✅ Build output check passed');
