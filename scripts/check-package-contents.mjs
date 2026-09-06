#!/usr/bin/env node
/**
 * Verifies the exact public package shape, including the staged npm-facing README.
 *
 * The checker stages `npm-readme.md` explicitly because the dry-run pack disables lifecycle scripts
 * to keep its JSON output deterministic. Restoration runs in `finally`, so a failed package check
 * cannot leave the contributor README replaced in the working tree.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { npmReadmeMarker, restoreContributorReadme, stageNpmReadme } from './stage-npm-readme.mjs';

/** Absolute package root used for packing and README lifecycle operations. */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Root metadata files intentionally exposed to package consumers. */
const allowedRootFiles = new Set(['CHANGELOG.md', 'README.md', 'license.txt', 'package.json']);

/** Runtime and declaration entrypoints that every valid package tarball must contain. */
const requiredFiles = [
  'dist/cjs/index.js',
  'dist/cjs/upload-progress.browser.js',
  'dist/cjs/upload-progress.js',
  'dist/esm/index.js',
  'dist/esm/upload-progress.browser.js',
  'dist/esm/upload-progress.js',
  'dist/index.d.ts',
  'dist/upload-progress.browser.d.ts',
  'dist/upload-progress.d.ts',
];

/**
 * Runs npm's structured dry-run pack and returns normalized tarball paths.
 *
 * @returns {string[]} Sorted package paths reported by npm.
 */
function readPackedFiles() {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, HUSKY: '0' },
  });
  const jsonOffset = output.indexOf('[');
  if (jsonOffset < 0) {
    throw new Error('npm pack did not return its expected JSON array.');
  }
  const reports = JSON.parse(output.slice(jsonOffset));
  const report = Array.isArray(reports) ? reports[0] : reports;
  if (!report || !Array.isArray(report.files)) {
    throw new Error('npm pack returned an invalid file report.');
  }
  return report.files.map(({ path }) => String(path).replaceAll('\\', '/')).sort();
}

/**
 * Identifies unexpected, missing, or incorrectly staged package files.
 *
 * @param {string[]} packedFiles - Normalized paths returned by the npm dry-run pack.
 * @returns {string[]} Human-readable contract violations.
 */
function findPackageViolations(packedFiles) {
  const violations = [];
  const stagedReadme = readFileSync(join(repositoryRoot, 'README.md'), 'utf8');
  if (!stagedReadme.startsWith(npmReadmeMarker)) {
    violations.push('packed README.md is not the marked npm consumer source');
  }

  for (const path of packedFiles) {
    if (path.startsWith('dist/')) {
      continue;
    }
    if (!allowedRootFiles.has(path)) {
      violations.push(`unexpected package file: ${path}`);
    }
  }
  for (const requiredFile of requiredFiles) {
    if (!packedFiles.includes(requiredFile)) {
      violations.push(`missing required package file: ${requiredFile}`);
    }
  }
  if (packedFiles.includes('npm-readme.md')) {
    violations.push('npm-readme.md must be staged as README.md rather than shipped separately');
  }
  return violations;
}

/**
 * Executes the package-content contract while guaranteeing contributor README restoration.
 */
function main() {
  try {
    // Keep staging inside the protected block because an I/O failure after creating the backup must
    // still restore the contributor source before the command reports its error.
    stageNpmReadme(repositoryRoot);
    const packedFiles = readPackedFiles();
    const violations = findPackageViolations(packedFiles);
    if (violations.length > 0) {
      throw new Error(`Package contract failed:\n- ${violations.join('\n- ')}`);
    }
    process.stdout.write(`Package contract passed for ${packedFiles.length} files.\n`);
  } finally {
    restoreContributorReadme(repositoryRoot);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
