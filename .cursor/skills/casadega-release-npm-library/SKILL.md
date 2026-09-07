---
name: casadega-release-npm-library
description: Preview, prepare, and publish a semver npm library release through a protected release branch, GitHub Release, and OIDC workflow without local npm publication.
---
# Release an npm library

Use the repository's documented release scripts and semantic-version policy. Never publish directly
from a developer machine when the project provides GitHub trusted publishing.

## Preview and approval

Start from a clean, current default branch and run the complete local gate. Run the dry-release
command and present the proposed version, bump kind, commits, and changelog. Stop for explicit user
approval before any version-writing command.

Conventional Commits suggest the version, but review actual compatibility. A patch label does not
make a breaking behavior compatible; a narrow new error subtype does not necessarily justify a minor
release. Use an exact override only when the user approves it.

## Release branch

- Create `chore/release-<version>` from the verified default branch so release work follows the
  shared Conventional Commit branch-naming policy.
- Run the approved version writer with Git hooks enabled and without creating a branch-local tag.
- Review generated changelog and manifest changes, remove duplicate merge entries only through the
  repository's documented cleanup, and run package/declaration verification.
- Push the branch and open a release PR. Do not push the release commit directly to the protected
  branch.

## Publish after merge

Pull the merged default branch, confirm the version is not already published, and create the GitHub
Release/tag through the repository command. The release event runs the complete publish verification
and npm OIDC publication. A retry must first check immutable registry state.
