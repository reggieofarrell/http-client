## Commits

When creating commit messages, always keep them concise and adhere to the [Conventional
Commits](https://www.conventionalcommits.org/en/v1.0.0/#specification) spec (this repo's
`commit-msg` hook enforces the type-enum via commitlint — see `commitlint.config.js`). All code is
merged to the default branch (`main`) via squash and merge from branches (no direct pushing to
`main`), so the individual commit messages on a branch end up in the PR notes — no need to be
verbose there; save detail for the PR description itself.
