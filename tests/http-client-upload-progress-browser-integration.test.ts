/** @jest-environment jsdom */

/**
 * The jsdom version bundled with jest-environment-jsdom@29 has no Fetch API support at all
 * (confirmed directly: `typeof Response/Headers/TextEncoder/TextDecoder/fetch` are all
 * `undefined` in this environment, only `FormData`/`XMLHttpRequest` are implemented) - a real gap
 * in this specific jsdom version, not something every real browser has. `src/transports/shared.ts`
 * genuinely needs `Response`/`Headers` (constructed for real, not duck-typed) to build a
 * spec-correct `XiorResponse`, so this test environment needs them polyfilled to exercise that
 * code at all. `undici` is what Node's own global fetch/Response/Headers are themselves built
 * from, so this is behaviorally identical to what real Node/browsers provide natively.
 *
 * Deliberately NOT polyfilling `fetch` itself: undici's real fetch doesn't work inside jsdom's
 * sandbox (it fails on jsdom-incompatible internals like resource-timing hooks and Node-specific
 * timer APIs - undici's own error even suggests switching to the "node" test environment). That's
 * fine here - the plugin's passthrough branch (a request with no `realUploadProgress` falling
 * through to xior's real adapter) is platform-agnostic code, already covered by the equivalent
 * test in tests/http-client-upload-progress-node-integration.test.ts; it doesn't need a redundant,
 * and here unworkable, browser-specific copy.
 *
 * Uses require() (not import) and runs before any other module loads, deliberately - undici's own
 * module bootstrap needs TextEncoder/TextDecoder to already be global, and ESM `import` ordering
 * (hoisted, not textual) can't guarantee that; a plain top-of-file require() executes exactly in
 * the order written.
 */
const { TextEncoder, TextDecoder } = require('node:util');
const { ReadableStream, WritableStream, TransformStream } = require('node:stream/web');
const { Blob, File } = require('node:buffer');
const { MessagePort } = require('node:worker_threads');
Object.assign(globalThis, {
  TextEncoder,
  TextDecoder,
  ReadableStream,
  WritableStream,
  TransformStream,
  Blob,
  File,
  MessagePort,
});
const { Response, Headers } = require('undici');
Object.assign(globalThis, { Response, Headers });

import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { HttpClient } from '../src/http-client';
import { HttpError } from '../src/errors';
import { createUploadProgressPlugin, UploadProgressEvent } from '../src/upload-progress';
import { createUploadProgressPlugin as createBrowserOnlyUploadProgressPlugin } from '../src/upload-progress.browser';

/**
 * Real upload-progress verification for the browser transport (XMLHttpRequest), against a real
 * server. jsdom's XMLHttpRequest implementation makes genuine network requests (it isn't a mock),
 * so this exercises the real XHR code path end to end - not a replacement for the Node
 * integration test, a distinct one, since `createUploadProgressPlugin()` dispatches to a
 * completely different transport based on `typeof XMLHttpRequest !== 'undefined'`, which is only
 * true under this jsdom environment override (see the `@jest-environment jsdom` docblock above -
 * per-file, doesn't affect the rest of the suite's default `node` environment).
 */

/**
 * jsdom's XHR implementation enforces real CORS semantics - our test server (127.0.0.1:<port>)
 * is a different origin than jsdom's default document origin, so every request needs real CORS
 * response headers (and any preflight OPTIONS request needs a real preflight response) or jsdom
 * correctly blocks it, exactly like a real browser would. This isn't a workaround for a jsdom
 * quirk - it's what a real server would also need to do to support cross-origin XHR uploads.
 */
function startServer(
  handler: (reqCount: number, body: Buffer) => number
): Promise<{ server: Server; baseURL: string; getReceivedBytes: () => number[] }> {
  let requestCount = 0;
  const receivedBytesPerRequest: number[] = [];

  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

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
        getReceivedBytes: () => receivedBytesPerRequest,
      });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()));
}

