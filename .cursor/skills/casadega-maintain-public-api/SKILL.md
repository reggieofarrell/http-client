---
name: casadega-maintain-public-api
description: Change a published TypeScript library API while preserving intentional exports, consumer documentation, examples, compatibility signaling, and package verification.
---
# Maintain a published API

Identify every package entrypoint, exported declaration, generated declaration surface, consumer
example, README section, documentation page, migration note, and compatibility test affected by the
change. Internal source presence does not make a symbol public; an export is a deliberate contract.

- Specify the observable behavior, error shape, default, and type-level impact before editing.
- Preserve backward compatibility unless the user explicitly accepts a breaking change. Signal an
  intentional break through the repository's Conventional Commit and release policy.
- Update consumer documentation and examples in the same change. Compile or execute snippets through
  existing package checks instead of assuming they remain correct.
- Add public-path tests, including packaged ESM/CJS/browser or peer-version consumers when those
  surfaces exist.
- Build declarations and inspect the actual packed artifact. Do not infer registry contents from the
  source tree.
- Use the repository's release skill only after the implementation is verified and the user asks to
  release.
