# Dead-code and dependency policy

- Remove dead code, connect a genuinely missing entrypoint, or declare a dependency in the package
  that consumes it. Do not silence repository-wide analysis merely to retain an orphan.
- Mark an otherwise unreferenced export as public only when it is a deliberate supported extension
  contract, and document that intent beside the export.
- Do not retain abandoned implementations, duplicate APIs, internal helpers, speculative future
  work, or broad barrels under a public-entrypoint exception.
- Prefer narrow intentional exports and precise tool configuration. Any ignore entry must identify a
  concrete tool limitation or runtime-discovered entrypoint and stay scoped to that case.
