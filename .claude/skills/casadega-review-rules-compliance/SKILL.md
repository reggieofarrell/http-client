---
name: casadega-review-rules-compliance
description: >-
  Adversarially audit a local diff, branch, or pull request for compliance with
  canonical RuleSync policy and executable repository quality gates.
---
# Review RuleSync compliance

Enumerate canonical `.rulesync/rules/` sources and identify which descriptions and globs apply to
the exact changed paths. Do not infer policy from a generated agent-tool copy.

Resolve the diff explicitly: working and staged state for local work, `<base>...HEAD` for a branch,
or verified base/head SHAs for a pull request. Separate additions, modifications, renames, and
deletions.

- Search negative rules for forbidden syntax or dependencies.
- Compare placement and naming with current repository precedent.
- Check whether new utilities, components, hooks, services, configuration, mocks, or fixtures
  duplicate an existing owner.
- Verify generated-source drift through the repository's RuleSync check.
- Run narrow architecture and policy checks relevant to the diff. Run the complete gate only when
  requested or when this review is the final merge-readiness audit.

Report confirmed violations first with severity, exact location, canonical rule, evidence, impact,
and a concrete correction. Separate suggestions and uncertainty. List checks actually run and
important behavior not checked. Do not publish review comments or mutate a pull request without
explicit authority.
