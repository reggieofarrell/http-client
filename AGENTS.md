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
- Lint / format: `npm run lint` (eslint, including fail-closed SonarJS on production `src/`),
  `npm run check:format` (prettier --check), `npm run format` (prettier --write).
- SonarQube: `npm run sonar:precheck` (changed files vs `origin/main`), `npm run sonar:rules`
  (intersect server profile with `eslint-plugin-sonarjs`). See `docs/development/sonarqube.md`.
  The server quality gate is **new-code-only**; Jest `coverageThreshold` remains the coverage
  authority.
- Hook permissions: `npm run check:hooks` verifies every agent-hook command invoked by bare path
  (no interpreter) in `.claude/settings.json`/`.cursor/hooks.json`/`.codex/hooks.json` still
  points at an executable file — the executable bit is invisible to a normal content diff, so
  nothing else catches it losing that bit. `npm run test:hook-permissions` unit-tests the checker
  itself. See `scripts/check-hook-permissions.mjs`.
- Full local gate: `npm run release:verify`. It includes shared Sonar and package baselines plus
  package-content and dual-README lifecycle checks in addition to formatting, lint, RuleSync,
  hooks, types, coverage, build, and audit.

## Tooling

- **Commits:** Conventional Commits (enforced by commitlint on the `commit-msg` hook) — this drives
  `CHANGELOG.md` generation via `commit-and-tag-version` (config: `.versionrc.json`).
- **Agent config:** project-specific rules, the `write-tests` skill, and coding-agent hooks are
  authored under `.rulesync/`; broadly reusable rules and skills come from the exact installed
  `@casadega-development/ts-repo-tooling` release. RuleSync generates both sources to Cursor,
  Claude Code, Codex CLI, and the `AGENTS.md` standard. Skills (not commands) provide the one
  workflow format all three agents understand. Never hand-edit `.cursor/`, `.claude/`, `.agents/`,
  `.codex/`, `AGENTS.md`, or `CLAUDE.md` — `npm run rules:check` fails on drift.
- **SonarQube:** layered gate (local SonarJS ESLint, agent post-edit hook, fail-closed secret
  scans, skippable changed-file precheck, CI scan via `Casadega-Development/action-workflows`).
  The server gate is new-code-only. Do not put tokens in source, env files, command arguments, or
  logs.
- **Releasing:** follow `docs/development/releasing.md` and the shared
  `casadega-release-npm-library` skill. Preview with `release:bump:dry`, land `release:bump` through
  a release PR without a tag, then create the GitHub Release from merged `main` with
  `release:publish`; the release event triggers OIDC npm publication.
- **Documentation surfaces:** the Starlight site under `website/` is the authoritative consumer and
  API documentation; GitHub shows the contributor-focused `README.md`; npm receives the compact
  `npm-readme.md` entry point temporarily staged as the tarball root README. Keep each source focused
  on its audience, run `docs:build` after site changes and `check:package` after changing either
  README, and never commit `.README.github.bak` or a staged swap.
- **Node/npm version:** pinned via `.nvmrc`; `scripts/check-node-version.sh` (sourced from every
  Husky hook) enforces it locally and also checks npm is new enough to honor `.npmrc`'s
  `min-release-age` supply-chain cooldown.

# Repository quality gates

Use Conventional Commit messages (`feat:`, `fix:`, `docs:`, `refactor:`,
`test:`, `chore:`, and related conventional types). Commitlint checks each
local message.

Husky hooks are part of the repository contract. Do not bypass them merely to
make a commit or push complete. Diagnose a failing gate, fix the underlying
problem, and rerun it. A deliberate emergency bypass is an accountable human
decision, not a routine agent shortcut.

Run `npm run release:verify` before handing off a merge-ready change. It is the canonical complete
gate: formatting, lint, shared Sonar and package baselines, RuleSync, hook permissions,
repository-script tests, types, coverage, build output, package contents including dual-README
staging, documentation, and runtime audit.

Everyday pre-push still runs the lighter `rules:check`, `check:hooks`, and `npm test`.

The package release flow is preview-first and PR-based. Never restore the old `--no-verify` release
commands, create a release tag on the branch, push a generated release commit directly to `main`, or
publish locally. Follow `docs/development/releasing.md` and the shared
`casadega-release-npm-library` skill.

