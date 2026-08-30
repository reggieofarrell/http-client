---
name: dependency-upgrade
description: Upgrade a dependency deliberately - review its changelog, check for breakage and new opportunities, then verify
targets: ["*"]
---

# Upgrade a dependency

This is the workflow actually used to bump `xior` from `0.7.8` to `0.8.4` (and to add `rulesync`
itself) - not a generic "run npm update" reminder. Follow it for any real dependency bump, not just
routine patch releases.

1. **Read the changelog for everything between the current and target version**, not just the
   latest entry. For a GitHub-hosted project, fetch its `CHANGELOG.md` directly rather than relying
   on memory of the package. Categorize each entry: breaking changes that could affect this repo's
   usage, new features/options that are pure additions, and bug fixes.
2. **Grep this repo for anything the changelog's breaking changes might touch** before assuming
   they don't apply - a breaking change in an area this codebase doesn't use is not actually
   breaking here, but confirm that with a search, not an assumption.
3. **Treat "does this open a new opportunity" as a real question, not a formality.** Investigating
   xior's `isCancel` utility (added as a new export) surfaced a real, pre-existing bug in this
   codebase's own abort-error classification - the version bump was the occasion for finding it,
   not the fix itself. When a changelog entry looks related to something this codebase already
   does its own version of, check whether the existing code is actually correct, empirically (see
   `.rulesync/rules/overview.md`'s "verify before you trust a claim").
4. **Install the specific version you actually want**, not a bare `npm install <pkg>` - this
   repo's `.npmrc` sets `min-release-age`, and a bare install has been observed to resolve to a
   surprisingly old version rather than the newest cooldown-eligible one (silently, with no error).
   Check `npm view <pkg> time --json` for actual publish dates, pick the newest release that
   clears the cooldown window, and install that exact version: `npm install <pkg>@<version>`.
5. **Run the full local gate** (`npm run check:format && npm run lint && npm run rules:check &&
   npm run test:types && npm test -- --coverage && npm run build && npm run check:build`) before
   considering the bump done.
6. **Update `src/`/README/tests for anything the bump actually changed or enabled** - see
   `.rulesync/rules/api-docs-sync.md` if the change touches the public API surface.
