---
name: casadega-dependency-upgrade
description: Upgrade a JavaScript or TypeScript dependency deliberately by reviewing every intervening release, verifying affected usage, respecting cooldown policy, and running the owning repository gate.
---
# Upgrade a dependency

Identify the installed version, target version, package owner, package manager, release dates, and
repository cooldown policy before changing manifests.

- Read authoritative release notes for every intervening version. Classify breaking changes,
  relevant fixes, deprecations, security changes, and useful additions.
- Search current source, tests, configuration, generated output, and docs for affected APIs before
  deciding a change does or does not apply.
- Investigate additions that overlap repository-owned work; an upgrade can expose an opportunity to
  delete a workaround or reveal a pre-existing bug.
- Install the exact reviewed version. Do not rely on a bare install when a minimum release age can
  silently select a different version. Bypass a cooldown only when the user explicitly authorizes
  it.
- Update source, tests, docs, examples, and locks for actual behavior changes. Do not create churn
  for irrelevant release-note entries.
- Run focused compatibility tests first, then the repository's canonical complete gate. Report the
  installed version and any supported runtime, peer, or API change.

Treat patch labels as hints rather than proof of compatibility; maintainers sometimes ship omitted
or breaking behavior in patch releases.
