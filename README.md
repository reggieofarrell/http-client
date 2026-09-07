# @reggieofarrell/http-client

A lightweight, typed HTTP client for browser and Node.js applications. It wraps
[xior](https://suhaotian.github.io/xior/) with consistent retries, error classification,
idempotency controls, request hooks, and real upload-progress transports.

[Consumer guide](npm-readme.md) ·
[npm package](https://www.npmjs.com/package/@reggieofarrell/http-client) ·
[Changelog](CHANGELOG.md) ·
[Issues](https://github.com/reggieofarrell/http-client/issues)

This is the repository-facing guide for contributors and maintainers. The complete installation,
configuration, API, examples, error-handling, and migration documentation lives in the
[npm-facing consumer guide](npm-readme.md).

## Package orientation

The package provides:

- a single `HttpClient` abstraction for browser and Node.js runtimes;
- configurable retry strategies with delay, backoff, jitter, and retry classification;
- typed, stable error classes for HTTP, network, timeout, abort, and serialization failures;
- explicit idempotency-key support for safely retrying logical operations;
- path-parameter and query-parameter handling;
- request and response extension hooks without requiring consumers to replace the transport; and
- an opt-in upload-progress entry point with platform-specific browser and Node.js implementations.

The public API is intentionally small. Additions to the root export surface are compatibility
commitments and should be made deliberately.

## Consumer quick start

Install the published package:

```bash
npm install @reggieofarrell/http-client
```

Create a client and make a typed request:

```typescript
import { HttpClient } from '@reggieofarrell/http-client';

interface Todo {
  id: string;
  title: string;
}

const api = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 2,
  },
});

const { data } = await api.get<Todo[]>('/todos');
```

See [npm-readme.md](npm-readme.md) for the full consumer contract, including request options,
retries, idempotency, upload progress, hooks, error types, and breaking-change migration examples.

## Repository structure

- `src/http-client.ts` owns request orchestration, configuration precedence, retries, and hooks.
- `src/errors.ts` owns the public error hierarchy and retry/error classification helpers.
- `src/transports/` contains browser and Node.js upload-progress transports plus shared helpers.
- `src/index.ts` defines the deliberate public root export surface.
- `tests/` contains behavior-focused Jest coverage, including real transport integrations.
- `scripts/` contains deterministic build, packaging, SonarQube, hook, and README lifecycle checks.
- `.rulesync/` is the only source of coding-agent rules, skills, and hooks. Generated tool-specific
  configuration must not be edited directly.
- `docs/development/` contains maintainer procedures for releases and SonarQube.

## Development

Use the Node.js version pinned in `.nvmrc` and an npm version new enough to honor this repository's
supply-chain cooldown configuration. The repository hooks verify both versions.

```bash
npm ci
npm test
npm run build
```

Useful focused commands:

```bash
npm run check:format
npm run lint
npm run test:types
npm test -- --coverage
npm run check:build
npm run check:package
```

Before handing off a merge-ready change, run the complete local gate:

```bash
npm run release:verify
```

That command checks formatting, lint, generated RuleSync configuration, hook executability,
repository scripts, types, coverage, build output, packed package contents, README staging, and
runtime dependency vulnerabilities.

## Quality and automation

Husky and GitHub Actions enforce the repository contract:

- `pre-commit` scans staged content for secrets and runs lint-staged checks;
- `commit-msg` enforces Conventional Commits;
- `pre-push` scans outgoing commits, runs the changed-file SonarQube precheck when credentials are
  available, verifies generated agent configuration, checks hooks, and runs tests; and
- pull-request CI runs formatting, lint, types, coverage, build verification, dependency audit, and
  the authoritative SonarQube quality gate.

Do not bypass a failing gate as a routine fix. Diagnose the underlying failure and keep coverage
thresholds, security checks, and server quality gates intact.

See [docs/development/sonarqube.md](docs/development/sonarqube.md) for local credentials, server
identity, profile synchronization, CI scans, and manual re-scans.

## Agent configuration

RuleSync generates the Codex, Cursor, Claude, and `AGENTS.md` configuration from `.rulesync/`.
Change rules under `.rulesync/rules/`, skills under `.rulesync/skills/`, or hooks in
`.rulesync/hooks.jsonc`, then regenerate and verify:

```bash
npm run rules:sync
npm run rules:check
```

Never hand-edit `.agents/`, `.claude/`, `.codex/`, `.cursor/`, `AGENTS.md`, or `CLAUDE.md`.

## README publishing model

The two README sources have intentionally different audiences:

- `README.md` is this concise GitHub repository guide for contributors and maintainers.
- `npm-readme.md` is the authoritative consumer guide rendered on npm.

npm only renders a package tarball's root `README.md`, so `prepack` temporarily protects this file
as `.README.github.bak` and stages the marked `npm-readme.md` in its place. `postpack` restores the
repository guide. The package-content checker exercises that lifecycle and verifies the actual
tarball.

If packing is interrupted, restore the repository guide with:

```bash
node scripts/stage-npm-readme.mjs restore
```

Never commit `.README.github.bak` or a staged npm replacement.

## Releasing

Releases use a reviewed, two-phase semver workflow: prepare the version and changelog on a release
branch, merge the release PR, then create the GitHub Release from `main`. GitHub Actions publishes
the immutable tag to npm through Trusted Publishing; maintainers do not run `npm publish` locally.

Follow [docs/development/releasing.md](docs/development/releasing.md) and the generated `cut-release`
skill for the full preview, approval, verification, and recovery procedure.

## License

[0BSD](license.txt)
