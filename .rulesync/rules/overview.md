---
root: true
targets:
  - agentsmd
  - codexcli
  - claudecode
description: http-client project overview, architecture, and working conventions
---

# @reggieofarrell/http-client — project instructions

Canonical, always-loaded project memory. Authored once in `.rulesync/rules/overview.md` and
generated to the root `AGENTS.md` (read by Codex and others) and to `CLAUDE.md` (Claude Code does
not read `AGENTS.md`). Both are generated files — edit the source, never these directly.

## What this is

A lightweight, fetch-based HTTP client for both browser and Node, built on top of
[`xior`](https://suhaotian.github.io/xior/). It provides retry with configurable backoff/jitter,
idempotency key support, path/query parameter handling, a stable typed error hierarchy, and
middleware-style hooks — while staying a thin wrapper, not a framework.

- `src/http-client.ts` — the `HttpClient` class: request dispatch, retry-interval wiring
  (`buildRetryInterval`), idempotency key injection, path/query param substitution, and the
  `beforeRequest`/`afterResponse`/`errorHandler`/`processError` extension points.
- `src/errors.ts` — the error type hierarchy (`HttpError`, `NetworkError`, `TimeoutError`,
  `SerializationError`, `AbortError`) plus the classification helpers (`classifyErrorForRetry`,
  `classifyHttpError`, `isTimeoutError`, `isAbortError`, etc.) that decide retriability.
- `src/logger.ts` — small console logging helpers used when `debug: true`.
- `src/index.ts` — the public export surface. Treat additions here as a real API commitment; this
  library re-exports most of its internals, so keep that list deliberate, not automatic.
- `src/upload-progress.ts` / `src/upload-progress.browser.ts` + `src/transports/**` — the real
  (non-simulated) upload-progress feature, a separate opt-in subpath
  (`@reggieofarrell/http-client/upload-progress`) that bypasses fetch entirely for a specific
  request. Two entry-point variants exist (universal + browser-only) specifically so a browser
  bundler never has to resolve Node's `http`/`https`/`stream` — see "Platform-specific code and
  bundlers" below before changing anything here.

There is no build-time code generator, no bundled CLI, and no framework-specific integration — keep
it that way (see "Working mode" below).

## Working mode: keep the surface small, verify before you trust a claim

- **Resist scope creep.** This library previously grew an entire OpenAPI/Swagger SDK code
  generator (`src/codegen/`, ~2,800 lines) bolted onto what's meant to be a small HTTP client. It
  was removed. Before adding a feature, ask whether it belongs in a small, general-purpose HTTP
  client or whether it's really a one-off need from whatever project is consuming it — the latter
  belongs in that project, not here.
- **A config surface should have exactly one authoritative code path.** The retry-jitter bug found
  in this codebase's history was exactly this: a "default" value silently shadowed a "real
  override" because two code paths both claimed to compute the same thing. When a setting can be
  configured at multiple levels (instance vs. per-request, say), make sure there is one place that
  resolves precedence, and that a synthesized default can never be mistaken for an explicit user
  value (track "did the user actually provide this?" separately from "what's the fallback?").
- **Verify a suspected bug empirically before fixing or reporting it.** Don't reason abstractly
  about whether code is broken — write a small throwaway script/test that exercises the real code
  path, run it, and look at the actual output. Several real, non-obvious bugs in this codebase
  (retry jitter being silently ignored, an idempotency cache leaking, aborted requests being
  misclassified as retriable) were only confirmed — and only fully understood — by doing this.
  Discard the throwaway repro once a permanent regression test replaces it.
- See `.rulesync/rules/tests.md` for how that applies specifically to this repo's test suite.
- **A runtime `typeof X !== 'undefined'` check does not make platform-specific code
  bundler-safe.** The original upload-progress design had one file statically import both the
  Node transport (`node:http`/`node:https`/`node:stream`) and the browser transport, branching at
  runtime on `typeof XMLHttpRequest`. This seemed safe — the Node-only code never *executes* in a
  browser — but a bundler must still *resolve* every static import in a file regardless of which
  branch runs, so bundling that file for a browser target failed outright (confirmed directly with
  a real `esbuild --platform=browser` bundle: four unresolvable `node:*` import errors). The actual
  fix was package.json's `"browser"` conditional export, resolving to a genuinely separate file
  (`upload-progress.browser.ts`) with zero static reference to the Node-only file at the source
  level — see `src/transports/upload-progress-plugin.browser.ts`'s module doc. If a future feature
  needs platform-specific code, assume a bundler will need to resolve *every* file's imports
  up front and design the file boundary accordingly — don't rely on a runtime guard alone.
- **For a resource that's unsafe to reuse (e.g. a stream body across a retry), track that
  explicitly rather than inferring it from another system's async cleanup state.** The
  stream-retry guard originally relied on Node's `readableEnded`/`destroyed` becoming true by the
  time a retry re-invoked the transport. Empirically, this turned out to hold reliably (20/20
  adversarial trials of a real mid-upload connection reset, retried immediately with
  `delayFactor: 0`) because `stream.pipeline()` happens to destroy a failed pipeline's streams
  synchronously-enough — but that's relying on Node-internal timing, for a bug whose failure mode
  is silent data corruption if it's ever wrong. Track the actual invariant directly instead (a
  `WeakSet` marking a stream the moment real bytes are first read from it) so the guard is correct
  by construction, not by observed timing.

## Commands

- Build: `npm run build` (dual ESM/CJS via `tsc` x2 + a marker-file step + `rollup -c` for the
  bundled root `.d.ts`). Verify with `npm run check:build`.
- Test: `npm test` (jest, ~280 tests). Coverage gate: `npm test -- --coverage`
  (`jest.config.js` `coverageThreshold`).
- Type-check: `npm run test:types`.
- Lint / format: `npm run lint` (eslint), `npm run check:format` (prettier --check), `npm run
  format` (prettier --write).
- Full local gate (mirrors CI): `npm run check:format && npm run lint && npm run rules:check &&
  npm run test:types && npm test -- --coverage && npm run build && npm run check:build && npm run
  check:audit`.

## Tooling

- **Commits:** Conventional Commits (enforced by commitlint on the `commit-msg` hook) — this drives
  `CHANGELOG.md` generation via `commit-and-tag-version` (config: `.versionrc.json`).
- **Agent config:** authored once under `.rulesync/` (rules + skills; just `cut-release` and
  `write-tests` as skills, not the broader workflow-content skill sets some projects have, like
  ADRs or docs-site sync) and generated to Cursor, Claude Code, Codex CLI, and the `AGENTS.md`
  standard via `npm run rules:sync`. Skills (not commands) so Codex CLI actually gets them — it
  only supports rulesync's "commands" feature in global mode, not per-project. Never hand-edit
  `.cursor/`, `.claude/`, `.agents/`, `AGENTS.md`, or `CLAUDE.md` — `npm run rules:check` (pre-push
  + CI) fails on drift.
- **Releasing:** see the README's "Releasing" section — `npm run release[:patch|:minor|:major]`,
  push tags, `npm run release:publish` to cut the GitHub Release that triggers the OIDC npm publish
  in `.github/workflows/release.yml`.
- **Node/npm version:** pinned via `.nvmrc`; `scripts/check-node-version.sh` (sourced from every
  Husky hook) enforces it locally and also checks npm is new enough to honor `.npmrc`'s
  `min-release-age` supply-chain cooldown.
