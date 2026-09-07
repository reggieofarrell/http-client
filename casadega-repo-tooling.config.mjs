import { defineConfig } from '@casadega-development/ts-repo-tooling';

/**
 * Binds the shared Casadega quality tooling to this npm-based published library.
 *
 * The package check covers both the published package and its private Starlight
 * documentation application. The runtime check is deliberately not enabled:
 * its single-Node-major invariant describes application repositories, while
 * this library's development runtime must not become an accidental consumer
 * runtime restriction in the published manifest.
 */
export default defineConfig({
  defaultBranch: 'main',
  packageManager: 'npm',
  packages: {
    manifestPatterns: ['package.json', 'website/package.json'],
    requirePrivatePackages: false,
    synchronizeVersions: false,
  },
  sonar: {
    baseRef: 'origin/main',
    propertiesFile: 'sonar-project.properties',
    rulesFile: 'scripts/sonar-rules/rules.json',
  },
});
