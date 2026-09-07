---
name: casadega-plan-execution
description: >-
  Execute a durable implementation plan completely, record deviations and
  evidence as work happens, falsify regression tests, and prepare the result for
  independent review.
---
# Execute an implementation plan

Read the plan, repository rules, and [notes-template.md](notes-template.md) completely. Work on the
branch named by the plan; if its baseline moved, rebase or update only with appropriate authority
and reverify every affected location.

- Treat settled decisions, invariants, traps, and anti-instructions as binding. Record a necessary
  deviation when it is chosen, including evidence and consequences; never silently improvise.
- Maintain notes during implementation rather than reconstructing rationale afterward.
- Implement every affected producer, consumer, sibling, test, document, generated artifact, and
  configuration surface enumerated by the plan.
- Falsify each regression test with a narrow reversible mutation and restore only that mutation.
  Never use a whole-file restore that could erase unrelated work.
- Run every focused and complete gate named by the plan. Record actual results and identify
  short-circuited or unavailable legs rather than presenting them as passing.
- Perform a refute-first self-review against acceptance criteria and source. Dispose every finding
  as fixed, demonstrated not to be a defect, or explicitly deferred with a durable reference.

Prepare the implementation, notes, tests, and plan for an independent reviewer. Do not write the
reviewer's report on the reviewer's behalf.