- The Jest `coverageThreshold` in `jest.config.js` is a ratchet. Never lower it
  merely to make a change pass; add meaningful coverage or document an
  intentional review. SonarQube's LCOV view is informational, not the coverage
  authority.
- Every active server rule implemented by `eslint-plugin-sonarjs` is an ESLint
  error on production `src/`. The SonarQube server quality gate remains
  authoritative for analyzers that cannot run locally and is **new-code-only**.
- Coding-agent post-edit hooks run a type-independent subset of that profile on
  production `src/` files. Edit `.rulesync/hooks.jsonc`, not generated hook files.
- A hook command invoked by bare path (no `node`/`bash`/etc. in front of it) depends on its
  target script's executable bit, which is invisible to a normal content diff. `npm run
  check:hooks` (pre-push + CI) fails loudly if one loses it — see
  `scripts/check-hook-permissions.mjs`. Prefer this over converting an existing bare-path hook
  command to an interpreter-prefixed one: doing so for the `claudecode` target specifically drops
  rulesync's automatic `$CLAUDE_PROJECT_DIR` rewrite (it only applies to a bare relative path),
  which would need to be hand-replicated and re-verified from any working directory.
- SonarQube secret scans are fail-closed. A finding or scanner failure blocks
  the Git operation. The server-backed pre-push check may skip only when its
  explicit status says prerequisites are unavailable; findings and analysis
  failures still block.
- Repository-local Sonar tooling must take its server only from the committed
  `sonar.host.url`. Never allow inherited `SONAR_HOST_URL` values to override or
  replace that identity; report conflicts, and block when the property is
  missing rather than treating deterministic configuration as a soft skip.
- On macOS, prefer the Sonar token stored for the committed host over an
  inherited `SONAR_TOKEN`; use the environment only as a fallback. On other
  platforms, explicitly treat `SONAR_TOKEN` as the only supported local source.
  Never print tokens or place them in command arguments or shell history.
- Use the shared `casadega-repo-tooling sonar ...` commands for repository analysis. They query the
  committed server directly and cannot silently follow the Sonar CLI's active connection to a
  different host.
- Preserve the pre-commit, pre-push, and CI gates when changing quality tooling.
  Do not narrow their coverage or downgrade blocking checks to warnings.

Never put Sonar tokens in source files, committed environment files, command
arguments, or logs. Follow `docs/development/sonarqube.md` for scanner setup,
rule synchronization, CI implementation, and re-scan procedures.

# Generated agent config — do not hand-edit

The files under `.cursor/`, `.claude/`, `.agents/`, and `.codex/`, plus the root `AGENTS.md` and
`CLAUDE.md`, are **generated by rulesync** from the single source in `.rulesync/`. Editing them
directly is lost work: the next `npm run rules:sync` overwrites them, and `npm run rules:check`
(pre-push + CI) fails when they drift from the source.

To change a rule or skill, edit `.rulesync/rules/` or `.rulesync/skills/` and run
`npm run rules:sync`. To change coding-agent hooks, edit `.rulesync/hooks.jsonc`. To add a
**skill**, create `.rulesync/skills/<skill-name>/SKILL.md` (with any extra files alongside it in
that same directory) — never a tool-specific skills directory like `.cursor/skills` or
`.claude/skills`.

For all frontmatter fields and options, see the rulesync docs:
<https://github.com/dyoshikawa/rulesync> (the "Each File Format" and configuration sections).

# Exhaustive code documentation

Every authored function needs JSDoc, including non-exported functions, methods, components, hooks,
factories, and named function-valued constants. Anonymous callbacks may rely on the documented
enclosing operation only when their purpose and lifecycle are immediately obvious; extract and
document callbacks that own domain behavior or non-obvious cleanup.

Document interfaces, type aliases, classes, constructors, properties, accessors, object-type
members, exported constants, schemas, configuration objects, and discriminated-union members.
Explain purpose, meaning, invariants, ownership, lifecycle, mutation, I/O, cleanup, security
constraints, and material thrown errors. Do not translate an identifier or TypeScript annotation
into redundant prose.

Use inline comments for reasoning, compatibility constraints, tradeoffs, and surprising control
flow. Do not narrate straightforward syntax. When touching a logical area, bring the declarations in
that area up to the same documentation standard.

# Coding fundamentals

- Use descriptive domain names. Values and functions use camelCase; types and classes use
  PascalCase; booleans read as predicates; `UPPER_SNAKE_CASE` is reserved for genuine protocol,
  environment, or module constants.
- Prefer `const`, guard clauses, and functions with one describable responsibility. Let the
  repository's formatter and linter own mechanical style.
- Use ESM in authored code. Preserve the repository's established import-specifier convention rather
  than forcing browser, bundler, and Node workspaces into one incompatible style.
- Use `async`/`await` for sequential orchestration and promise combinators for deliberate
  concurrency. Every asynchronous operation needs explicit failure and cancellation ownership.
- Keep a helper beside its narrowest real owner. Promote it only after real reuse establishes a more
  general owner; do not create speculative utilities or barrels.
- Catch only to recover, add material context, translate at the owning boundary, observe once with
  actionable context, or guarantee cleanup. Preserve the original failure as `cause` when mapping.
  Do not log and rethrow at every layer.
- Declare dependencies in the package that imports them. Diagnose peer and resolution conflicts; do
  not use force flags, relaxed peers, or unrelated overrides without explicit policy authority.
- Prefer named exports unless a documented framework or generated-code convention requires a default
  export.

# Dead-code and dependency policy

- Remove dead code, connect a genuinely missing entrypoint, or declare a dependency in the package
  that consumes it. Do not silence repository-wide analysis merely to retain an orphan.
- Mark an otherwise unreferenced export as public only when it is a deliberate supported extension
  contract, and document that intent beside the export.
- Do not retain abandoned implementations, duplicate APIs, internal helpers, speculative future
  work, or broad barrels under a public-entrypoint exception.
- Prefer narrow intentional exports and precise tool configuration. Any ignore entry must identify a
  concrete tool limitation or runtime-discovered entrypoint and stay scoped to that case.

# Published API and documentation synchronization

When a change alters an exported name, signature, option, default, error, return contract, package
entrypoint, or observable behavior, update its consumer documentation and examples in the same
change.

- Inspect the package export surface deliberately. An export is a compatibility commitment, not an
  automatic mirror of every internal implementation.
- Update the relevant README, published documentation site, API reference, and runnable or
  type-checked examples. Verify links and code snippets with the repository's actual checks.
- Record breaking behavior and changed defaults in the repository's durable migration surface. Use
  the configured Conventional Commit breaking-change syntax so release tooling calculates and
  presents the change correctly.
- Do not hand-edit a generated changelog unless the release workflow explicitly owns a documented
  post-generation correction.
- Internal refactors that preserve every public contract do not require artificial documentation
  churn.

# Repository quality gates

- Use concise Conventional Commit messages when the repository requests a commit. Respect the
  configured commitlint policy and protected-branch workflow.
- Treat Husky hooks, lint-staged checks, CI jobs, and the repository's canonical complete-check
  command as contracts. Do not bypass, weaken, or downgrade them merely to make a change pass.
- Diagnose the underlying defect when a gate fails. A human may authorize an emergency bypass, but
  an agent must not make that policy decision implicitly.
- Coverage thresholds are ratchets. Add meaningful tests or document an explicitly reviewed
  recalibration; never lower a threshold as a convenience.
- Secret and security scans fail closed. A finding, malformed result, or scanner failure blocks.
  Only an explicitly modeled unavailable-prerequisite status may use a documented soft-skip path.
- Hooks may skip redundant non-security work only through a tested, fail-closed proof that the
  outgoing change was already verified. Ambiguous history, new commits, hand-resolved conflicts, and
  malformed input run the normal gates.
- Directly invoked hook files must retain executable mode. Keep the repository's hook-permission
  canary and its tests when changing agent or Git-hook configuration.
- Run and report the repository's current complete gate before handoff when the change is intended
  to be merge-ready. Read the command from current configuration rather than memorizing it here.

# RuleSync-managed agent configuration

- Treat `.rulesync/` as the repository source of truth for project rules, skills, and hooks. Treat
  generated `.agents/`, `.claude/`, `.codex/`, `.cursor/`, `AGENTS.md`, and `CLAUDE.md` artifacts as
  build output rather than authored policy.
- Model reusable agent workflows as skills, not authored RuleSync commands. Skills provide one
  cross-tool source for Codex, Cursor, and Claude; deterministic execution belongs in repository
  scripts or the `casadega-repo-tooling` CLI.
- Shared policy belongs in its owning package. Release it there, update the consuming repository's
  exact package version and RuleSync source revision together, install with the frozen lock, and
  regenerate tool-native output.
- Never edit an installed `.curated/` source. A repository-specific specialization belongs in an
  authored local source with a distinct purpose, or an intentional same-name override when the
  repository must replace shared policy.
- Run the repository's RuleSync install, generation, and drift checks after source changes. Commit
  authored sources, source locks, package locks, and generated output together.
- Keep machine-local preferences in ignored tool-supported overrides. They are not project policy.

# SonarQube safety

- Treat `sonar.host.url` and `sonar.projectKey` in the committed `sonar-project.properties` as the
  repository's sole SonarQube authority. Do not duplicate them in package scripts, workflow
  variables, or repository-tooling config.
- Invoke `casadega-repo-tooling sonar precheck` for local changed-file analysis. Do not copy or fork
  its host, credential, API, scanner, temporary-branch, or exit-status implementation into the
  consuming repository.
- Retrieve existing pull-request or branch issues and security hotspots with
  `casadega-repo-tooling sonar findings`. Never run bare `sonar list issues` or `sonar api` queries:
  they follow SonarQube CLI's one active connection, and the wrong server can return an empty result
  that looks falsely clean. Never transition an issue or hotspot without explicit user authority.
- Require `casadega-repo-tooling sonar check` in the repository's complete local quality command so
  committed properties and generated rule-profile provenance are validated without network access.
- Generate the committed local SonarJS profile through `casadega-repo-tooling sonar rules sync` and
  verify it with `--check` where profile drift must block. Do not maintain repository-local profile
  loaders, API clients, or synchronization scripts. Use `--bootstrap` only before the intended
  server is reachable, then replace that bootstrap provenance with a normal authenticated sync.
- Never allow inherited `SONAR_HOST_URL` to override a committed host. Never pass a token on scanner
  command-line arguments, log it, persist it in repository files, or include it in an error.
- On macOS, store durable tokens under the endpoint-scoped service selected by the tooling, such as
  `sonarqube-cli-sonar.example.com`, with the URL authority as the account. Do not put durable
  multi-server credentials in the plain `sonarqube-cli` service because the CLI replaces that item
  when its active server changes. `SONAR_TOKEN` and `SONAR_USER_TOKEN` are portable fallbacks.
- Preserve exit status `0` for success, `1` for blocking failures, and `2` only for unavailable
  external prerequisites. A quality failure, invalid token, malformed configuration, or scanner
  failure must never be converted into a skip.
- Pin TypeScript Repo Tooling and shared RuleSync inputs to reviewed versions or lock revisions.
  Adopt changes explicitly instead of consuming a floating branch in protected quality gates.

# Complete and source-verified work

- Before changing a contract, search for every producer, consumer, sibling variant, generated copy,
  test, document, configuration surface, workflow, and infrastructure reference that may depend on
  it. A green implementation is still incomplete when an affected surface was never considered.
- Verify claims against current source, configuration, command output, or an authoritative external
  source. Tickets, comments, earlier turns, and summaries are investigation leads rather than proof.
- For non-trivial reviews and migrations, try to refute each conclusion. Confirm behavioral claims
  with a focused executable probe or test when the repository can do so safely.
- Report only checks that actually ran successfully on the current change. Distinguish focused
  verification from the repository's complete gate and identify skipped or unavailable checks.
- Before handoff, search for missed consumers, malformed or boundary inputs, concurrency and cleanup
  risks, weak assertions, and stale generated output. Resolve every in-scope gap that can be closed
  locally instead of presenting it as a caveat.
- Honor an explicitly narrow request, but do not silently narrow verification or omit required
  contract updates merely because the request was brief.

# Test falsification and assertion strength

- A test added for a bug, guard, rejection path, or behavior-preserving refactor is not proven by a
  green run alone. Temporarily reintroduce the smallest local source mutation that recreates the
  claimed defect, run the narrow test, confirm it fails for the expected reason, and restore the
  correct implementation before handoff.
- Use one mutation for each independent behavior claimed as regression coverage. A single red run
  for a file does not prove unrelated branches, guards, or accumulators in that file.
- If the test remains green while the defect is present, rewrite or remove it. When a test cannot
  reasonably discriminate a defect, describe it as contract or invariant coverage rather than
  claiming it as regression coverage.
- Prefer assertions that pin the complete expected public value. Negated substring assertions such
  as `not.toContain(secret)` or `not.toMatch(pattern)` can stay green when output leaks, truncates,
  or mangles part of the forbidden value. When the contract is genuinely absence, bound the result
  with an exact positive assertion or a structural check that proves the intended output.
- Make test inputs isolate the behavior under examination. Even an exact assertion is vacuous when
  an unrelated field, suffix, timestamp, or identifier can distinguish the result while the target
  behavior is broken. Hold every other result-affecting input constant.
- Keep mutations local and reversible. Never falsify a test by changing production data, remote
  services, credentials, shared infrastructure, or committed history.
- Report the mutation and narrow command used to observe the expected failure. Do not leave the
  temporary mutation in the working tree.

# Testing documentation synchronization

When a test utility, fixture, factory, mock, page object, harness, runner configuration, coverage
owner, script, command, or public helper changes, verify every maintained testing guide still
describes the executable repository accurately.

Review the human testing guide, relevant agent testing skills and rules, package scripts, CI jobs,
Git hooks, coverage configuration, and any test-layer routing table. Confirm paths, filenames,
exports, environment selectors, mode tags, cleanup ownership, and command names against source
instead of copying stale prose.

Update canonical RuleSync sources and regenerate tool-native output. Do not patch generated agent
files. A repository may keep a local companion rule listing its exact documentation and helper
paths; this shared rule owns the synchronization principle rather than project topology.

# Testing quality

- Test observable behavior, public contracts, failure modes, boundary values, and cleanup. A test
  that merely executes code, snapshots implementation detail, or calls a private helper cannot prove
  the production path is wired correctly.
- Keep the unit real and replace only external or lower-layer boundaries. Mock factories expose
  typed spies or preserve real exports; never reimplement production behavior inside a mock.
- Prefer exact public values and structural assertions. Prefix, substring, and negated-substring
  assertions can remain green for truncated, malformed, or partially leaked output.
- Isolate the behavior under examination by holding unrelated result-affecting inputs constant. Use
  deterministic clocks, randomness, identifiers, factories, and per-test state.
- Use a real local boundary when the mock framework cannot exercise the integration being claimed.
  Do not infer retry, transport, database, or serialization behavior from an incompatible double.
- Restore globals, timers, spies, subscriptions, listeners, servers, and temporary resources in the
  test that owns them. Do not use arbitrary sleeps, production services, or order-dependent state.
- Do not delete, skip, weaken, or broadly mock meaningful tests merely to make the suite pass.
  Resolve ambiguous competing contracts with the user.
- Preserve coverage ratchets and follow the shared casadega-test-falsification rule for regression,
  guard, rejection, and behavior-preserving-refactor tests.

# TypeScript quality

- Treat external data as `unknown` and validate or narrow it at the runtime boundary. Do not use
  `any`, assertions, or unreachable branches to bypass a modeling decision.
- Do not declare TypeScript enums. Use an `as const` runtime object and derive its value union, or
  use the runtime schema primitive appropriate to the validation boundary.
- Prefer discriminated unions, exhaustive switches, type guards, control-flow narrowing, and
  `satisfies`. Non-null and other assertions remain exceptional, locally proven escape hatches.
- Use `@ts-expect-error` only for an intentional negative type test or documented upstream typing
  limitation, with the expected failure explained on the same line. Never use `@ts-ignore`.
- Give exported and cross-layer boundaries explicit parameter and return types. Prefer inference for
  obvious locals and callbacks where it preserves useful precision.
- Keep a type with the module that owns its meaning. Move it to a shared package only after multiple
  runtime surfaces genuinely consume the same safe contract.
- Model omission and `null` deliberately. Default with `??` when valid falsy values must survive.
- Separate pure transformation and decision logic from I/O, logging, database, network, and state
  mutation adapters.
- Every detached promise needs a rejection owner. `void promise` suppresses a diagnostic but does
  not handle failure.
- Fix dependency cycles, invalid package boundaries, unused exports, and type-aware lint findings at
  their source instead of weakening the rule or adding broad suppression.
