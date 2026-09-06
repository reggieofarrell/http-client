# Commit conventions and releases

This library uses Conventional Commits, semantic versioning, `commit-and-tag-version`, a protected
release branch, and npm Trusted Publishing. Local release commands prepare a reviewed version;
GitHub Actions is the only recurring npm publisher.

## Preview before mutation

Start from a clean `main` synchronized with `origin/main` and run:

```bash
npm run release:verify
npm run release:bump:dry
```

Review the proposed version, commit range, and changelog. An agent must show that preview and receive
explicit version approval before running a writing command. Conventional Commit types suggest a
semantic bump, but compatibility is the final authority. Inspect patch releases from dependencies
for real behavior rather than assuming their labels guarantee compatibility.

## Prepare the release pull request

Create a branch named for the approved version:

```bash
git switch -c release/x.y.z
npm run release:bump
```

Use an approved override when necessary:

```bash
npm run release:bump -- --release-as patch
npm run release:bump -- --release-as x.y.z
```

The bump updates `package.json` and `CHANGELOG.md`, creates `chore(release): x.y.z`, and deliberately
skips the tag. Hooks remain active. Review generated notes, run `npm run release:verify`, push only
the branch, and open a PR. Never push the release commit directly to `main`.

## Publish after merge

After the release PR merges:

```bash
git switch main
git pull --ff-only
npm view @reggieofarrell/http-client versions --json
npm run release:publish
```

`release:publish` creates `vx.y.z` against the current remote `main` and publishes the GitHub Release.
The release workflow checks out that immutable tag, verifies the package, and publishes to npm using
OIDC. npm versions are immutable, so inspect registry state before retrying a workflow that may have
published successfully before reporting failure.

## Dual README lifecycle

GitHub shows `README.md`; npm shows `npm-readme.md` staged temporarily as the tarball root README.
The package lifecycle is:

1. `prepack` protects `README.md` as `.README.github.bak` and stages the marked consumer source.
2. npm packs or publishes the staged root README.
3. `postpack` restores the contributor source.

Run `node scripts/stage-npm-readme.mjs restore` after an interrupted pack. The backup is ignored and
must never be committed. `npm run check:package` stages and restores explicitly while checking the
actual dry-run tarball.

Keep consumer facts aligned in both READMEs. Contributor setup, quality gates, and this release guide
belong only in the GitHub source.
