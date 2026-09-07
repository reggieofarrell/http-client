---
name: casadega-implementation-planning
description: Create an evidence-backed implementation handoff for a later session or different implementer when the plan must survive a context boundary; not for ordinary in-session planning.
---
# Plan a cross-context implementation

Use this skill only when another implementer or later session needs a durable handoff. For work that
will be implemented in the current conversation, use the normal lightweight plan instead.

Read [plan-template.md](plan-template.md) and the repository's project overview, architecture,
testing guide, ADR process, and complete quality gate. Create the plan in the repository's
documented handoff location on the branch the implementer will use.

- Pin the plan to a baseline commit and re-enumerate affected producers, consumers, siblings,
  generated artifacts, docs, tests, workflows, and infrastructure.
- Verify every factual claim with source, history, a safe probe, or command output. Clearly separate
  verified facts from unavailable evidence.
- Record settled decisions, scope exclusions, invariants, traps, anti-instructions, exact file
  ownership, and observable acceptance criteria.
- Compile proposed public TypeScript signatures and run every command written into the plan. Do not
  leave conditionals that one source read could resolve.
- Promote a probe that asserts desired behavior into a permanent test. Keep question-answering
  probes reproducible and remove them with the temporary plan artifacts after review.
- Prototype only when it resolves genuine uncertainty. If a complete implementation becomes green,
  stop and ask whether the user wants the implementation or still needs a separate plan artifact.

The plan must be executable without the author's chat history, while prescribing the smallest change
that satisfies the verified contract.
