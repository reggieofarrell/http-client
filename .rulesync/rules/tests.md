---
root: false
targets:
  - cursor
  - claudecode
description: Testing conventions for this repo — exercise the real integration path, not just an isolated helper
globs:
  - tests/**/*.test.ts
---

# Test conventions

This repo's test suite (`tests/*.test.ts`, jest + `ts-jest`) has a specific, hard-learned failure
mode: a test that calls a private method directly can pass while the actual wiring between that
method and the public API is broken. Two real bugs hid behind exactly this pattern:

- The retry-jitter bug: `getRetryDelay(...)` was tested directly and always behaved correctly in
  isolation, but the code path that was supposed to call it with the *live* `backoffJitter` setting
  never actually ran (a default closure always shadowed it). No test exercised a real client
  configured with `backoffJitter` end-to-end through the public API.
- The idempotency cache leak: the cache-clearing logic was tested by manually seeding
  `(client as any).requestKeyCache`, not by making a real request through a subclass that mutates
  the body in `beforeRequest` (the exact pattern the README taught) and checking the cache was
  actually empty afterward.

**Prefer exercising the real integration path.** Use `xior/plugins/mock` (`MockPlugin`) and go
through the public `client.get/post/put/patch/delete/head/options()` methods, the same way a
consumer would. Reserve direct calls to a private method (`(client as any).someMethod(...)`) for
genuinely low-level unit coverage of pure logic (e.g. `getRetryDelay`'s jitter math, `parseRetryAfter`
edge cases) — and even then, pair it with at least one test that proves the *wiring* into that
method from the public API actually works, not just the method's own math.

When fixing a bug found through empirical investigation (see the root rule's "Working mode"),
write the regression test using the same public-API path you used to reproduce it, not a
re-implementation that only calls the internals you believe are responsible.

## `MockPlugin` gotcha: it cannot prove a real retry attempt count, at all

`mock.onGet/onPost/...().reply(500, data)` **resolves** the request promise with a `status: 500`
response rather than rejecting - the conversion of a non-2xx status into a thrown error happens
outside the plugin chain (in this library's own `request()`/`processError`), after the error-retry
plugin's own try/catch already ran, so that plugin never sees it. That much is fixable by using a
handler that genuinely rejects instead - `.networkError()`, `.timeout()`, `.abortRequest()`.

But the deeper problem is structural, and genuinely-rejecting handlers don't fix it either:
`HttpClient`'s constructor registers the error-retry plugin during construction, and `MockPlugin`
can only attach to an *already-constructed* xior instance (`new MockPlugin(client.client)`) -
meaning in every test in this suite, the retry plugin is necessarily registered before `MockPlugin`.
xior's plugins wrap each other in registration order (onion-style), so whichever plugin registers
**last** wraps outermost and is the only one that can catch and retry a rejection from something
registered before it. Registered in our order, the retry plugin never gets a chance to see
`MockPlugin`'s rejection at all - confirmed directly with a raw xior instance: same
`errorRetryPlugin` options, `MockPlugin` registered first → retries genuinely fire (call count 4
for `retries: 3`); registered second (our order) → call count 1, no retry, regardless of which
`MockPlugin` handler is used.

Concretely:

- **No test built on `MockPlugin` can ever prove `retryConfig.retries` produces multiple real
  attempts against an actual `HttpClient` instance** - not with `.reply()`, not with
  `.networkError()`/`.timeout()`/`.abortRequest()` either. A test asserting
  `await expect(client.get(...)).rejects.toThrow(HttpError)` is still valid for verifying error
  *classification*, but don't read "the request eventually rejected" as "retries were attempted."
- **To actually verify retry attempt counts, use a real local server instead** - spin one up with
  Node's built-in `http.createServer()`, point `baseURL` at it, and count real requests received
  server-side. This has no second plugin competing for registration order, so it exercises the
  exact same code path production traffic does. See
  `tests/http-client-retry-integration.test.ts` for the pattern (always-fails, fails-then-recovers,
  `retries: 0`, and non-retriable-4xx cases).
- To test the retry-*delay* computation itself (backoff/jitter wiring) without any of this, call
  the private `buildRetryInterval()` directly and invoke the returned function - see the
  "instance-level backoffJitter is actually wired..." regression tests in
  `tests/http-client.test.ts` for the pattern.
