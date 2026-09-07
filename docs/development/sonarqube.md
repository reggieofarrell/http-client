# SonarQube development setup

This library uses <https://sonar.casadega.dev> with project key
`reggieofarrell_http-client_fa00cd5b-d27d-4e01-ad36-07bef0a90815`. Keep
`sonar-project.properties`, `.sonarlint/connectedMode.json`, and the VS Code connected-mode binding
in sync if that identity changes.

## Quality layers

- **Local ESLint:** shared TypeScript Repo Tooling maps every active server rule implemented by its
  installed `eslint-plugin-sonarjs` version onto production `src/` as a blocking error.
- **Agent post-edit hook:** RuleSync generates a fast, type-independent subset of the same profile.
- **Pre-push precheck:** shared tooling runs Sonar Scanner against files changed from `origin/main`.
  Exit status 2 is a loud unavailable-prerequisite skip; findings and scanner failures block.
- **CI:** the Tests workflow uploads Jest LCOV and calls the shared Casadega scanner workflow. The
  server gate is new-code-only. Jest's `coverageThreshold` remains the coverage authority.

Neither the local plugin nor SonarQube for IDE replaces the server's complete analysis.

## CI setup

Configure these values at the repository level:

| Name                      | Kind     | Purpose                                                        |
| ------------------------- | -------- | -------------------------------------------------------------- |
| `SONAR_TOKEN`             | Secret   | Project analysis token for this exact Sonar project            |
| `SONAR_HOST_URL`          | Variable | `https://sonar.casadega.dev`                                   |
| `CASADEGA_PACKAGES_TOKEN` | Secret   | Read-only GitHub token for the private shared tooling package  |

The Tests workflow runs for pull requests to `main` and pushes to `main`. It calls
`Casadega-Development/action-workflows/.github/workflows/sonar-scan.yml@main`, restores Jest
coverage, sends explicit pull-request or branch parameters, and enforces both the new-code issue
gate and the official SonarQube quality gate. SonarQube's configured GitHub integration owns pull
request decoration; this repository does not post a second custom Actions comment.

The caller maps `CASADEGA_PACKAGES_TOKEN` to the reusable workflow's `NODE_AUTH_TOKEN` secret because
the scanner restores the locked private development dependency. See
[private-packages.md](./private-packages.md) for the package credential contract.

Cloudflare in front of the server must skip Bot Fight or Managed Challenge behavior for scanner
paths such as `/batch*` and `/api/ce/submit`. A challenge page is reported by Scanner as an
authorization failure.

## Manual re-scan

The `SonarQube Re-scan` workflow can analyze an already tested commit without rebuilding coverage.
Open a completed Tests run, copy its numeric run ID, and provide it to the manual workflow. The
shared `sonar-scan-after-tests.yml@main` workflow restores coverage and derives the original pull
request or branch context.

## Local tools and credentials

Install SonarQube Scanner for local prechecks. The SonarQube CLI remains required by the fail-closed
Git pre-commit and pre-push secret-scanning hooks, but shared repository tooling does not use the
CLI's active server for API requests.

On macOS:

```bash
brew install sonar-scanner
curl -o- https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.sh | bash
```

Shared tooling reads the committed `sonar.host.url` and queries that exact endpoint. A conflicting
inherited `SONAR_HOST_URL` is reported and ignored. Store a user token in the endpoint-scoped macOS
Keychain entry without changing SonarQube CLI's active connection:

```bash
security add-generic-password \
  -U \
  -s "sonarqube-cli-sonar.casadega.dev" \
  -a "sonar.casadega.dev" \
  -w
```

Leave `-w` value-less so Keychain prompts securely. If macOS reports that the item exists but the
tool cannot read it, grant access once and select **Always Allow**:

```bash
security find-generic-password \
  -s "sonarqube-cli-sonar.casadega.dev" \
  -a "sonar.casadega.dev" \
  -w > /dev/null
```

The command stores and prints nothing because output is discarded. Never append the token to either
command or put it in shell history.

On non-macOS systems, provide a user token temporarily through `SONAR_TOKEN` or
`SONAR_USER_TOKEN`. The precheck and findings APIs need a user token; do not reuse the narrowly
scoped CI analysis token locally.

## Shared commands

```bash
npm run sonar:check
npm run sonar:rules
npm run sonar:rules:check
npm run sonar:precheck
npm run sonar:precheck -- --all
npm run sonar:precheck -- --base origin/main
npm run sonar:findings -- --pull-request 123
```

`sonar:check` is the normal offline baseline gate. It validates the committed project properties,
generated profile provenance, and locally available rules without credentials.

`sonar:rules` retrieves the active JavaScript and TypeScript quality profiles directly from the
committed server and writes `scripts/sonar-rules/rules.json`. It uses the server defaults before a
project is provisioned and the project-assigned profiles afterward. `--bootstrap` is only an
initial offline fallback, not an authentication workaround.

`sonar:precheck` creates an isolated temporary analysis branch, runs Scanner only for changed
analyzable files, retrieves findings, and makes a best-effort attempt to remove the temporary branch.
Use `--all` to include pre-existing findings in changed files.

`sonar:findings` retrieves both open issues and security hotspots awaiting review for an existing
pull-request or branch analysis. It uses the same pinned host and credential resolver, so an empty
response from another active CLI connection can never be mistaken for a clean project.

Never put Sonar tokens in source files, committed environment files, command arguments, shell
history, or logs.

## Git hooks and agent feedback

Husky installs three complementary hooks:

- `pre-commit` runs the SonarQube CLI staged-secret scan and lint-staged;
- `commit-msg` enforces Conventional Commits; and
- `pre-push` runs the outgoing-commit secret scan, shared changed-file precheck, RuleSync drift
  check, hook-permission check, and tests.

Secret scan failures always block. The server-backed precheck alone may return the documented
unavailable status when its external prerequisites cannot run.

RuleSync generates Codex, Cursor, and Claude post-edit hooks from `.rulesync/hooks.jsonc`. The hook
script invokes `eslint.sonar-hook.config.mjs`, which composes the fast generated profile through
shared tooling. Edit the canonical RuleSync hook or local adapter and regenerate; never edit the
generated tool configuration directly.

## SonarQube for IDE

The repository checks in its connected-mode project binding. In VS Code or Cursor, configure a
SonarQube connection whose ID is `https-sonar-casadega-dev`, point it at the committed host, and bind
the project key recorded above.
