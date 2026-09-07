---
name: cut-release
description: >-
  Preview and prepare an @reggieofarrell/http-client semver release through a
  protected release branch, then publish it from merged main through a GitHub
  Release and npm OIDC. Always stop for explicit version approval before writing
  the release commit.
---
# Cut a release

Read `docs/development/releasing.md` and begin on a clean, current `main`. Run
`npm run release:verify`, then `npm run release:bump:dry`. Present the current version, proposed
version, bump kind, commit range, and generated changelog to the user. Do not create a release branch
or run a writing command until the user explicitly approves that version.

After approval:

1. Create `release/x.y.z` for the approved version.
2. Run `npm run release:bump`, or pass the approved `--release-as` override. The command must keep Git
   hooks enabled and skip the branch-local tag.
3. Review manifest and changelog output, run `npm run release:verify`, push the branch, and open a PR.
   Never push the release commit directly to `main`.
4. Stop until the release PR is merged.
5. Pull the merged `main`, inspect `npm view @reggieofarrell/http-client versions --json`, and run
   `npm run release:publish`. The GitHub Release creates the tag on `main` and triggers the OIDC
   publish workflow.

Never run `npm publish` from a developer machine. Before retrying a publish that may have partially
succeeded, check registry state because npm versions are immutable.

The package uses three audience-specific documentation surfaces. The Starlight site under
`website/` is the authoritative consumer and API guide; `README.md` is the repository guide for
contributors and maintainers; `npm-readme.md` is the compact npm entry point. Update each only for
facts owned by that audience. `npm run docs:build` verifies the site, while `npm run check:package`
proves the marked npm source is staged and the repository README is restored.
