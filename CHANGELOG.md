# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0](https://github.com/reggieofarrell/http-client/compare/v3.0.0...v3.1.0) (2026-08-30)


### Documentation

* finalize v3.0.0 breaking changes section with migration guide ([#25](https://github.com/reggieofarrell/http-client/issues/25)) ([5b5ce7f](https://github.com/reggieofarrell/http-client/commit/5b5ce7fbd0a7df5ba868496e4b4ed8af458d5c4b))

## [3.0.0](https://github.com/reggieofarrell/http-client/compare/v2.3.1...v3.0.0) (2026-08-30)


### ⚠ BREAKING CHANGES

* the query per-request config option is removed. Use
params instead - same values, same behavior.
* errorMessagePath (instance-level and per-request) is
renamed to errorMessageExtractor. Rename any usages; behavior is
unchanged.
* aborted requests now throw AbortError instead of
NetworkError. If you were checking `error instanceof NetworkError` to
detect an abort, check `error instanceof AbortError` instead.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

* chore: adopt CI, release, and tooling improvements from flintfire

Reviewed the tooling/CI/release setup of another actively-developed
project (flintfire) and adopted what's proportionate for this smaller
library:

- Add .github/workflows/tests.yml: lint, format-check, type-check,
  tests+coverage, build+build-output-check, and a runtime-only
  `npm audit` now run on every PR. Previously nothing ran until a
  release was cut (release.yml only, triggered on publish).
- .npmrc: min-release-age=2 supply-chain cooldown, plus
  `npm run check:audit` (npm audit --omit=dev --audit-level=high) -
  meaningful here since http-client ships exactly one runtime
  dependency (xior).
- Fix a stale Prettier key (jsxBracketSameLine -> bracketSameLine).
- .versionrc.json: Keep-a-Changelog-style CHANGELOG sections instead of
  commit-and-tag-version's bare defaults.
- jest.config.js coverageThreshold as a real regression gate.
- Fix a latent ESM/CJS build issue found while working on the above:
  dist/esm/index.js has native ESM syntax but nothing declared
  "type": "module", so every Node ESM consumer got a
  MODULE_TYPELESS_PACKAGE_JSON warning and paid a reparse cost.
  scripts/finalize-esm-build.mjs writes dist/esm/package.json;
  scripts/check-build-output.mjs asserts required build output exists
  and is wired into CI.
- release.yml now publishes via npm Trusted Publishing (OIDC) instead
  of a long-lived NPM_TOKEN secret. Requires a one-time GitHub
  Environment + `npm trust github` registration, documented in the
  new README "Releasing" section.
- .nvmrc bumped 20 -> 24 (needed for OIDC and for min-release-age to
  actually be honored - Node 20's bundled npm is below the 11.10
  floor). scripts/check-node-version.sh, sourced from every Husky
  hook, enforces the pin and the npm-version floor locally.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

* chore: add rulesync-managed agent instructions (rules + skills)

Single source of truth under .rulesync/ (rules + skills, no commands -
Codex CLI only supports rulesync's "commands" feature in global mode,
not per-project, but has full project-mode skills support, and
Cursor/Claude Code support skills just as well), generated to
AGENTS.md, CLAUDE.md, .claude/, .cursor/, and .agents/ via
`npm run rules:sync`. `npm run rules:check` (pre-push + CI) fails on
drift between source and generated output.

Migrates a pre-existing hand-written .cursor/rules/general.mdc
(commit-message conventions, committed since this repo's earliest
tooling setup) into a proper managed rule so it's covered by drift
checking instead of sitting outside it.

Content: project overview and architecture, working conventions
established this session (resist scope creep, one authoritative code
path per config surface, verify bugs empirically), a public-API/docs
sync rule, test conventions including a documented MockPlugin gotcha
(a mocked non-2xx `.reply()` resolves rather than rejects, so it never
reaches the error-retry plugin and proves nothing about retry
behavior), and skills for cutting a release, writing tests, and
upgrading a dependency deliberately.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
* idempotency keys are no longer cached/reused across
separate request() calls by default; pass idempotencyKey explicitly for
manual retries. The ./codegen export and its peer dependencies are
removed.

Co-authored-by: Claude Sonnet 5 <noreply@anthropic.com>

* adopt CI/release tooling from flintfire, fix abort misclassification, upgrade xior ([#14](https://github.com/reggieofarrell/http-client/issues/14)) ([454e296](https://github.com/reggieofarrell/http-client/commit/454e296a7d9dbff4e2bf3c857272afd84d504724))


### Added

* add real (non-simulated) upload progress support ([#23](https://github.com/reggieofarrell/http-client/issues/23)) ([61519f5](https://github.com/reggieofarrell/http-client/commit/61519f5ffd9e0b133c799087f4c5e1c13e1eca12))


### Fixed

* fix retry jitter and idempotency bugs, remove OpenAPI codegen ([#13](https://github.com/reggieofarrell/http-client/issues/13)) ([9ee3276](https://github.com/reggieofarrell/http-client/commit/9ee32764e888898ba9a8e97dc9044ccd687a0cf9))
* guard against an errorHandler override that returns instead of throwing ([#24](https://github.com/reggieofarrell/http-client/issues/24)) ([04b410c](https://github.com/reggieofarrell/http-client/commit/04b410cceaf00529464d998d5734234f1a4d9540))
* network error misclassification + typed HTTP error bodies ([#20](https://github.com/reggieofarrell/http-client/issues/20)) ([e783547](https://github.com/reggieofarrell/http-client/commit/e7835476f850a3fd548d04f072b9f125b0494146))
* remove the query per-request config option ([#22](https://github.com/reggieofarrell/http-client/issues/22)) ([ea07e3c](https://github.com/reggieofarrell/http-client/commit/ea07e3c42587a4575139207cbca0f1edca289212))


### Changed

* rename errorMessagePath to errorMessageExtractor ([#19](https://github.com/reggieofarrell/http-client/issues/19)) ([9b4f989](https://github.com/reggieofarrell/http-client/commit/9b4f9894b1262e43c9be91e0bf473cea0a9a37cd))

## [2.3.1](https://github.com/reggieofarrell/http-client/compare/v2.3.0...v2.3.1) (2025-10-31)


### Features

* enhance OpenAPI code generator with type-safe error handling and improved type extraction ([#12](https://github.com/reggieofarrell/http-client/issues/12)) ([b2d3d98](https://github.com/reggieofarrell/http-client/commit/b2d3d986b086022dd483c2d99b11bad33e20c325))

## [2.3.0](https://github.com/reggieofarrell/http-client/compare/v2.2.0...v2.3.0) (2025-10-31)


### Features

* add query parameter support in HttpClient requests ([#11](https://github.com/reggieofarrell/http-client/issues/11)) ([769c102](https://github.com/reggieofarrell/http-client/commit/769c102dacd88f4a6cd4a965ac37c469cde31c20))

## [2.2.0](https://github.com/reggieofarrell/http-client/compare/v2.1.0...v2.2.0) (2025-10-31)


### Features

* add support for path parameters in HttpClient requests ([#10](https://github.com/reggieofarrell/http-client/issues/10)) ([3774383](https://github.com/reggieofarrell/http-client/commit/3774383bcbab49260ca740871de0fe0a2d8c08a4))

## [2.1.0](https://github.com/reggieofarrell/http-client/compare/v2.0.0...v2.1.0) (2025-10-17)


### Features

* introduce OpenAPI SDK Code Generator for strongly-typed client generation ([#9](https://github.com/reggieofarrell/http-client/issues/9)) ([c2268f3](https://github.com/reggieofarrell/http-client/commit/c2268f313cbdfe5a24c4477fa4b14474af56abf3))

## [2.0.0](https://github.com/reggieofarrell/http-client/compare/v1.2.1...v2.0.0) (2025-10-17)


### ⚠ BREAKING CHANGES

* introduce stable error types and enhance error handling in HttpClient (#4)

### Features

* add HEAD and OPTIONS request methods to HttpClient and make request method public ([#7](https://github.com/reggieofarrell/http-client/issues/7)) ([4b80c41](https://github.com/reggieofarrell/http-client/commit/4b80c41ad1d174e90747ccf2dacbec5144ec4b10))
* add/change middleware hooks for request and response modification in HttpClient ([#5](https://github.com/reggieofarrell/http-client/issues/5)) ([1e715eb](https://github.com/reggieofarrell/http-client/commit/1e715ebce4dde9118470ee006158652c372dc510))
* introduce stable error types and enhance error handling in HttpClient ([#4](https://github.com/reggieofarrell/http-client/issues/4)) ([697295e](https://github.com/reggieofarrell/http-client/commit/697295e434a7e92a571f8b9c3f3855dd7efb2bf4))
* refactor error handling in HttpClient with processError method ([#6](https://github.com/reggieofarrell/http-client/issues/6)) ([48fd0e7](https://github.com/reggieofarrell/http-client/commit/48fd0e716d2575051014b40c46cf2a75873224ce))

## [1.2.1](https://github.com/reggieofarrell/http-client/compare/v1.2.0...v1.2.1) (2025-10-15)


### Bug Fixes

* update package.json to fix module exports and adjust main/module paths ([06aa5d9](https://github.com/reggieofarrell/http-client/commit/06aa5d9db490427948323a19977876177bef0154))

## [1.2.0](https://github.com/reggieofarrell/http-client/compare/v1.1.0...v1.2.0) (2025-10-14)


### Features

* implement idempotency key support ([#3](https://github.com/reggieofarrell/http-client/issues/3)) ([33e157c](https://github.com/reggieofarrell/http-client/commit/33e157c18111d1cc8720aa568073b321b179c0c9))

## [1.1.0](https://github.com/reggieofarrell/http-client/compare/v1.0.6...v1.1.0) (2025-10-14)


### Features

* add backoff jitter and Retry-After header support ([#2](https://github.com/reggieofarrell/http-client/issues/2)) ([974f962](https://github.com/reggieofarrell/http-client/commit/974f962aab1d1c99c00dc7148209ba8ec30e5609))
