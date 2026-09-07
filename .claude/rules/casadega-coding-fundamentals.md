---
paths:
  - '**/*.{js,mjs,ts,tsx}'
---
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
