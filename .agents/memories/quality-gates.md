# Repository quality gates

Use Conventional Commit messages (`feat:`, `fix:`, `docs:`, `refactor:`,
`test:`, `chore:`, and related conventional types). Commitlint checks each
local message.

Husky hooks are part of the repository contract. Do not bypass them merely to
make a commit or push complete. Diagnose a failing gate, fix the underlying
problem, and rerun it. A deliberate emergency bypass is an accountable human
decision, not a routine agent shortcut.

Run the full local gate before handing off a change that should match CI
(format, lint, RuleSync, hook permissions, SonarJS helper tests, types, coverage, build, audit):

`npm run check:format && npm run lint && npm run rules:check && npm run check:hooks && npm run test:sonar-rules && npm run test:types && npm test -- --coverage && npm run build && npm run check:build && npm run check:audit`

Everyday pre-push still runs the lighter `rules:check`, `check:hooks`, and `npm test`.

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
- Before trusting `sonar api`, `sonar list issues`, or another CLI query with no
  host option, verify that `sonar auth status` names the committed host. An
  empty response is not evidence of a clean project until that check succeeds.
- Preserve the pre-commit, pre-push, and CI gates when changing quality tooling.
  Do not narrow their coverage or downgrade blocking checks to warnings.

Never put Sonar tokens in source files, committed environment files, command
arguments, or logs. Follow `docs/development/sonarqube.md` for scanner setup,
rule synchronization, CI implementation, and re-scan procedures.
