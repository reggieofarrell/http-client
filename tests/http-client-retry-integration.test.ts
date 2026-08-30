import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { HttpClient } from '../src/http-client';

jest.mock('../src/logger', () => ({ logData: jest.fn(), logInfo: jest.fn() }));

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

function startServer(
  handler: (reqCount: number) => number
): Promise<{ server: Server; baseURL: string; getRequestCount: () => number }> {
  let requestCount = 0;
  const server = createServer((_req, res) => {
    requestCount++;
    const status = handler(requestCount);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ requestCount }));
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseURL: `http://127.0.0.1:${port}`, getRequestCount: () => requestCount });
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
});
