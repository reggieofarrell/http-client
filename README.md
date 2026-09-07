# Http Client

A class-based lightweight HTTP client for Node.js and browsers built on [`xior`](https://suhaotian.github.io/xior/), with practical defaults for retries, idempotency keys, and extensible middleware hooks.

## Table of contents

- [Documentation](#documentation)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Repository and npm READMEs](#repository-and-npm-readmes)
- [Releasing](#releasing)
- [Quality gates](#quality-gates)
- [License](#license)

## Documentation

Primary docs are hosted at the project site:

- https://reggieofarrell.github.io/http-client/

The site is organized as a multi-page docs set with getting started, usage guides, and API reference.

npm-facing docs are intentionally compact and can be found in `npm-readme.md` (or npm's package page README once published).

## Installation

```bash
npm install @reggieofarrell/http-client
```

## Quick start

```ts
import { HttpClient } from '@reggieofarrell/http-client';

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 2,
    delayFactor: 500,
  },
});

const { data } = await client.get('/status');
console.log(data);
```

For detailed configuration, request patterns, retry strategy, error taxonomy, middleware hooks, and migration notes, use the docs site.

## Repository and npm READMEs

GitHub renders this contributor-focused `README.md`. npm consumers receive `npm-readme.md`, which is temporarily staged as the package tarball's root `README.md` by the `prepack` and `postpack` lifecycle scripts. There is no package-manifest field for an alternate npm README.

Keep installation, package behavior, examples, migration guidance, and consumer-facing links consistent in both sources. Contributor setup, quality gates, architecture, and release operations belong only here.

Never commit `.README.github.bak` or a staged replacement; recover an interrupted pack with `node scripts/stage-npm-readme.mjs restore`.

`npm run check:package` verifies the npm-facing marker, required runtime and declaration entrypoints, the root-file allowlist, and restoration of this contributor README.

## Releasing

Releases use a protected two-phase flow. Start from a clean, current `main`, run
`npm run release:verify`, then preview with `npm run release:bump:dry`. Obtain explicit approval of the proposed semver before writing anything.

Create `release/x.y.z`, run `npm run release:bump` (or pass an approved `--release-as` override), and open a PR. The bump updates `package.json` and `CHANGELOG.md` and creates the release commit but does not create a tag. Git hooks remain enabled.

After the release PR merges, pull `main` and run `npm run release:publish`. That creates the `v{x}.{y}.{z}` GitHub release on `main`; the release event runs verification and publishes through npm Trusted Publishing. Never run `npm publish` locally. See
[docs/development/releasing.md](docs/development/releasing.md) for the complete process and recovery guidance.

Publishing to npm uses [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) — there is no long-lived npm token in CI. This requires a one-time setup per maintainer machine/repo:

- a GitHub Environment named `npm`
- `npm trust github --repository reggieofarrell/http-client --file release.yml --environment npm --allow-publish`

## Quality gates

Pull requests run format, lint (including locally implemented SonarJS rules on `src/`), types,
Jest with `coverageThreshold`, build, and a runtime-dependency audit. Pushes to `main` also
upload coverage to SonarQube at <https://sonar.casadega.dev> (new-code quality gate). PR
decoration is deferred until that `main` baseline exists; see [docs/development/sonarqube.md](docs/development/sonarqube.md).

Local Husky hooks run a fail-closed secret scan on commit and push. Coding-agent post-edit hooks run a type-independent SonarJS subset on production `src/` files. The changed-file Sonar precheck (`npm run sonar:precheck`) skips loudly when Scanner or credentials are missing; CI
still enforces the full scan after the project is provisioned.

## License

0BSD
