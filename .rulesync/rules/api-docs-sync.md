---
root: false
targets:
  - cursor
  - claudecode
description: Keep README and Breaking Changes in sync when the public API surface changes
globs:
  - src/index.ts
  - src/http-client.ts
  - src/errors.ts
---

# Public API / docs sync

`src/index.ts`, `src/http-client.ts`, and `src/errors.ts` together define this library's public
contract — what's exported, what a config option does, what error types/shapes consumers can rely
on. A change here is not done when the code and tests pass; the README has to agree with it, and if
the change is user-visible or breaking, it needs a durable record of that fact.

When you change this surface:

1. **Update the matching README section.** The README documents config options, error types, and
   behavior in detail (e.g. the "Idempotency Controls", "Error Handling"/"Error Types", and "Retry
   Configuration" sections). A behavior change that isn't reflected there is effectively
   undocumented — this has already happened for real: the idempotency-caching simplification, the
   new `AbortError` type, and the OpenAPI codegen removal each required updating multiple README
   sections, not just the code.
2. **If the change is breaking (or changes a documented default), add an entry under the README's
   "Breaking Changes" section** describing what changed and what a consumer needs to do about it —
   don't rely on the commit message or CHANGELOG alone to carry that.
3. **Use a breaking-change commit** (`type!:` plus a `BREAKING CHANGE:` footer — see
   `.rulesync/rules/commit-messages.md`) so `commit-and-tag-version` actually surfaces it as a major
   bump and a `⚠ BREAKING CHANGES` block in `CHANGELOG.md`, instead of it silently reading as a
   normal fix/feat.
4. **Check `src/index.ts` deliberately.** Every export there is a permanent-until-a-major-bump
   commitment (see `.rulesync/rules/overview.md`'s note on this). Adding a new export is a real API
   decision, not an automatic mirror of everything internal — the same restraint applies here as to
   adding a new feature at all.
