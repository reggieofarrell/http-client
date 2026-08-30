import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { HttpClient } from '../src/http-client';
import { HttpError, NetworkError } from '../src/errors';
import { createUploadProgressPlugin, UploadProgressEvent } from '../src/upload-progress';

jest.mock('../src/logger', () => ({ logData: jest.fn(), logInfo: jest.fn() }));

/**
 * Real upload-progress verification against a real server, following the same rationale as
 * `tests/http-client-retry-integration.test.ts`: `xior/plugins/mock` cannot exercise this code at
 * all, since the upload-progress plugin bypasses fetch/xior entirely once triggered - it never
 * reaches MockPlugin (or the reverse), so there is no mock-based way to prove any of this.
 */

function startServer(handler: (reqCount: number, body: Buffer) => number): Promise<{
  server: Server;
  baseURL: string;
  getRequestCount: () => number;
  getReceivedBytes: () => number[];
}> {
  let requestCount = 0;
  const receivedBytesPerRequest: number[] = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      requestCount++;
      const body = Buffer.concat(chunks);
      receivedBytesPerRequest.push(body.length);
      const status = handler(requestCount, body);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ requestCount, receivedBytes: body.length }));
    });
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        server,
        baseURL: `http://127.0.0.1:${port}`,
        getRequestCount: () => requestCount,
        getReceivedBytes: () => receivedBytesPerRequest,
      });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()));
}

