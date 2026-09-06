#!/usr/bin/env node
/**
 * Stages the consumer README as the tarball's root README and restores the contributor source.
 *
 * GitHub renders the committed `README.md`, while npm renders the root `README.md` contained in the
 * package tarball. The registry does not support a package-manifest field naming an alternate README,
 * so the package lifecycle temporarily swaps `npm-readme.md` into that required path.
 */
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Marker proving that the staged file came from the npm-specific source. */
export const npmReadmeMarker = '<!-- npm-readme -->';

/** Filename used to protect the contributor README during package lifecycle hooks. */
const backupFilename = '.README.github.bak';

/**
 * Resolves every file participating in the README swap for one repository root.
 *
 * @param {string} repositoryRoot - Absolute repository directory whose README files are managed.
 * @returns {{ backup: string; contributorReadme: string; npmReadme: string }} Absolute paths used by the swap.
 */
function resolveReadmePaths(repositoryRoot) {
  return {
    backup: join(repositoryRoot, backupFilename),
    contributorReadme: join(repositoryRoot, 'README.md'),
    npmReadme: join(repositoryRoot, 'npm-readme.md'),
  };
}

/**
 * Replaces the root contributor README with the npm-facing source while retaining a recoverable copy.
 *
 * An existing backup is deliberately preserved. It indicates a prior lifecycle process stopped
 * between stage and restore, and overwriting it could permanently replace the contributor source
 * with an already staged consumer copy.
 *
 * @param {string} repositoryRoot - Absolute repository directory whose README should be staged.
 * @throws {Error} When either source is missing or the npm source lacks its identity marker.
 */
export function stageNpmReadme(repositoryRoot) {
  const paths = resolveReadmePaths(repositoryRoot);
  if (!existsSync(paths.npmReadme)) {
    throw new Error('npm-readme.md is missing; refusing to package the contributor README.');
  }
  if (!existsSync(paths.contributorReadme)) {
    throw new Error('README.md is missing; no contributor source can be protected.');
  }

  const npmSource = readFileSync(paths.npmReadme, 'utf8');
  if (!npmSource.includes(npmReadmeMarker)) {
    throw new Error(`npm-readme.md must contain the marker ${npmReadmeMarker}.`);
  }

  if (!existsSync(paths.backup)) {
    copyFileSync(paths.contributorReadme, paths.backup);
  }
  copyFileSync(paths.npmReadme, paths.contributorReadme);
}

/**
 * Restores the contributor README after packing or recovers it after an interrupted lifecycle.
 *
 * @param {string} repositoryRoot - Absolute repository directory whose README should be restored.
 * @returns {boolean} Whether a backup existed and was restored.
 */
export function restoreContributorReadme(repositoryRoot) {
  const paths = resolveReadmePaths(repositoryRoot);
  if (!existsSync(paths.backup)) {
    return false;
  }

  renameSync(paths.backup, paths.contributorReadme);
  if (existsSync(paths.backup)) {
    unlinkSync(paths.backup);
  }
  return true;
}

/**
 * Executes the requested package-lifecycle mode for the current repository.
 *
 * @param {string | undefined} mode - Expected `stage` or `restore` command-line mode.
 * @param {string} repositoryRoot - Absolute repository root containing package metadata.
 * @throws {Error} When the requested mode is unsupported.
 */
export function runReadmeLifecycle(mode, repositoryRoot) {
  if (mode === 'stage') {
    stageNpmReadme(repositoryRoot);
    process.stdout.write('Staged npm-readme.md as the package README.\n');
    return;
  }
  if (mode === 'restore') {
    const restored = restoreContributorReadme(repositoryRoot);
    process.stdout.write(
      restored
        ? 'Restored the contributor README.md.\n'
        : 'No staged README backup required restoration.\n'
    );
    return;
  }
  throw new Error('Usage: node scripts/stage-npm-readme.mjs <stage|restore>');
}

/** Absolute directory containing the repository package manifest and README sources. */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Whether this module was launched as the lifecycle executable instead of imported by a test. */
const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isDirectExecution) {
  try {
    runReadmeLifecycle(process.argv[2], repositoryRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`README lifecycle failed: ${message}\n`);
    process.exitCode = 1;
  }
}
