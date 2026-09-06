import { createServer } from 'node:http';
import type { OutgoingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpClient } from '../src/http-client';
import { HttpError } from '../src/errors';

/**
 * Real-network retry verification.
 *
 * `xior/plugins/mock` (MockPlugin) cannot prove this: it attaches to an already-constructed
 * xior instance, but HttpClient's constructor registers the error-retry plugin during
 * construction, so MockPlugin is always registered *after* it. Plugins wrap in registration
 * order, so whichever registers last sees failures from everything registered before it -
 * meaning the retry plugin (registered first, by HttpClient itself) never gets a chance to
 * see MockPlugin's rejections, and no test built on MockPlugin can ever show a real retry
 * attempt count. See `.rulesync/rules/tests.md` for the full explanation and how this was
 * confirmed with a raw xior instance under both plugin orderings.
 *
 * A real local HTTP server sidesteps the problem entirely: there's no second plugin
 * competing for position, so this exercises the exact same code path production traffic does.
 */

interface RetryTestResponse {
  status: number;
  headers?: OutgoingHttpHeaders;
}

interface RetryTestServer {
  server: Server;
  baseURL: string;
  getRequestCount: () => number;
  getRequestTimes: () => number[];
}

/**
 * Starts a loopback HTTP server that records every request received by the real fetch/xior path.
 *
 * Returning a number keeps the concise status-only form used by the existing retry-count tests.
 * Returning a response descriptor additionally lets timing regressions supply headers without
 * replacing this shared server harness with one-off server implementations.
 */
function startServer(
  handler: (reqCount: number) => number | RetryTestResponse
): Promise<RetryTestServer> {
  let requestCount = 0;
  const requestTimes: number[] = [];
  const server = createServer((_req, res) => {
    requestCount++;
    requestTimes.push(Date.now());
    const handlerResult = handler(requestCount);
    const response = typeof handlerResult === 'number' ? { status: handlerResult } : handlerResult;
    res.writeHead(response.status, {
      'Content-Type': 'application/json',
      ...response.headers,
    });
    res.end(JSON.stringify({ requestCount }));
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        server,
        baseURL: `http://127.0.0.1:${port}`,
        getRequestCount: () => requestCount,
        // Return a copy so assertions cannot mutate the server's observation history while a
        // request is still in flight or accidentally affect another assertion in the same test.
        getRequestTimes: () => [...requestTimes],
      });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()));
}