describe('HttpClient real upload progress (Node transport) against a real server', () => {
  test('a multi-MB Buffer body reports many real, monotonically increasing progress events', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 200);
    const events: UploadProgressEvent[] = [];
    const bodySize = 2 * 1024 * 1024; // 2MB - comfortably >= 10 events at the transport's 64KB chunk size
    const body = Buffer.alloc(bodySize, 'x');

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await client.post('/upload', body, {
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: event => events.push(event),
      });

      expect(events.length).toBeGreaterThanOrEqual(10);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].loaded).toBeGreaterThanOrEqual(events[i - 1].loaded);
      }
      expect(events.every(e => e.lengthComputable)).toBe(true);
      expect(events.every(e => e.total === bodySize)).toBe(true);
      expect(events[events.length - 1].loaded).toBe(bodySize);
      expect(getReceivedBytes()).toEqual([bodySize]);
    } finally {
      await closeServer(server);
    }
  });

  test('a Readable stream body with no Content-Length reports events with lengthComputable: false', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 200);
    const events: UploadProgressEvent[] = [];
    const chunks = ['chunk-one-', 'chunk-two-', 'chunk-three'];
    const expectedBytes = Buffer.byteLength(chunks.join(''));

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });
      const stream = Readable.from(chunks);

      await client.post('/upload', stream, {
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: event => events.push(event),
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events.every(e => e.total === undefined)).toBe(true);
      expect(events.every(e => e.progress === undefined)).toBe(true);
      expect(events.every(e => e.lengthComputable === false)).toBe(true);
      expect(events[events.length - 1].loaded).toBe(expectedBytes);
      expect(getReceivedBytes()).toEqual([expectedBytes]);
    } finally {
      await closeServer(server);
    }
  });

  test('a Readable stream body with a caller-supplied Content-Length reports byte-accurate progress', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 200);
    const events: UploadProgressEvent[] = [];
    const chunks = ['known-', 'length-', 'stream'];
    const expectedBytes = Buffer.byteLength(chunks.join(''));

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });
      const stream = Readable.from(chunks);

      await client.post('/upload', stream, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(expectedBytes),
        },
        realUploadProgress: event => events.push(event),
      });

      expect(events.every(e => e.total === expectedBytes)).toBe(true);
      expect(events.every(e => e.lengthComputable === true)).toBe(true);
      expect(events[events.length - 1].loaded).toBe(expectedBytes);
      expect(getReceivedBytes()).toEqual([expectedBytes]);
    } finally {
      await closeServer(server);
    }
  });

  test('retryConfig re-uploads from scratch on each attempt, not a replay', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(count =>
      count < 3 ? 500 : 200
    );
    const eventsByAttempt: number[][] = [];
    let currentAttempt: number[] = [];
    const body = Buffer.alloc(256 * 1024, 'y');

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
        retryConfig: { retries: 3, delayFactor: 1 },
      });

      await client.post('/upload', body, {
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: event => {
          if (event.loaded <= (currentAttempt[currentAttempt.length - 1] ?? -1)) {
            eventsByAttempt.push(currentAttempt);
            currentAttempt = [];
          }
          currentAttempt.push(event.loaded);
        },
      });
      eventsByAttempt.push(currentAttempt);

      // Three real attempts (two failures + one success), each a genuinely fresh re-upload of
      // the full body - not a cached/replayed result.
      expect(eventsByAttempt.length).toBe(3);
      for (const attempt of eventsByAttempt) {
        expect(attempt[attempt.length - 1]).toBe(body.length);
      }
      expect(getReceivedBytes()).toEqual([body.length, body.length, body.length]);
    } finally {
      await closeServer(server);
    }
  });

  test('a raw Readable body cannot be retried and rejects synchronously with a clear config error', async () => {
    const { server, baseURL } = await startServer(() => 500);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
        retryConfig: { retries: 2, delayFactor: 1 },
      });
      const stream = Readable.from(['some data']);
      // Force the stream to actually be consumed once already, simulating a retry attempt
      // reaching this same (now-ended) stream a second time.
      for await (const _chunk of stream) {
        // drain
      }

      await expect(
        client.post('/upload', stream, {
          headers: { 'Content-Type': 'application/octet-stream' },
          realUploadProgress: () => {},
        })
      ).rejects.toThrow(/cannot be safely retried/);
    } finally {
      await closeServer(server);
    }
  });

  test('a stream mid-transfer (neither ended nor destroyed) is still rejected on reuse - not just a fully-drained one', async () => {
    // A stream that's genuinely in progress - readableEnded and destroyed are both still false -
    // proves the guard doesn't just work by accident of Node's pipeline() cleanup timing (already
    // confirmed reliable separately: 20/20 adversarial trials of a real mid-upload connection
    // reset, retried immediately with delayFactor: 0, were correctly rejected). This test isolates
    // the explicit "have we started reading this stream at all" tracking on its own.
    const sockets = new Set<import('node:net').Socket>();
    const server = createServer(() => {
      // Deliberately never responds, so the first request never ends and the connection is
      // never closed - the stream stays mid-transfer indefinitely.
    });
    server.on('connection', socket => sockets.add(socket));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const client = new HttpClient({
        baseURL: `http://127.0.0.1:${port}`,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });
      let firstByteRead = false;
      async function* chunks() {
        yield 'chunk-one';
        firstByteRead = true;
        // Never yields again - the generator (and therefore the stream) just hangs here,
        // neither ending nor erroring, exactly like a real slow/stalled upload in progress.
        await new Promise(() => {});
      }
      const stream = Readable.from(chunks());

      // Fire the first request but don't await it - it will hang forever since the server
      // never responds and the stream never finishes.
      const firstRequest = client
        .post('/upload', stream, {
          headers: { 'Content-Type': 'application/octet-stream' },
          realUploadProgress: () => {},
        })
        .catch(() => {
          // Expected to never settle within this test; suppress any unhandled-rejection noise
          // if it eventually does (e.g. during server teardown).
        });
      void firstRequest;

      // Wait for real confirmation that the stream has actually started being read.
      await new Promise<void>(resolve => {
        const check = setInterval(() => {
          if (firstByteRead) {
            clearInterval(check);
            resolve();
          }
        }, 5);
      });

      expect(stream.readableEnded).toBe(false);
      expect(stream.destroyed).toBe(false);

      await expect(
        client.post('/upload', stream, {
          headers: { 'Content-Type': 'application/octet-stream' },
          realUploadProgress: () => {},
        })
      ).rejects.toThrow(/cannot be safely retried/);
    } finally {
      // The first request's connection never finishes on its own (the server never responds) -
      // server.close() alone would hang forever waiting for it, so destroy it explicitly first.
      for (const socket of sockets) socket.destroy();
      await closeServer(server);
    }
  });

  test('a FormData body under Node is rejected with a clear, actionable error', async () => {
    const { server, baseURL } = await startServer(() => 200);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });
      const formData = new FormData();
      formData.append('file', 'not really a file');

      await expect(
        client.post('/upload', formData, {
          realUploadProgress: () => {},
        })
      ).rejects.toThrow(/FormData bodies aren't supported.*Node/);
    } finally {
      await closeServer(server);
    }
  });

  test('a non-2xx final response surfaces as HttpError with the correct status, same as a normal request', async () => {
    const { server, baseURL } = await startServer(() => 400);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await expect(
        client.post('/upload', Buffer.from('data'), {
          headers: { 'Content-Type': 'application/octet-stream' },
          realUploadProgress: () => {},
        })
      ).rejects.toMatchObject({
        constructor: HttpError,
        status: 400,
      });
    } finally {
      await closeServer(server);
    }
  });

  test('setting realUploadProgress without uploadProgressPlugin throws a clear config error', async () => {
    const client = new HttpClient({ baseURL: 'https://example.com' });

    await expect(
      client.post('/upload', Buffer.from('data'), {
        realUploadProgress: () => {},
      })
    ).rejects.toThrow(/requires passing uploadProgressPlugin/);
  });

  test('a request without realUploadProgress passes through unaffected even when uploadProgressPlugin is configured', async () => {
    const { server, baseURL } = await startServer(() => 200);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      const { data } = await client.get<{ requestCount: number }>('/normal');

      expect(data.requestCount).toBe(1);
    } finally {
      await closeServer(server);
    }
  });

  test('a DELETE with realUploadProgress set but no data passes through, since there is nothing to track', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 204);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await client.delete('/upload', { realUploadProgress: () => {} });

      expect(getReceivedBytes()).toEqual([0]);
    } finally {
      await closeServer(server);
    }
  });

  test('query params are included in the request URL', async () => {
    let receivedUrl: string | undefined;
    const server = createServer((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const client = new HttpClient({
        baseURL: `http://127.0.0.1:${port}`,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await client.post('/upload', Buffer.from('data'), {
        params: { foo: 'bar', limit: 10 },
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: () => {},
      });

      expect(receivedUrl).toBe('/upload?foo=bar&limit=10');
    } finally {
      await closeServer(server);
    }
  });

  test('a string body is uploaded and reported with a byte-accurate total', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 200);
    const events: UploadProgressEvent[] = [];
    const body = 'hello world, this is a string body';

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await client.post('/upload', body, {
        headers: { 'Content-Type': 'text/plain' },
        realUploadProgress: event => events.push(event),
      });

      expect(events[events.length - 1].loaded).toBe(Buffer.byteLength(body));
      expect(getReceivedBytes()).toEqual([Buffer.byteLength(body)]);
    } finally {
      await closeServer(server);
    }
  });

  test('a plain (non-Buffer) Uint8Array body is uploaded and reported with a byte-accurate total', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 200);
    const events: UploadProgressEvent[] = [];
    const body = new Uint8Array([1, 2, 3, 4, 5]);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await client.post('/upload', body, {
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: event => events.push(event),
      });

      expect(events[events.length - 1].loaded).toBe(body.length);
      expect(getReceivedBytes()).toEqual([body.length]);
    } finally {
      await closeServer(server);
    }
  });

  test('a zero-length body still fires exactly one progress event', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 200);
    const events: UploadProgressEvent[] = [];

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await client.post('/upload', Buffer.alloc(0), {
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: event => events.push(event),
      });

      expect(events).toEqual([{ loaded: 0, total: 0, progress: NaN, lengthComputable: true }]);
      expect(getReceivedBytes()).toEqual([0]);
    } finally {
      await closeServer(server);
    }
  });

  test('an unsupported (plain object) body is rejected with a clear config error', async () => {
    const client = new HttpClient({
      baseURL: 'https://example.com',
      uploadProgressPlugin: createUploadProgressPlugin(),
    });

    await expect(
      client.post('/upload', { foo: 'bar' }, { realUploadProgress: () => {} })
    ).rejects.toThrow(/requires a pre-serialized body/);
  });

  test('a plain-text (non-JSON) response body falls back to the raw text', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('not json');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const client = new HttpClient({
        baseURL: `http://127.0.0.1:${port}`,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      const { data } = await client.post('/upload', Buffer.from('data'), {
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: () => {},
      });

      expect(data).toBe('not json');
    } finally {
      await closeServer(server);
    }
  });

  test('duplicate response headers (e.g. multiple Set-Cookie) are all preserved', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('Set-Cookie', ['a=1', 'b=2']);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const client = new HttpClient({
        baseURL: `http://127.0.0.1:${port}`,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      const { request } = await client.post('/upload', Buffer.from('data'), {
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: () => {},
      });

      expect(request.headers.get('set-cookie')).toBe('a=1, b=2');
    } finally {
      await closeServer(server);
    }
  });

  test('the response stream erroring mid-read (e.g. connection reset) surfaces as a network error', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
      res.write('{"partial":');
      // Destroy the underlying socket before the promised Content-Length is satisfied - the
      // client's response stream should genuinely error while still reading the body.
      res.socket?.destroy();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const client = new HttpClient({
        baseURL: `http://127.0.0.1:${port}`,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await expect(
        client.post('/upload', Buffer.from('data'), {
          headers: { 'Content-Type': 'application/octet-stream' },
          realUploadProgress: () => {},
        })
      ).rejects.toBeInstanceOf(NetworkError);
    } finally {
      await closeServer(server);
    }
  });

  test('a genuine connection failure surfaces as a real network error, with its code preserved', async () => {
    const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>(resolve => probe.close(() => resolve()));

    const client = new HttpClient({
      baseURL: `http://127.0.0.1:${port}`,
      uploadProgressPlugin: createUploadProgressPlugin(),
    });

    let caught: unknown;
    try {
      await client.post('/upload', Buffer.from('data'), {
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: () => {},
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(NetworkError);
    expect((caught as any).message).toMatch(/ECONNREFUSED/);
    // Regression: the underlying cause's `.code` must survive onto the resulting NetworkError -
    // this silently broke when the cause-detection check used `instanceof Error`, which is not
    // reliable across realms/VM contexts (confirmed directly: a real ECONNREFUSED error's
    // `instanceof Error` came back `false` inside Jest's own sandboxed test environment).
    expect((caught as any).metadata.error.code).toBe('ECONNREFUSED');
  });

  test('a request that exceeds its timeout rejects with a timeout error', async () => {
    const server = createServer(() => {
      // Deliberately never responds.
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const client = new HttpClient({
        baseURL: `http://127.0.0.1:${port}`,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await expect(
        client.post('/upload', Buffer.from('data'), {
          timeout: 50,
          headers: { 'Content-Type': 'application/octet-stream' },
          realUploadProgress: () => {},
        })
      ).rejects.toThrow(/timeout of 50ms exceeded/);
    } finally {
      await closeServer(server);
    }
  });

  test('an already-aborted signal rejects immediately without making a request', async () => {
    const { server, baseURL, getRequestCount } = await startServer(() => 200);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });
      const controller = new AbortController();
      controller.abort();

      await expect(
        client.post('/upload', Buffer.from('data'), {
          signal: controller.signal,
          headers: { 'Content-Type': 'application/octet-stream' },
          realUploadProgress: () => {},
        })
      ).rejects.toThrow(/aborted/i);

      expect(getRequestCount()).toBe(0);
    } finally {
      await closeServer(server);
    }
  });

  test('aborting mid-request rejects with an abort error', async () => {
    const server = createServer(() => {
      // Deliberately never responds, so there's time to abort mid-flight.
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const client = new HttpClient({
        baseURL: `http://127.0.0.1:${port}`,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });
      const controller = new AbortController();

      const requestPromise = client.post('/upload', Buffer.from('data'), {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/octet-stream' },
        realUploadProgress: () => {},
      });

      setTimeout(() => controller.abort(), 20);

      await expect(requestPromise).rejects.toThrow(/aborted/i);
    } finally {
      await closeServer(server);
    }
  });
});
