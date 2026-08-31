import { createServer } from 'node:net';
import { AddressInfo } from 'node:net';
import { HttpClient } from '../src/http-client';
import { NetworkError, SerializationError } from '../src/errors';

jest.mock('../src/logger', () => ({ logData: jest.fn(), logInfo: jest.fn() }));

/**
 * Real-network error classification verification.
 *
 * `xior/plugins/mock` (MockPlugin) cannot prove this either, for a different reason than the
 * retry-count problem documented in `.rulesync/rules/tests.md`: its `.networkError()`/`.timeout()`/
 * `.abortRequest()` handlers all reject with an already-constructed `XiorError`, which always
 * carries a `.request` property. A genuine, unwrapped `fetch()` failure never does - browsers and
 * Node's undici both reject with a plain `TypeError` (e.g. "Failed to fetch" / "fetch failed") that
 * has no `.request` and no `.response`. Only a real failed connection reproduces that shape.
 *
 * This was a real regression: `isSerializationError` used to treat any `TypeError` as a
 * serialization failure - which is exactly what every fetch()-level network failure is named -
 * so a dropped connection, DNS failure, or CORS block was thrown as a non-retriable
 * `SerializationError` instead of a retriable `NetworkError`, and `retryConfig` silently never
 * engaged for it. `classifyErrorForRetry`'s fallback had a matching bug: it required `.request`
 * to call something "network", which a raw fetch() TypeError never has either.
 */

function getUnusedPort(): Promise<number> {
  const probe = createServer();
  return new Promise(resolve => {
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

describe('HttpClient error classification against a real connection failure', () => {
  test('a genuine connection-refused failure is a retriable NetworkError, not a SerializationError', async () => {
    const port = await getUnusedPort(); // bound then released - nothing is listening on it
    const onRetry = jest.fn();

    const client = new HttpClient({
      baseURL: `http://127.0.0.1:${port}`,
      retryConfig: { retries: 2, delayFactor: 1, onRetry },
    });

    let caught: unknown;
    try {
      await client.get('/whatever');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(NetworkError);
    expect(caught).not.toBeInstanceOf(SerializationError);
    expect((caught as NetworkError).isRetriable).toBe(true);
    // Proves the fix actually reaches the retry plugin's decision, not just processError's
    // final classification: retries now fire for a real connection failure.
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  test('a genuine connection-refused failure reports its real code, not undefined (regression)', async () => {
    // Regression test: Node's native fetch() wraps every connection-layer failure as
    // TypeError('fetch failed', { cause }), with the real code (ECONNREFUSED here) nested under
    // .cause - never as a top-level .code. Without reading .cause, metadata.error.code was always
    // undefined for every real Node fetch connection failure, and a genuine OS-level connect
    // timeout would be misclassified as NetworkError instead of TimeoutError for the same reason.
    const port = await getUnusedPort();
    const client = new HttpClient({ baseURL: `http://127.0.0.1:${port}` });

    let caught: unknown;
    try {
      await client.get('/whatever');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(NetworkError);
    const networkError = caught as NetworkError;
    expect((networkError.metadata as any).error.code).toBe('ECONNREFUSED');
    expect((networkError.metadata as any).error.type).toBe('connection_refused');
  });
});
