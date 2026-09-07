# Repository quality gates

- Use concise Conventional Commit messages when the repository requests a commit. Respect the
  configured commitlint policy and protected-branch workflow.
- Treat Husky hooks, lint-staged checks, CI jobs, and the repository's canonical complete-check
  command as contracts. Do not bypass, weaken, or downgrade them merely to make a change pass.
- Diagnose the underlying defect when a gate fails. A human may authorize an emergency bypass, but
  an agent must not make that policy decision implicitly.
- Coverage thresholds are ratchets. Add meaningful tests or document an explicitly reviewed
  recalibration; never lower a threshold as a convenience.
- Secret and security scans fail closed. A finding, malformed result, or scanner failure blocks.
  Only an explicitly modeled unavailable-prerequisite status may use a documented soft-skip path.
- Hooks may skip redundant non-security work only through a tested, fail-closed proof that the
  outgoing change was already verified. Ambiguous history, new commits, hand-resolved conflicts, and
  malformed input run the normal gates.
- Directly invoked hook files must retain executable mode. Keep the repository's hook-permission
  canary and its tests when changing agent or Git-hook configuration.
- Run and report the repository's current complete gate before handoff when the change is intended
  to be merge-ready. Read the command from current configuration rather than memorizing it here.
