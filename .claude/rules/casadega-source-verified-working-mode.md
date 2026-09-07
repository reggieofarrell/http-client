# Complete and source-verified work

- Before changing a contract, search for every producer, consumer, sibling variant, generated copy,
  test, document, configuration surface, workflow, and infrastructure reference that may depend on
  it. A green implementation is still incomplete when an affected surface was never considered.
- Verify claims against current source, configuration, command output, or an authoritative external
  source. Tickets, comments, earlier turns, and summaries are investigation leads rather than proof.
- For non-trivial reviews and migrations, try to refute each conclusion. Confirm behavioral claims
  with a focused executable probe or test when the repository can do so safely.
- Report only checks that actually ran successfully on the current change. Distinguish focused
  verification from the repository's complete gate and identify skipped or unavailable checks.
- Before handoff, search for missed consumers, malformed or boundary inputs, concurrency and cleanup
  risks, weak assertions, and stale generated output. Resolve every in-scope gap that can be closed
  locally instead of presenting it as a caveat.
- Honor an explicitly narrow request, but do not silently narrow verification or omit required
  contract updates merely because the request was brief.
