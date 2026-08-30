---
name: cut-release
description: Cut and publish a new release of @reggieofarrell/http-client
targets: ["*"]
---

# Cut a release

1. Confirm the working tree is clean and `main` is up to date. Run the full local gate first:
   `npm run check:format && npm run lint && npm run rules:check && npm run test:types && npm test --
   --coverage && npm run build && npm run check:build`.
2. Preview the version bump and changelog: `npm run release:test` (dry run — reads Conventional
   Commit history since the last tag, uses `.versionrc.json` for section headers).
3. If it looks right, cut it for real: `npm run release` (or `release:patch` / `release:minor` /
   `release:major` to force a specific bump instead of letting commit types decide). This bumps
   `package.json`/`package-lock.json`, updates `CHANGELOG.md`, commits, and tags.
4. Push the commit and tag: `git push --follow-tags origin main`.
5. Create the GitHub Release, which triggers `.github/workflows/release.yml`'s publish job:
   `npm run release:publish` (wraps `gh release create v$npm_package_version --generate-notes`).
6. Watch the workflow run (`gh run watch` or the Actions tab) — it re-runs format/lint/type-check/
   tests/build/`check:audit` (deliberately not `rules:check` - agent-instruction drift is a DX
   concern for PR review, not something that should block a publish), then publishes to npm via
   Trusted Publishing (OIDC, no token). If it fails on the OIDC step and this is the first release
   since that was set up, see the README's "Releasing" section for the one-time `npm trust github`
   step and the GitHub `npm` Environment it requires.

Never manually run `npm publish` from a local machine — the point of the OIDC setup is that
publishing only happens from this workflow.
