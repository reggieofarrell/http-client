---
paths:
  - 'src/**/*.{js,mjs,ts,tsx}'
  - package.json
---
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
