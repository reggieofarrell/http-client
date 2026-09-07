---
name: casadega-sync-dual-readmes
description: >-
  Keep contributor-facing README.md and npm-facing npm-readme.md aligned for
  shared consumer facts while preserving their deliberately different audiences.
---
# Synchronize library READMEs

Use this skill in a library that stages `npm-readme.md` as the package tarball's root `README.md`
during packing and restores the contributor copy afterward.

Keep these facts aligned in both files: package purpose, installation, peer dependencies, quick
start, migration guidance, documentation links, support links, and consumer-visible limitations.
Audience-specific framing may differ, but behavior and version requirements must agree.

Keep contributor setup, testing, architecture, ADRs, and relative repository navigation in
`README.md`. Keep `npm-readme.md` consumer-focused, marked for the staging canary, and use absolute
links because the registry has no repository path context.

Never commit the staged swap or backup file. After changing either README, run documentation checks,
compile or execute important examples, and inspect a dry-run package. Confirm the contributor README
is restored and only one root README ships in the tarball.
