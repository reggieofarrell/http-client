/**
 * Verifies that npm README staging preserves the contributor source, rejects invalid inputs, and
 * can recover safely from repeated or interrupted lifecycle calls.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { npmReadmeMarker, restoreContributorReadme, stageNpmReadme } from './stage-npm-readme.mjs';

/** Temporary repositories removed after each lifecycle test. */
const temporaryRepositories = [];

/**
 * Creates an isolated repository-shaped directory with distinct contributor and consumer sources.
 *
 * @returns {string} Absolute path to the temporary repository.
 */
function createRepositoryFixture() {
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'http-client-readme-'));
  temporaryRepositories.push(repositoryRoot);
  writeFileSync(join(repositoryRoot, 'README.md'), '# Contributor\n', 'utf8');
  writeFileSync(
    join(repositoryRoot, 'npm-readme.md'),
    `${npmReadmeMarker}\n\n# Consumer\n`,
    'utf8'
  );
  return repositoryRoot;
}

afterEach(() => {
  for (const repositoryRoot of temporaryRepositories.splice(0)) {
    rmSync(repositoryRoot, { force: true, recursive: true });
  }
});

describe('npm README lifecycle', () => {
  it('stages the consumer source and restores the original contributor source', () => {
    const repositoryRoot = createRepositoryFixture();

    stageNpmReadme(repositoryRoot);
    assert.equal(
      readFileSync(join(repositoryRoot, 'README.md'), 'utf8'),
      `${npmReadmeMarker}\n\n# Consumer\n`
    );

    assert.equal(restoreContributorReadme(repositoryRoot), true);
    assert.equal(readFileSync(join(repositoryRoot, 'README.md'), 'utf8'), '# Contributor\n');
    assert.equal(restoreContributorReadme(repositoryRoot), false);
  });

  it('preserves the first backup when staging is repeated after an interrupted pack', () => {
    const repositoryRoot = createRepositoryFixture();

    stageNpmReadme(repositoryRoot);
    stageNpmReadme(repositoryRoot);
    restoreContributorReadme(repositoryRoot);

    assert.equal(readFileSync(join(repositoryRoot, 'README.md'), 'utf8'), '# Contributor\n');
  });

  it('rejects a consumer README without the package identity marker', () => {
    const repositoryRoot = createRepositoryFixture();
    writeFileSync(join(repositoryRoot, 'npm-readme.md'), '# Unmarked consumer\n', 'utf8');

    assert.throws(() => stageNpmReadme(repositoryRoot), /must contain the marker/u);
    assert.equal(readFileSync(join(repositoryRoot, 'README.md'), 'utf8'), '# Contributor\n');
  });
});