describe('HttpClient real upload progress (browser/XHR transport) against a real server', () => {
  test('an absolute URL passed as the path overrides baseURL entirely', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 200);

    try {
      // baseURL deliberately points somewhere that would fail if actually used - only the
      // absolute URL below should matter.
      const client = new HttpClient({
        baseURL: 'http://127.0.0.1:1',
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await client.post(`${baseURL}/upload`, 'some data', {
        headers: { 'Content-Type': 'text/plain' },
        realUploadProgress: () => {},
      });

      expect(getReceivedBytes()).toEqual([Buffer.byteLength('some data')]);
    } finally {
      await closeServer(server);
    }
  });

  test('a large string body reaches the server intact and fires the progress callback', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 200);
    const events: UploadProgressEvent[] = [];
    const body = 'x'.repeat(512 * 1024); // 512KB
    const expectedBytes = Buffer.byteLength(body);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await client.post('/upload', body, {
        headers: { 'Content-Type': 'text/plain' },
        realUploadProgress: event => events.push(event),
      });

      // The real, load-bearing check: the browser transport's actual request/response cycle
      // works correctly end to end - the server independently confirms it received every byte.
      expect(getReceivedBytes()).toEqual([expectedBytes]);

      // realUploadProgress is wired up and does get invoked...
      expect(events.length).toBeGreaterThan(0);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].loaded).toBeGreaterThanOrEqual(events[i - 1].loaded);
      }

      // ...but this jsdom version's own upload-progress simulation is too crude to assert
      // byte-accurate values through it: reading jsdom's XMLHttpRequest-impl.js directly
      // (setDispatchProgressEvents) shows it only ever fires a `loadstart` (loaded: 0) and a
      // single completion event, and computes `total`/`loaded` solely from a `Content-Length`
      // request header - which XHR forbids setting manually (a "forbidden header", in both
      // jsdom and every real browser) and jsdom itself doesn't auto-compute for a plain string
      // body. So `total`/`loaded` never becomes byte-accurate here, unlike a real browser's
      // native XHR (which does report real incremental bytes) or this library's Node transport
      // (verified byte-accurate against a real server in
      // tests/http-client-upload-progress-node-integration.test.ts). browser-transport.ts's
      // `xhr.upload.onprogress` handler is a thin, direct pass-through of whatever the real
      // `ProgressEvent` provides - there is no separate logic of its own to get wrong here.
    } finally {
      await closeServer(server);
    }
  });

  test('a FormData body is encoded natively by the browser and reaches the server correctly', async () => {
    const { server, baseURL } = await startServer(() => 200);
    const events: UploadProgressEvent[] = [];

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });
      const formData = new FormData();
      formData.append('field1', 'value1');
      formData.append('field2', 'value2');

      const { data } = await client.post<{ receivedBytes: number }>('/upload', formData, {
        // A caller might set this out of habit - it must be skipped so the browser's own
        // multipart boundary isn't clobbered.
        headers: { 'Content-Type': 'multipart/form-data' },
        realUploadProgress: event => events.push(event),
      });

      expect(events.length).toBeGreaterThan(0);
      expect(data.receivedBytes).toBeGreaterThan(0);
    } finally {
      await closeServer(server);
    }
  });

  test('a non-2xx final response surfaces as HttpError with the correct status', async () => {
    const { server, baseURL } = await startServer(() => 404);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await expect(
        client.post('/upload', 'some data', {
          headers: { 'Content-Type': 'text/plain' },
          realUploadProgress: () => {},
        })
      ).rejects.toMatchObject({
        constructor: HttpError,
        status: 404,
      });
    } finally {
      await closeServer(server);
    }
  });

  test('a request that exceeds its timeout rejects with a timeout error', async () => {
    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
      }
      // Otherwise deliberately never responds.
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const client = new HttpClient({
        baseURL: `http://127.0.0.1:${port}`,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await expect(
        client.post('/upload', 'some data', {
          timeout: 50,
          headers: { 'Content-Type': 'text/plain' },
          realUploadProgress: () => {},
        })
      ).rejects.toThrow(/timeout of 50ms exceeded/);
    } finally {
      await closeServer(server);
    }
  });

  test('an already-aborted signal rejects immediately', async () => {
    const { server, baseURL } = await startServer(() => 200);

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });
      const controller = new AbortController();
      controller.abort();

      await expect(
        client.post('/upload', 'some data', {
          signal: controller.signal,
          headers: { 'Content-Type': 'text/plain' },
          realUploadProgress: () => {},
        })
      ).rejects.toThrow(/aborted/i);
    } finally {
      await closeServer(server);
    }
  });

  test('aborting mid-request rejects with an abort error', async () => {
    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
      }
      // Otherwise deliberately never responds, so there's time to abort mid-flight.
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const client = new HttpClient({
        baseURL: `http://127.0.0.1:${port}`,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });
      const controller = new AbortController();

      const requestPromise = client.post('/upload', 'some data', {
        signal: controller.signal,
        headers: { 'Content-Type': 'text/plain' },
        realUploadProgress: () => {},
      });

      setTimeout(() => controller.abort(), 20);

      await expect(requestPromise).rejects.toThrow(/aborted/i);
    } finally {
      await closeServer(server);
    }
  });

  // Note: a DELETE/PUT/PATCH with realUploadProgress set but no actual data now passes through
  // to xior's real adapter (see upload-progress-plugin.ts) rather than reaching this transport at
  // all, same as a request with no realUploadProgress - platform-agnostic logic already covered
  // in tests/http-client-upload-progress-node-integration.test.ts. It can't be exercised here:
  // the passthrough path needs a real fetch, and undici's fetch doesn't work inside jsdom's
  // sandbox (see the module-level comment above).

  test('credentials: "include" sends cookies on a progress-tracked request, matching fetch semantics', async () => {
    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.url === '/set-cookie') {
        res.setHeader('Set-Cookie', 'sessionId=abc123; Path=/');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      // /upload - this is the real assertion: did the cookie actually come back?
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cookie: req.headers.cookie || null }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const baseURL = `http://127.0.0.1:${port}`;

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      // Real fetch is unusable in this jsdom environment (see module doc above), so seed the
      // cookie via a real XHR request with withCredentials, matching how a real cross-origin
      // login response would set it in an actual browser.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `${baseURL}/set-cookie`, true);
        xhr.withCredentials = true;
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error('seeding cookie failed'));
        xhr.send();
      });

      const { data } = await client.post<{ cookie: string | null }>('/upload', 'some data', {
        credentials: 'include',
        headers: { 'Content-Type': 'text/plain' },
        realUploadProgress: () => {},
      });

      expect(data.cookie).toBe('sessionId=abc123');
    } finally {
      await closeServer(server);
    }
  });

  test('without credentials: "include", cookies are not sent on a progress-tracked request', async () => {
    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.url === '/set-cookie') {
        res.setHeader('Set-Cookie', 'sessionId=abc123; Path=/');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cookie: req.headers.cookie || null }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const baseURL = `http://127.0.0.1:${port}`;

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createUploadProgressPlugin(),
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `${baseURL}/set-cookie`, true);
        xhr.withCredentials = true;
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error('seeding cookie failed'));
        xhr.send();
      });

      const { data } = await client.post<{ cookie: string | null }>('/upload', 'some data', {
        // credentials not set - default XHR behavior (no cross-origin credentials)
        headers: { 'Content-Type': 'text/plain' },
        realUploadProgress: () => {},
      });

      expect(data.cookie).toBeNull();
    } finally {
      await closeServer(server);
    }
  });
});

