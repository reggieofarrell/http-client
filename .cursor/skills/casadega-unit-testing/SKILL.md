---
name: casadega-unit-testing
description: Add, repair, or review behavior-focused JavaScript or TypeScript unit tests using the repository's existing runner, helpers, coverage ownership, and falsification policy.
---
# Unit testing

Read the source contract, nearby tests, runner configuration, existing helpers, coverage ownership,
and repository testing guide. Use the existing runner and placement convention; do not introduce a
second framework or directory merely for symmetry.

Build a compact behavior matrix covering success, meaningful failure, boundary inputs, and cleanup
introduced by the change. Keep the unit real and replace only external or lower-layer boundaries
with typed spies, dependency injection, or partial mocks. Do not duplicate production logic in a
mock factory.

Assert public return values, state transitions, emitted effects, or user-visible behavior. Use exact
and structural assertions that reject malformed values, not weak substrings or incidental call
order. Restore timers, globals, subscriptions, servers, files, and spies in the owning test.

Run the narrow test while iterating. For a bug, guard, rejection, or behavior-preserving refactor,
temporarily recreate the defect and prove the new test fails for the expected reason before
restoring the implementation. Finish with the owning coverage command and the repository's complete
gate when the broader task is merge-ready.
