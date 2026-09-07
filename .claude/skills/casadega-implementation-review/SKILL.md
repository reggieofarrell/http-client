---
name: casadega-implementation-review
description: >-
  Independently review a plan-backed implementation, verify claims and gates
  instead of trusting implementer notes, mutation-test critical coverage, and
  produce an actionable report.
---
# Review a plan-backed implementation

Read the plan, diff, tests, canonical rules, and [review-template.md](review-template.md). Treat the
implementer's notes as claims that identify where to investigate, never as evidence.

- Re-run the complete planned gate on the committed tree and capture the actual chain result. A
  short-circuited later leg is unrun, not passing.
- Read the source diff and verify every load-bearing acceptance claim against exact files and lines.
- Re-run narrow reversible mutations for the highest-risk regression tests. Prefer mutations that
  fail only the intended test; broad failures provide weaker discrimination.
- Probe surfaces the plan may have omitted, including sibling types, alternate entrypoints,
  concurrency, cleanup, serialization, packaging, docs, and supported-runtime combinations.
- Evaluate deviations from the plan on their merits. The implementation may correctly reject a
  mistaken prescription; document why rather than forcing it back.

Do not fix findings during an independent review except for temporary probes and mutations that are
fully reverted. Produce findings with stable IDs, severity, exact evidence, impact, and what closes
them. Use [review-template.md](review-template.md) and state whether the tree remained unchanged.
