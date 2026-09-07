---
root: false
targets:
  - cursor
  - claudecode
description: Keep the documentation site and package entry points in sync with public API changes
globs:
  - src/index.ts
  - src/http-client.ts
  - src/errors.ts
---

# Public API / docs sync

`src/index.ts`, `src/http-client.ts`, and `src/errors.ts` together define this library's public
contract — what's exported, what a config option does, and what error types and shapes consumers can
rely on. A change here is not done when the code and tests pass; the authoritative Starlight
consumer documentation has to agree with it, and a user-visible or breaking change needs a durable
record.

When you change this surface:

1. **Update the matching consumer documentation under `website/src/content/docs/`.** The Starlight
   site is authoritative for config options, error types, behavior, and migration guidance. A
   behavior change that is not reflected there is effectively undocumented — this has already
   happened for real: the idempotency-caching simplification, the new `AbortError` type, and the
   OpenAPI codegen removal each required updates across several consumer sections, not just the
   code.
2. **Update `README.md` only when repository orientation changes.** The GitHub README is a concise
   contributor and maintainer guide, not a second copy of the API manual. Keep its package summary,
   quick start, architecture map, commands, or links accurate when a change affects them; do not
   duplicate detailed consumer documentation into it.
3. **Update `npm-readme.md` only when its compact npm-facing facts change.** Keep its package pitch,
   installation command, quick start, and documentation link accurate, but do not duplicate the
   detailed site documentation into it.
4. **If the change is breaking (or changes a documented default), update
   `website/src/content/docs/reference/breaking-changes.md`** with what changed and what a consumer
   needs to do about it — do not rely on the commit message or CHANGELOG alone to carry that.
5. **Use a breaking-change commit** (`type!:` plus a `BREAKING CHANGE:` footer — see the shared
   `casadega-quality-gates` rule) so `commit-and-tag-version` actually surfaces it as a major
   bump and a `⚠ BREAKING CHANGES` block in `CHANGELOG.md`, instead of it silently reading as a
   normal fix/feat.
6. **Check `src/index.ts` deliberately.** Every export there is a permanent-until-a-major-bump
   commitment (see `.rulesync/rules/overview.md`'s note on this). Adding a new export is a real API
   decision, not an automatic mirror of everything internal — the same restraint applies here as to
   adding a new feature at all.

Use the documentation and dual-README lifecycle documented in `docs/development/releasing.md`.
Consumer behavior and migration guidance belong on the Starlight site; contributor setup,
architecture, testing, quality gates, and release operations belong in `README.md` or the linked
development documents. Keep `npm-readme.md` as a compact package entry point. Run
`npm run docs:build` after site changes and `npm run check:package` after updating either README.
