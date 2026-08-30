---
name: write-tests
description: Write or extend tests for @reggieofarrell/http-client following this repo's conventions
---
# Write tests

Full conventions live in `.rulesync/rules/tests.md` (loaded automatically for `tests/**/*.test.ts`
in Cursor/Claude Code). Summary for when you're about to add or change a test:

1. **Reach for `xior/plugins/mock` (`MockPlugin`) and the public API first.** Register it against
   `client.client` (the underlying xior instance), set up `mock.onGet/onPost/...().reply(...)`, then
   call the real `HttpClient` method (`client.get(...)`, `client.post(...)`, etc.) — the same way a
   consumer would. Assert on `mock.history.<method>` and on the thrown/returned value.
2. **Don't test private methods in isolation as a substitute for testing the wiring.** A private
   helper (`(client as any).someMethod(...)`) can be correct while the code that's supposed to call
   it with the right arguments is broken — this has actually happened twice in this codebase (retry
   jitter, idempotency caching). If you do test a private method directly for its own pure logic,
   also add at least one test that proves the public API actually invokes it correctly.
3. **For a bug fix, reproduce it first** with a small script or test using the real public API
   before writing the fix, and turn that same repro into the permanent regression test — don't
   write a different, narrower test that only checks the code you believe you changed.
4. **Match existing structure**: one `describe` block per feature area (see `tests/http-client.test.ts`,
   `tests/errors.test.ts`, `tests/http-client-idempotency.test.ts`), `jest.mock('../src/logger', ...)`
   at the top of files that construct a real client (keeps debug-mode `console.log` noise out of
   test output), and `mock.restore()` in an `afterEach` or at the end of each test.
5. Run `npm test -- --coverage` before considering the work done — `jest.config.js` enforces a
   `coverageThreshold`; a change that drops coverage below it should get more tests, not a lowered
   threshold.
