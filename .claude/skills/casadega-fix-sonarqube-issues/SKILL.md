---
name: casadega-fix-sonarqube-issues
description: >-
  Investigate and fix SonarQube findings in a repository that uses Casadega
  TypeScript Repo Tooling. Use for local Sonar precheck failures, quality-gate
  issues, duplicated code, security hotspots, or host/token diagnostics. Do not
  use for ordinary lint errors without a Sonar finding.
---
# Fix SonarQube issues

## Inspect the repository contract

Read `sonar-project.properties`, `casadega-repo-tooling.config.*`, the package scripts that invoke
`casadega-repo-tooling`, the configured generated rule file, and repository-local quality rules.
Treat the committed `sonar.host.url` and `sonar.projectKey` as authoritative. Do not export or
rewrite `SONAR_HOST_URL` to work around a mismatch.

Check the working tree before editing. Preserve unrelated changes and identify whether generated
files, exclusions, or source roots affect the reported path.

## Retrieve existing findings through the pinned client

Prefer pull-request scope when a pull request exists because it matches the server quality gate:

```sh
gh pr view --json number,url,headRefName
pnpm exec casadega-repo-tooling sonar findings --pull-request <number> --format json
```

Use the exact branch analysis when no pull request exists:

```sh
git branch --show-current
pnpm exec casadega-repo-tooling sonar findings --branch <name> --format json
```

The shared command reads the committed host and project key, resolves a token for that endpoint,
validates authentication, and retrieves both open/confirmed issues and to-review security hotspots
through direct HTTP calls. It does not consult or mutate SonarQube CLI's active connection.

Never replace it with bare `sonar list issues` or `sonar api` commands. Those commands follow the
CLI's one active server, and querying a different server can return an empty result instead of an
error. Never report clean unless both the `issues` and `securityHotspots` arrays are empty.

If credentials are unavailable on macOS, follow the exact endpoint-scoped service and account in the
tooling diagnostic. A typical root-host command is:

```sh
security add-generic-password -U -s "sonarqube-cli-<host>" -a "<host>" -w
```

Leave `-w` value-less so Keychain prompts securely. Do not prefix `sonar auth login` with
`SONARQUBE_CLI_KEYCHAIN_SERVICE`: Git hooks do not inherit that variable, and the CLI's active
connection can become unusable for its own secret-scan hook. Do not store durable multi-server
tokens under the plain `sonarqube-cli` service because the CLI replaces that credential when a
different server becomes active.

If the diagnostic says an entry exists but cannot be read, run its value-less permission command and
choose **Always Allow**. Do not print the returned value. On non-macOS systems and in CI, supply
`SONAR_TOKEN` or `SONAR_USER_TOKEN` for the committed host. Local API inspection requires a user
token; a project analysis token may be rejected by user-facing APIs.

## Reproduce local analysis safely

Run the narrowest applicable command:

```sh
pnpm exec casadega-repo-tooling sonar precheck
```

For committed configuration or local ESLint-profile failures, start with the offline baseline and
drift checks instead:

```sh
pnpm exec casadega-repo-tooling sonar check
pnpm exec casadega-repo-tooling sonar rules sync --check
```

Use `--base <ref>` only when the normal base reference is unavailable or the task targets a
different comparison. Use `--all` for project-wide changed-file investigation rather than only
issues introduced against the base.

Interpret exit status `2` as an unavailable external prerequisite requiring a concrete diagnosis. Do
not describe exit status `1` as an unavailable scan: it intentionally includes configuration,
authentication, scanner, and quality failures.

If diagnostics say a conflicting environment host was ignored, keep the committed host and fix the
shell or CI environment separately. Use `sonar rules sync` to refresh a stale generated profile; the
command uses the same pinned HTTP client and does not require changing the CLI's active server. Do
not hand-edit the generated rule list. `--bootstrap` is appropriate only for initial setup before
the server is reachable, not as a workaround for authentication or drift.

## Fix the source

Inspect each finding in its surrounding code and tests. Resolve the underlying correctness,
maintainability, duplication, or security concern. Do not suppress a rule, broaden exclusions, mark
an issue false-positive, or reduce a threshold unless the user explicitly requests a durable policy
change.

Add or update behavior-focused tests when executable behavior changes. Keep documentation and
generated RuleSync outputs synchronized according to the consuming repository's commands.

Security hotspots are review questions rather than ordinary defects. You may improve the code or
explain why the behavior is safe, but never mark a hotspot Safe, Fixed, or Acknowledged and never
transition an issue without the user's explicit authorization.

## Verify and hand off

Run targeted tests and static checks, then rerun the same TypeScript Repo Tooling command that
reproduced the finding. Finish with the repository's full quality command when proportionate.

Do not query the server again to prove an unpushed source fix: existing-analysis results remain
stale until a new CI scan completes. Report fixed findings, verification, unavailable prerequisites,
and any remaining hotspots separately because they still require human review.