describe('@reggieofarrell/http-client/upload-progress "browser" export condition variant', () => {
  // `upload-progress.browser.ts`/`upload-progress-plugin.browser.ts` are resolved instead of the
  // universal files by bundlers that apply package.json's "browser" export condition - see their
  // module docs for why the split exists (a real, confirmed bundler build failure otherwise). A
  // real esbuild bundle test proves the *resolution* is correct (no node:* imports leak in); this
  // proves the *runtime behavior* is correct too - nothing imports this file otherwise, so without
  // a test here it would have zero coverage despite being real, shipped code.
  test('works end to end, identically to the universal variant', async () => {
    const { server, baseURL, getReceivedBytes } = await startServer(() => 200);
    const events: UploadProgressEvent[] = [];
    const body = 'browser-only variant test data';

    try {
      const client = new HttpClient({
        baseURL,
        uploadProgressPlugin: createBrowserOnlyUploadProgressPlugin(),
      });

      await client.post('/upload', body, {
        headers: { 'Content-Type': 'text/plain' },
        realUploadProgress: event => events.push(event),
      });

      expect(getReceivedBytes()).toEqual([Buffer.byteLength(body)]);
      expect(events.length).toBeGreaterThan(0);
    } finally {
      await closeServer(server);
    }
  });

  // Note: a passthrough test (no realUploadProgress set) isn't repeated here - confirmed directly
  // that it fails the same way as the universal variant's equivalent test, for the same reason:
  // *any* method's passthrough goes through xior's real fetch-based adapter, and undici's fetch
  // doesn't work inside this jsdom sandbox regardless of HTTP method (see the module-level comment
  // at the top of this file). `shouldHandleProgressRequest()` is shared, untouched code exercised
  // by the universal variant's own passthrough test in the Node integration test file - it doesn't
  // need a second, here-unworkable copy.
});