describe('HttpClient retries against a real server', () => {
  test('a request that always fails is attempted exactly retries + 1 times', async () => {
    const { server, baseURL, getRequestCount } = await startServer(() => 500);
    const onRetry = jest.fn();

    try {
      const client = new HttpClient({
        baseURL,
        retryConfig: { retries: 3, delayFactor: 1, onRetry },
      });

      await expect(client.get('/flaky')).rejects.toThrow();

      expect(getRequestCount()).toBe(4); // 1 initial attempt + 3 retries
      expect(onRetry).toHaveBeenCalledTimes(3);
    } finally {
      await closeServer(server);
    }
  });

  test('a request that fails then recovers succeeds within the retry budget', async () => {
    const { server, baseURL, getRequestCount } = await startServer(count =>
      count < 3 ? 500 : 200
    );

    try {
      const client = new HttpClient({
        baseURL,
        retryConfig: { retries: 3, delayFactor: 1 },
      });

      const { data } = await client.get<{ requestCount: number }>('/flaky');

      expect(data.requestCount).toBe(3); // failed twice, succeeded on the 3rd attempt
      expect(getRequestCount()).toBe(3);
    } finally {
      await closeServer(server);
    }
  });

  test('retries: 0 (the default) makes exactly one attempt', async () => {
    const { server, baseURL, getRequestCount } = await startServer(() => 500);

    try {
      const client = new HttpClient({ baseURL });

      await expect(client.get('/flaky')).rejects.toThrow();

      expect(getRequestCount()).toBe(1);
    } finally {
      await closeServer(server);
    }
  });

  test('a per-request retryConfig.retries override retries even when the instance default is 0 (regression)', async () => {
    // Regression test: HttpClient's constructor used to register xior's error-retry plugin only
    // when `retryConfig.retries > 0` *at construction time* - so a per-request override on an
    // instance built with the default (0) retries silently did nothing, because the plugin was
    // never in xior's plugin chain at all for that request to fall into.
    const { server, baseURL, getRequestCount } = await startServer(() => 500);

    try {
      const client = new HttpClient({ baseURL }); // instance-level retries left at the default (0)

      await expect(
        client.get('/flaky', { retryConfig: { retries: 3, delayFactor: 1 } })
      ).rejects.toThrow();

      expect(getRequestCount()).toBe(4); // 1 initial attempt + 3 retries
    } finally {
      await closeServer(server);
    }
  });

  test('the thrown error isRetriable matches the per-request enableRetry override that actually ran (regression)', async () => {
    // Regression test: the thrown HttpError's isRetriable used to always be recomputed from the
    // instance-level enableRetry, ignoring a per-request enableRetry override that the live retry
    // loop actually used - so a request that really was retried (per its own override) could still
    // throw an error reporting isRetriable: false, and vice versa.
    const { server, baseURL, getRequestCount } = await startServer(() => 400);

    try {
      const client = new HttpClient({
        baseURL,
        retryConfig: { retries: 1, delayFactor: 1, enableRetry: () => false }, // instance: never retry
      });

      let caught: unknown;
      try {
        await client.get('/flaky', {
          retryConfig: { retries: 2, delayFactor: 1, enableRetry: () => true }, // per-request: always retry
        });
      } catch (err) {
        caught = err;
      }

      expect(getRequestCount()).toBe(3); // 1 initial attempt + 2 retries - the override actually ran
      expect(caught).toBeInstanceOf(HttpError);
      expect((caught as InstanceType<typeof HttpError>).isRetriable).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  test('a non-retriable error (4xx) is not retried even with retries configured', async () => {
    const { server, baseURL, getRequestCount } = await startServer(() => 404);

    try {
      const client = new HttpClient({
        baseURL,
        retryConfig: { retries: 3, delayFactor: 1 },
      });

      await expect(client.get('/missing')).rejects.toThrow();

      expect(getRequestCount()).toBe(1);
    } finally {
      await closeServer(server);
    }
  });

  test('a numeric Retry-After header delays a real 429 retry without jitter (regression)', async () => {
    // Regression test for issue #35. This must use the public API and a real server because xior's
    // MockPlugin cannot expose its rejection to the retry plugin in HttpClient's plugin order.
    const { server, baseURL, getRequestCount, getRequestTimes } = await startServer(() => ({
      status: 429,
      headers: { 'Retry-After': '1' },
    }));

    try {
      const client = new HttpClient({
        baseURL,
        retryConfig: {
          retries: 1,
          delayFactor: 1,
          backoffJitter: 'full',
        },
      });

      await expect(client.get('/rate-limited')).rejects.toThrow();

      const requestTimes = getRequestTimes();
      const firstRequestAt = requestTimes.at(0)!;
      const secondRequestAt = requestTimes.at(1)!;
      expect(getRequestCount()).toBe(2);
      // Permit ordinary timer and clock granularity while keeping the threshold far above the
      // near-zero jittered fallback that exposed the bug.
      expect(secondRequestAt - firstRequestAt).toBeGreaterThanOrEqual(900);
    } finally {
      await closeServer(server);
    }
  });

  test('an HTTP-date Retry-After header delays a real 429 retry until the specified time', async () => {
    let retryAt = 0;
    const { server, baseURL, getRequestCount, getRequestTimes } = await startServer(
      requestCount => {
        if (requestCount === 1) {
          // HTTP dates only preserve whole seconds. Aligning first and then adding one second makes
          // the requested wait reliably fall between one and two seconds instead of being truncated
          // to an arbitrarily short delay near a second boundary.
          retryAt = Math.ceil(Date.now() / 1000) * 1000 + 1000;
        }

        return {
          status: 429,
          headers: { 'Retry-After': new Date(retryAt).toUTCString() },
        };
      }
    );

    try {
      const client = new HttpClient({
        baseURL,
        retryConfig: { retries: 1, delayFactor: 1, backoffJitter: 'none' },
      });

      await expect(client.get('/rate-limited-until')).rejects.toThrow();

      const secondRequestAt = getRequestTimes().at(1)!;
      expect(getRequestCount()).toBe(2);
      // A small tolerance protects against millisecond clock granularity without allowing the
      // immediate backoff fallback that occurred when the native Headers object was unreadable.
      expect(secondRequestAt).toBeGreaterThanOrEqual(retryAt - 100);
    } finally {
      await closeServer(server);
    }
  });

  test('a response without Retry-After continues to use the configured short backoff', async () => {
    const { server, baseURL, getRequestCount, getRequestTimes } = await startServer(() => 500);

    try {
      const client = new HttpClient({
        baseURL,
        retryConfig: {
          retries: 1,
          delayFactor: 50,
          backoff: 'none',
          backoffJitter: 'none',
        },
      });

      await expect(client.get('/no-retry-after')).rejects.toThrow();

      const requestTimes = getRequestTimes();
      const firstRequestAt = requestTimes.at(0)!;
      const secondRequestAt = requestTimes.at(1)!;
      const retryGap = secondRequestAt - firstRequestAt;
      expect(getRequestCount()).toBe(2);
      expect(retryGap).toBeGreaterThanOrEqual(40);
    } finally {
      await closeServer(server);
    }
  });
});
