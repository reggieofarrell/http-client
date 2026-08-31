# Http Client

A class based lightweight HTTP client for both the server and browser built on `xior` with retry functionality, written in TypeScript.

## Table of Contents

- [Installation](#installation)
- [Built on](#built-on)
- [Usage](#usage)
  - [Configuration Options](#configuration-options)
  - [Basic Setup](#basic-setup)
  - [Making Requests](#making-requests)
  - [Request Configuration](#request-configuration)
  - [Path Parameters](#path-parameters)
  - [Query Parameters](#query-parameters)
  - [Timeout Configuration](#timeout-configuration)
  - [Aborting In-Flight Requests](#aborting-in-flight-requests)
  - [Retry Configuration with Jitter](#retry-configuration-with-jitter)
  - [Idempotency Controls](#idempotency-controls)
  - [Disable TLS checks (server only - Node.js)](#disable-tls-checks-server-only---nodejs)
  - [Different Request Data Types](#different-request-data-types)
  - [Upload Progress](#upload-progress)
  - [Adding Xior Plugins](#adding-xior-plugins)
  - [Accessing the underlying client](#accessing-the-underlying-client)
  - [Direct access to the underlying xior instance](#direct-access-to-the-underlying-xior-instance)
  - [Type responses](#type-responses)
  - [Middleware Hooks](#middleware-hooks)
  - [Extending the HttpClient](#extending-the-httpclient)
  - [Error Handling](#error-handling)
  - [Debugging](#debugging)
- [Breaking Changes](#breaking-changes)
- [Releasing](#releasing)
- [Quality gates](#quality-gates)
- [License](#license)

## Installation

```bash
npm install @reggieofarrell/http-client
```

## Built on

This package is built on top of [Xior](https://suhaotian.github.io/xior/), a lightweight (~6KB) fetch-based HTTP client with an axios-like API. It supports plugins, interceptors, and provides similar functionality to axios while being built on the modern `fetch` API.

## Usage

### Configuration Options

```typescript
interface HttpClientOptions {
  /** Base URL for the API */
  baseURL: string;

  /**
   * Configuration for the underlying xior instance - timeout, headers, and
   * other xior-specific options. See https://suhaotian.github.io/xior/
   */
  xiorConfig?: Omit<XiorRequestConfig, 'baseURL'>;

  /**
   * Whether to log request and response details.
   * @default false
   */
  debug?: boolean;

  /**
   * 'normal' logs request/response data; 'verbose' logs all xior properties
   * for the request and response.
   * @default 'normal'
   */
  debugLevel?: 'normal' | 'verbose';

  /**
   * Name of the client, used in log output.
   * @default 'HttpClient'
   */
  name?: string;

  /**
   * Retry/backoff configuration - see "Retry Configuration with Jitter" below.
   * Individual properties merge with the default rather than replacing it.
   * @default { retries: 0, backoff: 'exponential', delayFactor: 500, backoffJitter: 'none' }
   */
  retryConfig?: HttpClientRetryConfig;

  /**
   * Idempotency key configuration - see "Idempotency Controls" below.
   * @default { enabled: false, methods: ['POST', 'PATCH'], headerName: 'Idempotency-Key' }
   */
  idempotencyConfig?: IdempotencyConfig;

  /**
   * Dot-notation path (e.g. "data.error.detail") or a function to extract an
   * error message from an HTTP error response.
   * @default 'data.message'
   */
  errorMessageExtractor?: string | ((errorResponse: any) => string | undefined);
}
```

For more details, refer to the [source code](src/http-client.ts).

### Basic Setup

```typescript
import { HttpClient } from '@reggieofarrell/http-client';

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  name: 'ExampleClient',
  xiorConfig: {
    timeout: 30000 // 30 second timeout
  },
  retryConfig: {
    retries: 2
  }
});
```

### Making Requests

#### GET Request

```typescript
const { data } = await client.get('/endpoint');
console.log(data);
```

#### POST Request

```typescript
const { data } = await client.post('/endpoint', { key: 'value' });
console.log(data);
```

#### PUT Request

```typescript
const { data } = await client.put('/endpoint', { key: 'value' });
console.log(data);
```

#### PATCH Request

```typescript
const { data } = await client.patch('/endpoint', { key: 'value' });
console.log(data);
```

#### DELETE Request

```typescript
const { data } = await client.delete('/endpoint');
console.log(data);
```

#### HEAD Request

```typescript
const { data } = await client.head('/endpoint');
console.log(data);
```

#### OPTIONS Request

```typescript
const { data } = await client.options('/endpoint');
console.log(data);
```

#### Direct Request Method

For maximum flexibility, you can use the `request` method directly with any HTTP method:

```typescript
import { HttpClient, RequestType } from '@reggieofarrell/http-client';

// Using RequestType enum
const { data } = await client.request(RequestType.GET, '/endpoint');
const { data } = await client.request(RequestType.POST, '/endpoint', { key: 'value' });
const { data } = await client.request(RequestType.HEAD, '/endpoint');
const { data } = await client.request(RequestType.OPTIONS, '/endpoint');
```

### Request Configuration

You can pass additional configuration options to any request:

```typescript
const { data } = await client.get('/endpoint', {
  headers: {
    'X-Some-Header': 'value'
  },
  timeout: 5000
})
```
In addition to the [XiorRequestConfig](https://suhaotian.github.io/xior/) options, you can also override retry options per request:

```typescript
const { data } = await client.get('/endpoint', {
  retryConfig: {
    retries: 5,
    delayFactor: 1000,
    backoff: 'linear',
    enableRetry: (config, error) => {
      // Custom retry logic - only retry on specific errors
      // Note: error is a XiorError during retry evaluation
      return error.response?.status === 503;
    }
  }
})
```

**Note**: Per-request retry configuration leverages xior's built-in error-retry plugin options that are applied at the request level.

### Path Parameters

You can use path parameters in URLs by defining them with the `:paramName` format and providing values via the `pathParams` config option. Values are automatically URL-encoded, and numbers are converted to strings.

```typescript
// Single or multiple path parameters, with special characters and numbers handled automatically
const { data } = await client.get('/users/:userId/posts/:postId', {
  pathParams: { userId: 'user@example.com', postId: 456 }
});
// Results in: /users/user%40example.com/posts/456
```

Path parameters work identically with every HTTP method and can be combined with any other request config (`headers`, `timeout`, `retryConfig`, `params`, etc.):

```typescript
const { data } = await client.post(
  '/users/:userId/posts',
  { title: 'New Post' },
  { pathParams: { userId: '123' }, headers: { 'X-Custom-Header': 'value' } }
);
```

If a URL contains path parameters that aren't provided via `pathParams`, an error is thrown:

```typescript
// Throws: Missing required path parameters: userId. Provide values via pathParams config.
await client.get('/users/:userId', {});
```

`:paramName` detection only looks at the path segment, before any `?` or `#` - a colon elsewhere
in the URL (a connection string in a query value, a named anchor in a fragment) is left alone:

```typescript
// No pathParams needed - the colons after "?" are untouched
await client.get('/redirect?db=redis://user:pass@host:6379');
```

### Query Parameters

Pass query parameters via the `params` property (inherited from `XiorRequestConfig` - matches axios's own convention, which xior keeps for compatibility):

```typescript
const { data } = await client.get('/users', {
  params: { status: 'active', limit: 20 }
});
// Results in: /users?status=active&limit=20
```

Combine with path parameters:

```typescript
const { data } = await client.get('/users/:userId/posts', {
  pathParams: { userId: '123' },
  params: { limit: 10, sort: 'date' }
});
// Results in: /users/123/posts?limit=10&sort=date
```

### Timeout Configuration

The `HttpClient` supports timeout configuration through Xior's built-in timeout functionality. You can set timeouts globally for all requests or per-request.

#### Global Timeout Configuration

Set a default timeout for all requests when creating the client:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  xiorConfig: {
    timeout: 30000 // 30 seconds
  }
});
```

#### Per-Request Timeout Configuration

Override the timeout for specific requests:

```typescript
// Short timeout for quick requests
const { data } = await client.get('/fast-endpoint', {
  timeout: 5000 // 5 seconds
});

// Longer timeout for slow operations
const { data } = await client.post('/slow-operation', payload, {
  timeout: 120000 // 2 minutes
});
```

#### Timeout Error Handling

When a request times out, Xior throws an `AbortError`. Handle timeout errors appropriately:

```typescript
try {
  const { data } = await client.get('/endpoint', {
    timeout: 10000 // 10 seconds
  });
  console.log(data);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request timed out');
    // Handle timeout - maybe retry with longer timeout
  } else {
    console.log('Other error:', error.message);
  }
}
```

#### Timeout with Retry Configuration

Combine timeout configuration with retry logic for robust error handling:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  xiorConfig: {
    timeout: 15000 // 15 second default timeout
  },
  retryConfig: {
    retries: 3,
    delayFactor: 1000,
    enableRetry: (config, error) => {
      // Retry on timeout errors and server errors
      // Note: error is a XiorError during retry evaluation
      return error.name === 'AbortError' ||
             (error.response && error.response.status >= 500);
    }
  }
});

// This request will timeout after 15 seconds, then retry up to 3 times
const { data } = await client.get('/unreliable-endpoint');
```

The timeout value is passed directly to the underlying `fetch` API's `AbortController`, providing native browser and Node.js timeout support.

### Aborting In-Flight Requests

You can abort in-flight requests using the `AbortController` API. This is useful for canceling requests when users navigate away, components unmount, or when you need to cancel long-running operations.

#### Basic Request Abortion

```typescript
const controller = new AbortController();

// Start a request
const requestPromise = client.get('/long-running-endpoint', {
  signal: controller.signal
});

// Abort the request after 5 seconds
setTimeout(() => {
  controller.abort();
}, 5000);

try {
  const { data } = await requestPromise;
  console.log(data);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was aborted');
  } else {
    console.log('Other error:', error.message);
  }
}
```

A deliberate abort is wrapped in an `AbortError` (see [Error Handling](#error-handling)), which is **not retriable by default** - `retryConfig` will not automatically retry a request you just cancelled.

#### Aborting Multiple Requests

```typescript
const controller = new AbortController();

// Start multiple requests with the same abort signal
const requests = [
  client.get('/endpoint1', { signal: controller.signal }),
  client.get('/endpoint2', { signal: controller.signal }),
  client.get('/endpoint3', { signal: controller.signal })
];

// Abort all requests
controller.abort();

// All requests will be cancelled
try {
  await Promise.all(requests);
} catch (error) {
  console.log('All requests were aborted');
}
```

### Retry Configuration with Jitter

The retry system supports configurable backoff strategies with optional jitter to prevent the "thundering herd" problem when multiple clients retry simultaneously.

#### Backoff Strategies

- **`exponential`** (default): `delayFactor * 2^(retryCount - 1)` - Doubles delay with each retry
- **`linear`**: `delayFactor * retryCount` - Increases delay linearly
- **`none`**: Constant `delayFactor` delay for all retries

#### Jitter Strategies

Jitter adds randomness to prevent multiple clients from retrying at the exact same time:

- **`none`** (default): No jitter, deterministic delays
- **`full`**: Random delay between 0 and the calculated backoff delay
- **`equal`**: Half deterministic, half random - `delay/2 + random(0, delay/2)`
- **`decorrelated`**: Random delay with adaptive upper bound - `random(delayFactor, delay * 3)`

#### Example Configurations

**Exponential backoff with full jitter (recommended for distributed systems):**

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 3,
    delayFactor: 1000,
    backoff: 'exponential',
    backoffJitter: 'full'
  }
});
// Retry delays (with delayFactor=1000ms):
// - Retry 1: random(0, 1000ms)
// - Retry 2: random(0, 2000ms)
// - Retry 3: random(0, 4000ms)
```

**Linear backoff with equal jitter:**

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 3,
    delayFactor: 500,
    backoff: 'linear',
    backoffJitter: 'equal'
  }
});
// Retry delays (with delayFactor=500ms):
// - Retry 1: 250ms + random(0, 250ms) = 250-500ms
// - Retry 2: 500ms + random(0, 500ms) = 500-1000ms
// - Retry 3: 750ms + random(0, 750ms) = 750-1500ms
```

**Per-request jitter override:**

```typescript
// Instance defaults to no jitter
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 2,
    delayFactor: 1000,
    backoff: 'exponential',
    backoffJitter: 'none'
  }
});

// Override with full jitter for specific request
const { data } = await client.get('/critical-endpoint', {
  retryConfig: {
    retries: 5,
    backoffJitter: 'full'
  }
});
```

#### Retry-After Header Support

The client automatically respects `Retry-After` headers from server responses. When present, the server-specified delay takes precedence over calculated backoff delays, and jitter is **not** applied to server-specified delays.

```typescript
// If the server returns "Retry-After: 10" (10 seconds)
// The client will wait exactly 10 seconds regardless of jitter settings
```

The `Retry-After` header can be:
- A number (seconds to wait)
- An HTTP date string (absolute time to retry)

The resulting delay is clamped to ~24.8 days (`setTimeout`'s 32-bit signed-integer limit) - a
larger or non-finite value is capped rather than silently firing almost instantly, which is what
the underlying timer would otherwise do with an unbounded delay.

#### Don't register `xior/plugins/error-retry` directly

`retryConfig` is the one authoritative path for retry behavior on an `HttpClient` instance -
registering `xior/plugins/error-retry` yourself (e.g. via `client.client.plugins.use(...)`) is
unsupported. `HttpClient` already registers its own retry plugin internally; a second one, at a
different position in xior's plugin chain with different config, will compound with it in
confusing, order-dependent ways rather than simply adding up predictably.

### Idempotency Controls

Idempotency controls help prevent duplicate operations when requests are retried due to network issues, timeouts, or client-side errors. This is especially important for operations like payments, order creation, or data mutations that shouldn't be repeated.

#### What is Idempotency?

An idempotent operation is one that can be performed multiple times with the same result. For example, if you create a payment and the request times out, you can safely retry the same request without creating a duplicate payment.

#### Basic Idempotency Setup

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  idempotencyConfig: {
    enabled: true,
    methods: ['POST', 'PATCH'], // Only for mutation operations
    headerName: 'Idempotency-Key'
  }
});

// POST requests will automatically include an idempotency key
const { data } = await client.post('/payments', {
  amount: 1000,
  currency: 'USD'
});
```

#### Idempotency Configuration Options

```typescript
interface IdempotencyConfig {
  /**
   * Enable idempotency key generation
   * @default false
   */
  enabled?: boolean;
  /**
   * HTTP methods that should include idempotency keys
   * @default ['POST', 'PATCH']
   */
  methods?: RequestType[];
  /**
   * Header name for idempotency key
   * @default 'Idempotency-Key'
   */
  headerName?: string;
  /**
   * Custom function to generate idempotency keys
   * @default crypto.randomUUID() (falls back to a timestamp + random suffix
   * if unavailable), generated fresh for every request
   */
  keyGenerator?: () => string;
}
```

#### Per-Request Idempotency

You can override idempotency settings for individual requests:

```typescript
// Disable idempotency for a specific request
const { data } = await client.post('/endpoint', payload, {
  idempotencyConfig: {
    enabled: false
  }
});

// Use a custom idempotency key
const { data } = await client.post('/endpoint', payload, {
  idempotencyKey: 'my-custom-key-123'
});

// Override methods for this request
const { data } = await client.put('/endpoint', payload, {
  idempotencyConfig: {
    enabled: true,
    methods: ['PUT']
  }
});
```

#### Manual Idempotency Key

You can provide your own idempotency key for specific requests:

```typescript
const { data } = await client.post('/payments', paymentData, {
  idempotencyKey: 'payment-123-abc'
});
```

#### Custom Key Generation

Use a custom function to generate idempotency keys:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  idempotencyConfig: {
    enabled: true,
    keyGenerator: () => `custom-${Date.now()}-${Math.random().toString(36)}`
  }
});
```

#### Retry Scenarios

Automatic retries (via `retryConfig`) happen inside a single request call, so they already reuse the same idempotency key without any extra setup:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  idempotencyConfig: {
    enabled: true,
    methods: ['POST']
  },
  retryConfig: {
    retries: 3,
    delayFactor: 1000
  }
});

// Automatic retries of this request all use the same idempotency key
const { data } = await client.post('/critical-operation', data);
```

A fresh key is generated for each *new* call to `post`/`patch`/etc. If you catch an error yourself and call the method again later (an application-level retry, as opposed to the automatic retries above), pass the same `idempotencyKey` explicitly to guarantee the server sees it as the same operation:

```typescript
const idempotencyKey = 'order-42-attempt';

async function createOrder() {
  return client.post('/orders', orderPayload, { idempotencyKey });
}

// Later, after catching a failure and deciding to retry the whole operation:
await createOrder();
```

#### Custom Header Names

Use custom header names for idempotency keys:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  idempotencyConfig: {
    enabled: true,
    headerName: 'X-Request-ID'
  }
});
```

#### Method-Specific Configuration

Configure different methods to use idempotency:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  idempotencyConfig: {
    enabled: true,
    methods: ['POST', 'PUT', 'PATCH'] // Include PUT operations
  }
});
```

#### Best Practices

1. **Enable for mutation operations**: Only enable idempotency for POST, PUT, and PATCH requests
2. **Use descriptive keys**: When providing manual keys, use descriptive names
3. **Server-side handling**: Ensure your API server properly handles idempotency keys
4. **Application-level retries need an explicit key**: automatic retries (`retryConfig`) reuse the key for free; if you retry by calling the request method again yourself, pass the same `idempotencyKey` each time

### Disable TLS checks (server only - Node.js)
If necessary you can disable the TLS checks in case the server you are hitting is using a self-signed certificate.

```typescript
import { HttpClient } from '@reggieofarrell/http-client';
import https from 'https';

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  xiorConfig: {
    // @ts-ignore
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    })
  }
});
```

### Different Request Data Types

`HttpClient` passes whatever you give it straight through to `fetch`, so any request body type works - just set the appropriate `Content-Type` header (skip it for `FormData`, which sets its own multipart boundary automatically).

```typescript
// FormData (e.g. file uploads) - no Content-Type needed, fetch sets it automatically
const formData = new FormData();
formData.append('file', fileInput.files[0]);
const { data } = await client.post('/upload', formData);

// URL-encoded form data
const params = new URLSearchParams({ username: 'johndoe', password: 'secret123' });
await client.post('/login', params, {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});

// Plain text, XML, and binary (ArrayBuffer/Blob/Uint8Array/etc.) all follow the same pattern:
await client.post('/text', 'Hello World', { headers: { 'Content-Type': 'text/plain' } });
await client.post('/xml', xmlString, { headers: { 'Content-Type': 'application/xml' } });
await client.post('/binary', arrayBuffer, { headers: { 'Content-Type': 'application/octet-stream' } });
```

### Upload Progress

Native `fetch()` cannot report real upload progress, in either the browser or Node - not a
limitation of this library, but of `fetch` itself. Browsers only expose real, byte-level upload
progress through the older `XMLHttpRequest` API, and Node's `fetch` has no equivalent at all.
(Fetch's newer streaming-request-body support looks like it should help, but it isn't a reliable
progress signal either - it measures when your app hands a chunk to the browser's internal buffer,
not when it's actually transmitted over the network.)

To get real progress, this library ships a separate, **opt-in** entry point,
`@reggieofarrell/http-client/upload-progress`, that bypasses `fetch` entirely for a specific
request: `XMLHttpRequest` in the browser, `http`/`https` directly in Node. It's a separate entry
point specifically so consumers who don't need this feature never pull either transport into their
bundle - the core package has no static import of it at all.

Bundlers that support conditional package exports (Webpack 5, Vite/Rollup, esbuild, Parcel - all of
them, by default, for a browser target) automatically resolve this same import to a browser-only
variant that never references Node's `http`/`https`/`stream` modules at all, so a pure browser
build never has to resolve them either. This is transparent - the same import specifier works for
both Node and browser consumers - but if your bundler doesn't apply package.json's `"browser"`
export condition and you hit a `node:http`/`node:https` resolution error, that's why; check your
bundler's docs for how to enable browser-condition resolution.

```typescript
import { HttpClient } from '@reggieofarrell/http-client';
import { createUploadProgressPlugin } from '@reggieofarrell/http-client/upload-progress';

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  uploadProgressPlugin: createUploadProgressPlugin(),
});

// Browser: a File/Blob via FormData
const formData = new FormData();
formData.append('file', fileInput.files[0]);
await client.post('/upload', formData, {
  realUploadProgress: (event) => {
    console.log(`${event.loaded} / ${event.total} bytes (${event.progress}%)`);
  }
});

// Node: streaming a file from disk
import { createReadStream, statSync } from 'node:fs';

const { size } = statSync('./large-file.zip');
await client.post('/upload', createReadStream('./large-file.zip'), {
  headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
  realUploadProgress: (event) => {
    console.log(`${event.loaded} / ${event.total} bytes (${event.progress}%)`);
  }
});
```

`realUploadProgress` is deliberately not named `onUploadProgress` - xior's own (simulated)
`xior/plugins/progress` already uses that exact field name for a different mechanism, and reusing
it would let both silently fire on the same callback if a client had both configured.

`UploadProgressEvent`:

```typescript
interface UploadProgressEvent {
  /** Bytes uploaded so far. Always present and monotonically non-decreasing. */
  loaded: number;
  /** Total bytes to upload, if known ahead of time. Omitted when unknown. */
  total?: number;
  /** (loaded / total) * 100, not rounded. Only present when total is known. */
  progress?: number;
  /** Mirrors XHR's ProgressEvent.lengthComputable - true only when total is known. */
  lengthComputable: boolean;
}
```

`total`/`progress` are only present when the body's byte length is known ahead of time - always
true for `string`/`Buffer`/`Uint8Array`/`FormData` bodies, and true for a Node `Readable` stream
only if you set your own `Content-Length` header (as in the example above), since a generic stream
can't otherwise be measured in advance.

In the browser, `credentials: 'include'` is honored the same way it is for a normal (non-progress)
request - cross-origin cookies/session auth that would work via `fetch` also work when
`realUploadProgress` bypasses it to `XMLHttpRequest`:

```typescript
await client.post('/upload', formData, {
  credentials: 'include',
  realUploadProgress: (event) => console.log(`${event.progress}%`)
});
```

`credentials: 'omit'` has no exact equivalent under XHR and can't be fully replicated: XHR always
sends same-origin cookies regardless of any flag, where `fetch` with `'omit'` would suppress them
even same-origin. This only matters if you're deliberately omitting same-origin credentials, which
is unusual.

**v1 limitations** (deliberate, to keep this feature proportionate to what it's actually solving -
see the notes on scope in `.rulesync/rules/overview.md`):
- No redirect-following for the bypassed Node transport (`http`/`https` don't auto-follow the way
  `fetch` does by default) - point `realUploadProgress` requests at the final, direct endpoint.
- `FormData` bodies aren't supported under the Node transport (Node's `http`/`https` can't
  serialize them the way `fetch` does) - use the browser transport, which handles `FormData`
  natively at zero extra cost, or pass a pre-encoded `Buffer` body instead.
- A raw Node `Readable` stream body can't be combined with `retryConfig` (streams can only be read
  once) - disable retries for that request, or provide the body as a `Buffer`/string instead.
- Only the default JSON/text response parsing is supported for a progress-tracked request (matches
  what every other request already gets by default).
- Download progress isn't covered by this feature at all - it remains `xior/plugins/progress`'s
  territory (simulated, but that's the honest state of download progress without native fetch
  support for it either).

### Adding Xior Plugins

Since `HttpClient` is built on xior, you can add any xior plugin to enhance functionality:

#### Instance-Level Plugins

Add plugins to all requests:

```typescript
import { HttpClient } from '@reggieofarrell/http-client';
import cachePlugin from 'xior/plugins/cache';
import throttlePlugin from 'xior/plugins/throttle';

const client = new HttpClient({
  baseURL: 'https://api.example.com'
});

// Add caching to all requests
client.client.plugins.use(cachePlugin({
  cacheTime: 5 * 60 * 1000, // 5 minutes
  cacheItems: 100
}));

// Add throttling to all requests
client.client.plugins.use(throttlePlugin({
  threshold: 1000, // 1 second between requests
  enableThrottle: (config) => config.method === 'GET'
}));

// Now all requests are cached and throttled
const { data } = await client.get('/users');
```

#### Per-Request Plugins

For requests that need specific plugins, create a temporary client:

```typescript
import { HttpClient } from '@reggieofarrell/http-client';
import cachePlugin from 'xior/plugins/cache';
import progressPlugin from 'xior/plugins/progress';
import xior from 'xior';

const client = new HttpClient({
  baseURL: 'https://api.example.com'
});

// For a specific request that needs caching
const tempClient = xior.create({
  baseURL: 'https://api.example.com'
});

tempClient.plugins.use(cachePlugin({
  cacheTime: 5 * 60 * 1000
}));

const { data } = await tempClient.get('/expensive-endpoint');
```

#### Enhanced Client Pattern

Create a custom client with specific plugins:

```typescript
import { HttpClient } from '@reggieofarrell/http-client';
import cachePlugin from 'xior/plugins/cache';
import progressPlugin from 'xior/plugins/progress';

class EnhancedHttpClient extends HttpClient {
  constructor(config) {
    super(config);

    // Add plugins to all requests
    this.client.plugins.use(cachePlugin({
      cacheTime: 10 * 60 * 1000,
      cacheItems: 200
    }));
  }

  // Method for requests that need simulated progress tracking (e.g. download progress -
  // for real upload progress, use `realUploadProgress` instead; see "Upload Progress" above)
  async uploadWithProgress(url: string, data: any, config = {}) {
    const tempClient = xior.create({
      ...this.client.defaults,
      baseURL: this.baseURL
    });

    tempClient.plugins.use(progressPlugin({
      progressDuration: 5000
    }));

    const response = await tempClient.post(url, data, config);
    return { request: response, data: response.data };
  }
}

// Usage
const client = new EnhancedHttpClient({
  baseURL: 'https://api.example.com'
});

// Regular requests (cached)
const { data } = await client.get('/users');

// Simulated progress (xior's plugin uses onUploadProgress - a different, timer-based mechanism
// from this library's own realUploadProgress, deliberately, so the two can't collide)
const { data } = await client.uploadWithProgress('/upload', formData, {
  onUploadProgress: (progress) => {
    console.log(`Upload: ${progress.progress}%`);
  }
});
```

#### Available Xior Plugins

- **Cache**: `xior/plugins/cache` - Response caching
- **Throttle**: `xior/plugins/throttle` - Request throttling
- **Dedupe**: `xior/plugins/dedupe` - Request deduplication
- **Progress**: `xior/plugins/progress` - Simulated (timer-based) upload/download progress. For
  real upload progress, use this library's own `realUploadProgress` instead - see
  [Upload Progress](#upload-progress) above.
- **Mock**: `xior/plugins/mock` - Request mocking for tests
- **Error Cache**: `xior/plugins/error-cache` - Error response caching

For more details, see the [xior plugins documentation](https://suhaotian.github.io/xior/).

### Accessing the underlying client
Requests return `request` and `data` with `request` being the underlying xior response in case you need to dig into this.

```typescript
const { request, data } = await client.get('/endpoint');
console.log(request.status); // HTTP status code
console.log(request.headers); // Response headers
console.log(data); // Response data
```

### Direct access to the underlying xior instance
You can also access the underlying xior instance directly:

```typescript
// Access the underlying xior instance
const xiorInstance = client.client;

// Use xior methods directly if needed
const response = await xiorInstance.get('/custom-endpoint');
```

### Type responses
```typescript
// pass a generic if you're using typescript to get a typed response
const { data } = await client.get<SomeResponseType>('/endpoint')
```

### Middleware Hooks

The `HttpClient` provides middleware-style hooks covering a request's full lifecycle - `beforeRequest`, `afterResponse`, and `onError` - so you can observe or modify requests, responses, and failures. `beforeRequest`/`afterResponse` are designed for direct mutation of parameters, making them more efficient and easier to use.

#### beforeRequest Hook

The `beforeRequest` hook is called before each request is sent. You can modify the request data and configuration directly:

```typescript
import { HttpClient } from '@reggieofarrell/http-client';

class CustomClient extends HttpClient {
  protected async beforeRequest(
    requestType: RequestType,
    url: string,
    data: any,
    config: XiorRequestConfig
  ): Promise<void> {
    // Add authentication token
    if (this.authToken) {
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${this.authToken}`
      };
    }

    // Add request timestamp
    if (data && typeof data === 'object') {
      data.requestTime = Date.now();
    }

    // Log request details
    console.log(`Making ${requestType} request to ${url}`);
  }
}

const client = new CustomClient({
  baseURL: 'https://api.example.com'
});
```

#### afterResponse Hook

The `afterResponse` hook is called after receiving a successful response (2xx status codes). You can modify the response data directly:

```typescript
import { HttpClient } from '@reggieofarrell/http-client';

class CustomClient extends HttpClient {
  protected async afterResponse(
    requestType: RequestType,
    url: string,
    response: XiorResponse,
    data: any
  ): Promise<void> {
    // Add processing timestamp
    data.processedAt = Date.now();

    // Transform response data
    if (data.items && Array.isArray(data.items)) {
      data.itemCount = data.items.length;
    }

    // Log response details
    console.log(`Received ${requestType} response from ${url}: ${response.status}`);
  }
}
```

#### Combined Middleware Workflow

You can use both hooks together to create a complete request/response processing pipeline:

```typescript
import { HttpClient } from '@reggieofarrell/http-client';

class ApiClient extends HttpClient {
  private requestId = 0;

  protected async beforeRequest(
    requestType: RequestType,
    url: string,
    data: any,
    config: XiorRequestConfig
  ): Promise<void> {
    // Generate unique request ID
    const id = ++this.requestId;

    // Add request ID to headers
    config.headers = {
      ...config.headers,
      'X-Request-ID': id.toString()
    };

    // Add request ID to data if it's an object
    if (data && typeof data === 'object') {
      data.requestId = id;
    }

    console.log(`[${id}] Starting ${requestType} ${url}`);
  }

  protected async afterResponse(
    requestType: RequestType,
    url: string,
    response: XiorResponse,
    data: any
  ): Promise<void> {
    // Add response metadata
    data.responseTime = Date.now();
    data.requestId = response.headers['x-request-id'];

    console.log(`[${data.requestId}] Completed ${requestType} ${url} - ${response.status}`);
  }
}

// Usage
const client = new ApiClient({
  baseURL: 'https://api.example.com'
});

// All requests will have request IDs and logging
const { data } = await client.post('/users', { name: 'John' });
// Console output:
// [1] Starting POST /users
// [1] Completed POST /users - 201
```

#### onError Hook

The `onError` hook is called with the fully classified error - `HttpError`, `NetworkError`, `TimeoutError`, `SerializationError`, or `AbortError` - right before it's thrown, from the default `errorHandler`. It's the failure-path counterpart to `beforeRequest`/`afterResponse`:

```typescript
import { HttpClient, RequestType } from '@reggieofarrell/http-client';
import type { HttpError, NetworkError, TimeoutError, SerializationError, AbortError } from '@reggieofarrell/http-client';

class CustomClient extends HttpClient {
  protected async onError(
    requestType: RequestType,
    url: string,
    error: HttpError | NetworkError | TimeoutError | SerializationError | AbortError
  ): Promise<void> {
    console.error(`${requestType} ${url} failed:`, error.message);
    // e.g. report to your error tracker or metrics system:
    // myMetrics.increment(`http.error.${error.code}`);
  }
}
```

`onError` is **fire-and-forget**: `errorHandler` does not await it, so it can never delay when the
caller sees the thrown error, and if your override itself throws or rejects, that failure is
swallowed rather than replacing (or being swallowed alongside) the real error - a flaky
logging/telemetry integration must never mask the actual request failure. If you need a guarantee
it completes before your process exits (a serverless handler, say), use your runtime's own
keepalive mechanism inside your override (Lambda's `context.callbackWaitsForEmptyEventLoop`,
Cloudflare's `event.waitUntil()`, etc.) - that's a runtime concern this library doesn't try to
solve.

`onError` is **not** called if you override `errorHandler` directly instead of relying on the
default implementation - that override already owns the full throw contract. Call
`this.onError(...)` yourself, or `await super.errorHandler(...)`, if you want both.

#### Error Handling

The `afterResponse` hook is only called for successful responses (2xx status codes). Error responses are handled by the `errorHandler` method, which calls `onError` (see above) before throwing, and can be overridden for further custom behavior.

**If `beforeRequest` or `afterResponse` itself throws, that exception propagates out of
`request()` as-is** - it does not go through `errorHandler`/`processError` and is never one of
this library's error types (`HttpError`, `NetworkError`, etc.). That's deliberate: an exception
from your own hook is a bug in your hook logic, not a transport failure, so there's no correct
error category to force it into. `error instanceof HttpError` (or any of the other error classes)
will always be `false` for a hook failure - that's how you can tell it apart from a real request
failure in a `catch` block.

**`errorHandler` must always throw.** There's no fallback response for a failed request to resolve
with, so an override must end every code path in a `throw` - either `throw
this.processError(error, reqType, url)`, a custom error built from it, or (per the "Basic Error
Handling Override" example below) `super.errorHandler(error, reqType, url)`. If an override returns
normally instead, `request()` detects this and throws a clear configuration error rather than
producing a broken response.

##### Basic Error Handling Override

```typescript
class CustomClient extends HttpClient {
  protected async afterResponse(
    requestType: RequestType,
    url: string,
    response: XiorResponse,
    data: any
  ): Promise<void> {
    // This is only called for successful responses
    console.log('Request succeeded:', response.status);
  }

  protected errorHandler(error: any, reqType: RequestType, url: string) {
    // This is called for error responses
    console.log('Request failed:', error.message);
    super.errorHandler(error, reqType, url);
  }
}
```

##### Advanced Error Handling with processError()

For more control over error handling, you can use the `processError()` method to get the processed error object before throwing it:

```typescript
class CustomClient extends HttpClient {
  protected errorHandler(error: any, reqType: RequestType, url: string) {
    // Get the processed error object
    const processedError = this.processError(error, reqType, url);

    // Add custom logic (logging, metrics, etc.)
    this.logErrorMetrics(processedError);

    // Option 1: Throw the processed error as-is
    throw processedError;

    // Option 2: Modify the error before throwing
    // processedError.message = `[Custom] ${processedError.message}`;
    // throw processedError;

    // Option 3: Add custom properties
    // (processedError as any).customProperty = 'some value';
    // throw processedError;
  }
}
```

##### Error Processing Method

The `processError()` method handles all the core error processing logic and returns a fully constructed error object. This method:

- Builds request metadata for all error types
- Handles HTTP response errors (status codes outside 2xx)
- Handles network, timeout, and serialization errors
- Applies retry configuration logic
- Returns the appropriate error type (`HttpError`, `NetworkError`, `TimeoutError`, or `SerializationError`)

This separation allows child classes to:
1. Use the default error handling: `throw this.processError(error, reqType, url);`
2. Customize errors before throwing: Modify the processed error object
3. Add side effects: Logging, metrics, custom error tracking
4. Completely override: Build their own error handling logic

### Extending the HttpClient

You can extend the `HttpClient` class to add custom functionality:

```typescript
import { HttpClient } from '@reggieofarrell/http-client';

class MyApiClient extends HttpClient {
  constructor() {
    super({
      baseURL: 'https://api.example.com',
      retryConfig: {
        retries: 3,
        delayFactor: 1000,
        backoff: 'exponential'
      }
    });
  }

  async getUsers() {
    const { data } = await this.get('/users');
    return data;
  }

  async createUser(userData: any) {
    const { data } = await this.post('/users', userData);
    return data;
  }
}

// Usage
const apiClient = new MyApiClient();
const users = await apiClient.getUsers();
```

#### Advanced Error Handling Examples

Two common patterns for overriding `errorHandler`:

##### 1. Customize the processed error (logging, metrics, user-friendly messages)

```typescript
class AnalyticsClient extends HttpClient {
  private errorMetrics: any[] = [];

  protected errorHandler(error: any, reqType: RequestType, url: string) {
    const processedError = this.processError(error, reqType, url);

    // Log to analytics service
    this.errorMetrics.push({
      timestamp: new Date().toISOString(),
      method: reqType,
      url,
      errorType: processedError.constructor.name,
      message: processedError.message,
      isRetriable: processedError.isRetriable
    });

    // Send to external monitoring
    this.sendToMonitoring(processedError);

    // You can also mutate the processed error before throwing it, e.g. to
    // give it a more user-friendly message based on its status/category
    if (processedError instanceof HttpError && processedError.status === 401) {
      processedError.message = 'Please log in to continue';
    }

    throw processedError;
  }

  private sendToMonitoring(error: any) {
    // Send to your monitoring service (DataDog, New Relic, etc.)
    console.log('Sending error to monitoring:', error.message);
  }
}
```

##### 2. Bypass `processError` entirely for fully custom error handling

```typescript
class CustomErrorClient extends HttpClient {
  protected errorHandler(error: any, reqType: RequestType, url: string) {
    // Completely custom error handling without using processError
    if (error.response) {
      // Custom HTTP error handling
      const customError = new Error(`Custom HTTP Error: ${error.response.status}`);
      (customError as any).status = error.response.status;
      (customError as any).data = error.response.data;
      throw customError;
    } else {
      // Custom network error handling
      const customError = new Error(`Custom Network Error: ${error.message}`);
      (customError as any).originalError = error;
      throw customError;
    }
  }
}
```

### Error Handling

The `HttpClient` provides comprehensive error handling with stable error types:

```typescript
import { HttpClient, NetworkError, TimeoutError, HttpError, SerializationError, AbortError, HttpErrorCategory } from '@reggieofarrell/http-client';

try {
  const { data } = await client.get('/endpoint');
  console.log(data);
} catch (error) {
  if (error instanceof HttpError) {
    console.log('HTTP Error:', error.status, error.category, error.response);
    console.log('Retriable:', error.isRetriable);

    // Handle specific error categories
    switch (error.category) {
      case HttpErrorCategory.AUTHENTICATION:
        console.log('Authentication failed');
        break;
      case HttpErrorCategory.RATE_LIMIT:
        console.log('Rate limited, retry after delay');
        break;
      case HttpErrorCategory.SERVER_ERROR:
        console.log('Server error, may be retriable');
        break;
    }
  } else if (error instanceof NetworkError) {
    console.log('Network Error:', error.metadata.error.type, error.metadata.error.message);
    console.log('Retriable:', error.isRetriable);
  } else if (error instanceof TimeoutError) {
    console.log('Timeout Error:', error.metadata.error.message);
    console.log('Retriable:', error.isRetriable);
  } else if (error instanceof SerializationError) {
    console.log('Serialization Error:', error.message);
    console.log('Retriable:', error.isRetriable);
  } else if (error instanceof AbortError) {
    console.log('Request was aborted:', error.metadata.error.message);
    console.log('Retriable:', error.isRetriable);
  }
}
```

#### Error Types

The HTTP client provides five stable error types:

1. **`HttpError`** - HTTP 4xx/5xx responses
   - Properties: `status`, `category`, `statusText`, `response`, `isRetriable`
   - Categories: `AUTHENTICATION`, `NOT_FOUND`, `RATE_LIMIT`, `VALIDATION`, `CLIENT_ERROR`, `SERVER_ERROR`

2. **`NetworkError`** - Network connectivity issues
   - Properties: `code`, `isRetriable`, `metadata` (includes error details)
   - Always retriable by default

3. **`TimeoutError`** - Request timeout
   - Properties: `code`, `isRetriable`, `metadata` (includes timeout details)
   - Always retriable by default

4. **`SerializationError`** - Request/response serialization failures
   - Properties: `code`, `isRetriable`, `metadata`
   - Not retriable by default

5. **`AbortError`** - Request deliberately cancelled via `AbortController`/`AbortSignal`
   - Properties: `code`, `isRetriable`, `metadata` (includes abort details), `name` is `'AbortError'`
   - Not retriable by default - retrying a request you just cancelled would defeat the purpose

#### Typing the error response body

`HttpError` is generic over its response body (`HttpError<TErrorBody = unknown>`), so you can type
a third-party API's error shape the same way `client.get<T>()` types a success response. `response.data`
defaults to `unknown` rather than `any`, so you can't touch it without narrowing first.

Use the `isHttpError<T>()` type guard to get this typing - a plain `error instanceof HttpError` check
does **not** work for this: TypeScript resolves a generic class's unspecified type parameters to `any`
during `instanceof` narrowing, regardless of the class's own default, so `response.data` would silently
come back as `any` even though `HttpError`'s default is `unknown`.

```typescript
import { isHttpError } from '@reggieofarrell/http-client';

interface StripeErrorBody {
  error: { message: string; type: string };
}

try {
  await client.post('/charge', payload);
} catch (error) {
  if (isHttpError<StripeErrorBody>(error)) {
    console.log(error.response.data.error.message); // typed as `string`
  }
}
```

#### Error Metadata

All errors include comprehensive diagnostic metadata:

```typescript
interface ErrorMetadata {
  request: {
    method: string;
    url: string;
    baseURL: string;
    headers: Record<string, any>;
    timeout?: number;
    timestamp: string; // ISO format
  };
  retryCount?: number;
  clientName: string;
}
```

#### Retry Logic

The retry system automatically uses the `isRetriable` property from error instances:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 3,
    // Custom retry logic can override isRetriable
    enableRetry: (config, error) => {
      // The error parameter is a XiorError during retry evaluation
      // but will be converted to HttpClientError types when thrown

      // Check if it's one of our new error types
      if ((error as any).isRetriable !== undefined) {
        return (error as any).isRetriable;
      }

      // Fallback to standard HTTP retry logic
      if (!error.response) return true; // Network errors
      return error.response.status >= 500; // 5xx errors
    }
  }
});
```

#### Retry Logic and Error Types

**Important**: The `enableRetry` function receives a `XiorError` during retry evaluation, but the final thrown errors are converted to our stable error types (`HttpError`, `NetworkError`, etc.).

```typescript
import { HttpClient, classifyErrorForRetry } from '@reggieofarrell/http-client';

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 3,
    enableRetry: (config, error) => {
      // Use our error classification helper for consistent logic
      const classification = classifyErrorForRetry(error);
      return classification.isRetriable;
    }
  }
});

// When an error is thrown, it will be one of our stable error types
try {
  const { data } = await client.get('/endpoint');
} catch (error) {
  if (error instanceof HttpError) {
    // This is now an HttpError with isRetriable property
    console.log('Retriable:', error.isRetriable);
  }
}
```

#### Advanced Retry Logic with Error Classification

For more sophisticated retry logic, you can use the `classifyErrorForRetry` helper function to access our error type logic during retry evaluation:

```typescript
import { HttpClient, classifyErrorForRetry, HttpErrorCategory } from '@reggieofarrell/http-client';

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 3,
    enableRetry: (config, error) => {
      // Get structured error information
      const classification = classifyErrorForRetry(error);

      // Work with our error types' logic
      if (classification.type === 'http') {
        // Handle HTTP errors with full context
        if (classification.category === HttpErrorCategory.RATE_LIMIT) {
          return true; // Always retry rate limits
        }

        if (classification.category === HttpErrorCategory.AUTHENTICATION) {
          return false; // Never retry auth errors
        }

        if (classification.status === 429) {
          return true; // Custom logic for specific status codes
        }

        // Use the pre-calculated retriability
        return classification.isRetriable;
      }

      if (classification.type === 'timeout') {
        return true; // Always retry timeouts
      }

      if (classification.type === 'network') {
        return true; // Always retry network errors
      }

      if (classification.type === 'serialization') {
        return false; // Never retry serialization errors
      }

      if (classification.type === 'abort') {
        return false; // Never retry a deliberate cancellation
      }

      // Fallback to the classification's retriability
      return classification.isRetriable;
    }
  }
});
```

#### Error Classification

The `classifyErrorForRetry` function returns an `ErrorClassification` object:

```typescript
interface ErrorClassification {
  type: 'network' | 'timeout' | 'http' | 'serialization' | 'abort' | 'unknown';
  isRetriable: boolean;
  status?: number;           // For HTTP errors
  category?: HttpErrorCategory; // For HTTP errors
}
```

This gives you access to:
- **Error type detection** - Know if it's a network, timeout, HTTP, serialization, or abort error
- **Pre-calculated retriability** - Use our smart defaults with `classification.isRetriable`
- **HTTP context** - Access status codes and error categories for HTTP errors
- **Type safety** - Work with familiar `HttpErrorCategory` enum values

#### Per-Request Error Classification

You can also use error classification for per-request retry logic:

```typescript
await client.get('/endpoint', {
  retryConfig: {
    enableRetry: (config, error) => {
      const classification = classifyErrorForRetry(error);

      // Custom per-request logic
      if (classification.type === 'http' && classification.status === 404) {
        return false; // Don't retry 404s for this specific endpoint
      }

      return classification.isRetriable;
    }
  }
});
```

#### Custom Error Message Extraction

Different APIs structure their error responses differently. The `HttpClient` allows you to customize how error messages are extracted from HTTP error responses.

##### Instance-Level Configuration

```typescript
// String path with dot notation for nested properties
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  errorMessageExtractor: 'data.error.detail', // Extract from data.error.detail
});

// Function-based extraction for complex logic
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  errorMessageExtractor: (response) => {
    // Handle multiple possible error formats
    if (response.data?.error?.message) {
      return response.data.error.message;
    }
    if (response.data?.errors?.length > 0) {
      return response.data.errors.map((e: any) => e.message).join('; ');
    }
    if (response.data?.message) {
      return response.data.message;
    }
    return undefined; // Will fall back to statusText
  },
});
```

##### Per-Request Override

```typescript
// Override the error message extractor for specific requests
const response = await client.get('/endpoint', {
  errorMessageExtractor: 'data.errors.0.message' // Extract first error message
});

// Use function for per-request custom logic
const response = await client.post('/endpoint', data, {
  errorMessageExtractor: (response) => {
    return response.data?.validation_errors?.[0]?.message;
  }
});
```

##### Common API Patterns

```typescript
// Simple string path, e.g. GitHub-style `{ message: '...' }` responses
const githubClient = new HttpClient({
  baseURL: 'https://api.github.com',
  errorMessageExtractor: 'data.message'
});

// Function-based extraction for APIs that use more than one error shape
const complexClient = new HttpClient({
  baseURL: 'https://api.complex.com',
  errorMessageExtractor: (response) => {
    // Try different paths based on response structure
    if (response.data?.error?.message) {
      return response.data.error.message;
    }
    if (response.data?.errors?.length > 0) {
      return response.data.errors[0].message;
    }
    if (response.data?.message) {
      return response.data.message;
    }
    return undefined; // Falls back to statusText
  }
});
```

##### Fallback Behavior

When the configured path doesn't contain a message or the function returns `undefined`, the client falls back to the HTTP status text:

```typescript
// If errorMessageExtractor doesn't find a message, falls back to statusText
try {
  await client.get('/endpoint');
} catch (error) {
  if (error instanceof HttpError) {
    console.log(error.message); // Either extracted message or statusText
  }
}
```

### Debugging

`debug` and `debugLevel` are flags for your own use - this library does not log anything itself.
Read them inside your own `beforeRequest`/`afterResponse`/`onError` overrides (see
[Middleware Hooks](#middleware-hooks)) to decide what, and whether, to log - with whatever logger
you want, not a hardcoded `console.log`:

```typescript
import { HttpClient, RequestType } from '@reggieofarrell/http-client';
import type { XiorResponse } from 'xior';

class DebugClient extends HttpClient {
  protected async beforeRequest(requestType: RequestType, url: string, data: any): Promise<void> {
    if (!this.debug) return;
    console.log(
      `[${this.name}] ${requestType} ${url}`,
      this.debugLevel === 'verbose' ? { data } : undefined
    );
  }

  protected async afterResponse(
    requestType: RequestType,
    url: string,
    response: XiorResponse
  ): Promise<void> {
    if (this.debug) console.log(`[${this.name}] ${requestType} ${url} : ${response.status}`);
  }

  protected async onError(requestType: RequestType, url: string, error: any): Promise<void> {
    if (this.debug) console.log(`[${this.name}] ${requestType} ${url} : ${error.message}`);
  }
}

const client = new DebugClient({
  baseURL: 'https://api.example.com',
  debug: true,
  debugLevel: 'verbose' // or 'normal'
});
```

If you're upgrading from a version where `debug: true` produced console output automatically, see
the [v3.0.4 migration guide](#v304---logging-moved-to-hooks-onerror-hook-added) below for the
exact hooks that recreate it.

## Breaking Changes

### v3.0.4 - Logging moved to hooks; onError hook added

**Removed:**
- Built-in `debug`/`debugLevel` console logging. `beforeRequest` and the internal error-classification methods no longer call `console.log` on your behalf, and this library no longer ships `src/logger.ts` at all. (`logWarning`/`logInfo`/`logError` were already dead code - unused by anything in the library; `logData` was the only one actually wired in, and it powered exactly the output being removed here.) A hardcoded, ANSI-colored logger with no way to plug in a real one (Pino, Winston, etc.) was scope creep for a small HTTP client, and it was already redundant with `beforeRequest`/`afterResponse` - the only real gap was the failure path, which the new `onError` hook below closes properly. `debug`/`debugLevel` remain on `HttpClientOptions` and `HttpClient` unchanged - only the automatic console output is gone; they're now plain flags for you to read inside your own hook overrides. See [Debugging](#debugging) and the migration example below.

**Added:**
- `onError(requestType, url, error)` hook - called with the fully classified error right before `errorHandler` throws it, the failure-path counterpart to `beforeRequest`/`afterResponse`. Fire-and-forget: never awaited by `errorHandler`, so it can't delay or replace the real thrown error even if it throws or rejects itself. Not called if you override `errorHandler` directly (that override already owns the full throw contract) - call `this.onError(...)` or `await super.errorHandler(...)` if you want both. See [Middleware Hooks](#middleware-hooks).

**Migration Guide:**

If you relied on `debug: true` for its old built-in console output, recreate it explicitly with hooks:

```typescript
// Before (3.0.3 and earlier) - built-in, undocumented-format console output
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  debug: true,
  debugLevel: 'verbose',
});
// GET/POST/etc. requests and their errors were logged to the console automatically.

// After (3.0.4+) - explicit, and shaped however you want
import { HttpClient, RequestType } from '@reggieofarrell/http-client';

class DebugClient extends HttpClient {
  protected async beforeRequest(requestType: RequestType, url: string, data: any): Promise<void> {
    if (!this.debug) return;
    console.log(
      `[${this.name}] ${requestType} ${url}`,
      this.debugLevel === 'verbose' ? { data } : undefined
    );
  }

  protected async onError(requestType: RequestType, url: string, error: any): Promise<void> {
    if (this.debug) console.log(`[${this.name}] ${requestType} ${url} failed:`, error.message);
  }
}

const client = new DebugClient({
  baseURL: 'https://api.example.com',
  debug: true,
  debugLevel: 'verbose',
});
```

`debug`/`debugLevel` themselves did not change as config options - only the automatic output tied to them is gone, moved into hooks you control.

### v3.0.0 - Error handling fixes, API cleanup, and real upload progress

**Removed:**
- The OpenAPI SDK Code Generator (`@reggieofarrell/http-client/codegen`) and its peer dependencies (`openapi-typescript`, `@apidevtools/json-schema-ref-parser`, `swagger2openapi`, `yaml`). It was a build-time tool unrelated to the runtime HTTP client; if you still need it, generate your client with a standalone codegen tool of your choice, or vendor the last published version.
- The `query` per-request config option (an alias for `params`). `params` is xior's own inherited-from-axios convention for query-string parameters (xior markets itself as ~90% axios-API-compatible and keeps `params` for that reason), so `query` was pure duplication of an already-established name rather than filling a gap. Replace `query: {...}` with `params: {...}` - the values and behavior are identical.

**Changed:**
- **Idempotency key generation no longer caches keys across separate calls.** A fresh key is generated for every `request()` call by default (via `crypto.randomUUID()`, or a custom `keyGenerator`). Automatic retries (`retryConfig`) are unaffected - they happen inside a single call and already reuse the same key. If you catch an error yourself and call the request method again later, pass the same `idempotencyKey` explicitly to guarantee the server sees it as one operation. The previous automatic cross-call caching was based on `JSON.stringify`-ing the request body, which silently broke (colliding keys, or keys that never got cleaned up) for `beforeRequest`-mutated payloads and non-JSON bodies like `FormData` - the explicit-key pattern above is the reliable replacement.
- Upgraded `xior` from `^0.7.8` to `^0.8.4`. No API changes required on our side; see [xior's changelog](https://github.com/suhaotian/xior/blob/main/CHANGELOG.md) if you use xior plugins or options directly.
- Renamed the `errorMessagePath` config option (instance-level and per-request) to `errorMessageExtractor`, matching the `ErrorMessageExtractor` type it was already typed as - it always accepted a function as well as a dot-notation string, so "path" was misleading. Rename any usages; behavior is unchanged.
- `HttpError.response.data` (and `HttpErrorResponse.data`) is now `unknown` by default instead of `any` - `HttpError` and `HttpErrorResponse` are generic over the error body (`HttpError<TErrorBody = unknown>`), matching how `client.get<T>()` already types success responses. This only affects code that references `HttpError`/`HttpErrorResponse` as an explicit type annotation without narrowing `TErrorBody` first, e.g. `const err: HttpError = ...; err.response.data.someProp` will no longer compile as-is - add `as HttpError<YourType>` or (preferably) switch to the new `isHttpError<T>()` type guard. Code that narrows via a plain `error instanceof HttpError` check is unaffected either way; see "Typing the error response body" below for why.
- **`HttpError` is constructed from a single `HttpErrorOptions` object** instead of a long positional parameter list. Callers that only catch `HttpError` (the normal path) are unaffected. `HttpErrorOptions` and `ErrorMetadata` are exported from the package root. Folded into the v3 migration even though it landed in a later 3.x patch — there is effectively one consumer, so this avoids a 4.x bump for an API almost nobody constructs by hand.

**Added:**
- `isHttpError<TErrorBody>(error)` type guard - narrows to `HttpError<TErrorBody>` and types `response.data` accordingly. Needed because TypeScript's `instanceof` narrowing against a generic class always resolves unspecified type parameters to `any`, so a plain `error instanceof HttpError` check silently leaves `response.data` untyped no matter what `HttpError`'s own default is. See "Typing the error response body" below.
- Real (non-simulated) upload progress, via a new opt-in `@reggieofarrell/http-client/upload-progress` entry point (`createUploadProgressPlugin()` + `HttpClientOptions.uploadProgressPlugin` + the per-request `realUploadProgress` callback). Purely additive - consumers who don't import the new subpath see no change at all, including no change to bundle size, since the core package has no static import of it. The subpath resolves to a browser-only variant under bundlers that support conditional package exports, so a pure browser build never has to resolve Node's `http`/`https`/`stream` modules either. Honors `credentials: 'include'` in the browser the same way a normal request does. See [Upload Progress](#upload-progress) above.

**Fixed:**
- `backoffJitter` ('full', 'equal', 'decorrelated') was silently ignored at both the instance and per-request level - retries always used a deterministic delay regardless of this setting. It now actually applies. If you were relying on the old (undocumented) deterministic behavior while setting `backoffJitter`, your retry delays will now vary as the README has always described.
- A deliberately aborted request (`AbortController.abort()`) was misclassified as a `NetworkError` with `isRetriable: true` - meaning `retryConfig` could automatically retry a request you just cancelled, and `error.name` was never actually `'AbortError'` despite the README's documented example checking for it. Aborts are now wrapped in a new `AbortError` type (`error.name === 'AbortError'`, `isRetriable: false` by default). If you were checking `error instanceof NetworkError` to detect aborts, check `error instanceof AbortError` instead.
- A genuine network failure was misclassified as a non-retriable `SerializationError` instead of a `NetworkError`. `fetch()` itself rejects with a plain `TypeError` for every network-layer failure (offline, DNS failure, connection refused/reset, CORS block, mixed-content block) in both browsers and Node's `undici`, and `isSerializationError` treated any `TypeError` as a serialization issue - so this was the single most common transient failure in practice, and it silently defeated `retryConfig` for it (the retry-evaluation fallback had a related bug: it required a `.request` property that a raw `fetch()` `TypeError` never has, so it wouldn't have retried even once misclassification was fixed). Both are fixed; a dropped connection or DNS failure is now a retriable `NetworkError`, matching the README's documented `instanceof NetworkError` pattern. If you had code specifically branching on `error instanceof SerializationError` to handle connectivity issues, switch it to `NetworkError`.
- An `errorHandler` override that returned normally instead of throwing (nothing in the types or docs actually forbade this, even though every documented example throws) used to fall through to a confusing `Cannot read properties of undefined (reading 'data')` with no indication of the real cause. `request()` now detects this specifically and throws a clear configuration error pointing at the "Error Handling" section instead. If you have an `errorHandler` override that doesn't always throw, it was already broken - this only changes the error message you'll see.

**Migration Guide:**

```typescript
// query -> params (removed alias; identical values and behavior)

// Before (v2.x)
await client.get('/search', { query: { q: 'test' } });

// After (v3.x)
await client.get('/search', { params: { q: 'test' } });
```

```typescript
// errorMessagePath -> errorMessageExtractor (renamed; identical behavior)

// Before (v2.x)
new HttpClient({ baseURL, errorMessagePath: 'error.message' });

// After (v3.x)
new HttpClient({ baseURL, errorMessageExtractor: 'error.message' });
```

```typescript
// Detecting an aborted request

// Before (v2.x) - aborts were misclassified as NetworkError, indistinguishable from a real
// connectivity failure, and error.name was never actually 'AbortError'
try {
  await client.get('/endpoint', { signal: controller.signal });
} catch (error) {
  if (error instanceof NetworkError) {
    // could be an abort OR a genuine network failure - no way to tell them apart
  }
}

// After (v3.x) - aborts get their own error type
import { AbortError, NetworkError } from '@reggieofarrell/http-client';

try {
  await client.get('/endpoint', { signal: controller.signal });
} catch (error) {
  if (error instanceof AbortError) {
    // the request was cancelled
  } else if (error instanceof NetworkError) {
    // a genuine connectivity failure (offline, DNS, connection reset, etc.) - retriable
  }
}
```

```typescript
// Detecting a genuine network failure

// Before (v2.x) - offline/DNS/connection-reset failures were misclassified as SerializationError
// and silently defeated retryConfig
if (error instanceof SerializationError) {
  // handled connectivity issues here, incorrectly
}

// After (v3.x)
if (error instanceof NetworkError) {
  // connectivity issues are classified correctly, and retryConfig can now actually retry them
}
```

```typescript
// Typing a caught HttpError's response body

// Before (v2.x) - response.data was `any`
try {
  await client.post('/orders', payload);
} catch (error) {
  if (error instanceof HttpError) {
    console.log(error.response.data.code); // typed as `any`
  }
}

// After (v3.x) - response.data defaults to `unknown`; narrow it with isHttpError<T>()
import { isHttpError } from '@reggieofarrell/http-client';

interface OrderErrorBody {
  code: string;
}

try {
  await client.post('/orders', payload);
} catch (error) {
  if (isHttpError<OrderErrorBody>(error)) {
    console.log(error.response.data.code); // typed as `string`
  }
}
```

```typescript
// Constructing HttpError by hand (rare - only needed if you synthesize errors yourself)

// Before (v2.x) - long positional argument list
new HttpError(message, status, category, statusText, response, metadata, cause, isRetriable);

// After (v3.x) - single named options object (HttpErrorOptions is exported)
new HttpError({
  message,
  status,
  category,
  statusText,
  response,
  metadata,
  cause,
  isRetriable,
});
```

```typescript
// Idempotency keys are no longer cached/reused across separate request() calls

// Before (v2.x) - the same (JSON.stringify'd) body silently reused the same cached key on a
// later, hand-written retry
await client.post('/payments', payload); // key generated & cached from the body
// ...later, after catching an error and retrying manually...
await client.post('/payments', payload); // same body -> same cached key (fragile: broke for
                                          // FormData and beforeRequest-mutated payloads)

// After (v3.x) - pass idempotencyKey explicitly to guarantee the server sees one operation
const idempotencyKey = crypto.randomUUID();
try {
  await client.post('/payments', payload, { idempotencyKey });
} catch (error) {
  // retrying the same logical operation later
  await client.post('/payments', payload, { idempotencyKey });
}
```

```typescript
// A custom errorHandler override must always throw

// Before (v3.x) - nothing enforced this; an override that forgot to (re)throw crashed with a
// confusing, unrelated "Cannot read properties of undefined" instead of doing what it looked
// like it should do
class CustomClient extends HttpClient {
  protected errorHandler(error: any, reqType: RequestType, url: string) {
    logToMonitoring(error);
    // forgot to throw here
  }
}

// Still v3.x - the fix: always throw. request() now also surfaces a clear configuration error
// (instead of a confusing one) if an override forgets to.
class CustomClient extends HttpClient {
  protected errorHandler(error: any, reqType: RequestType, url: string) {
    logToMonitoring(error);
    throw this.processError(error, reqType, url);
  }
}
```

### v2.0.0 - Stable Error Types

This version introduces stable error types and removes the legacy `ApiResponseError`:

**Removed:**
- `ApiResponseError` class

**Added:**
- `HttpClientError` base class
- `NetworkError` for network connectivity issues
- `TimeoutError` for request timeouts
- `HttpError` for HTTP 4xx/5xx responses
- `SerializationError` for data serialization failures
- `HttpErrorCategory` enum for error categorization

**Migration Guide:**

```typescript
// Before (v1.x)
try {
  const { data } = await client.get('/endpoint');
} catch (error) {
  if (error instanceof ApiResponseError) {
    console.log('Status:', error.status);
    console.log('Response:', error.response);
  }
}

// After (v2.x)
import { HttpError, NetworkError, TimeoutError, SerializationError } from '@reggieofarrell/http-client';

try {
  const { data } = await client.get('/endpoint');
} catch (error) {
  if (error instanceof HttpError) {
    console.log('Status:', error.status);
    console.log('Category:', error.category);
    console.log('Response:', error.response);
    console.log('Retriable:', error.isRetriable);
  } else if (error instanceof NetworkError) {
    console.log('Network issue:', error.metadata.error.type);
  }
}
```

## Releasing

1. Bump the version and update `CHANGELOG.md` from Conventional Commits since the last release:
   `npm run release` (or `release:patch` / `release:minor` / `release:major` to force a specific
   bump). Use `release:test` first for a dry run.
2. Push the commit and tag: `git push --follow-tags origin main`.
3. Create the GitHub Release, which triggers `.github/workflows/release.yml`'s publish job:
   `npm run release:publish` (wraps `gh release create v$npm_package_version --generate-notes`).

Publishing to npm uses [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) —
there is no long-lived npm token in CI. This requires a one-time setup per maintainer machine/repo:
a GitHub Environment named `npm` (Settings → Environments) and, from an authenticated npm CLI
session, `npm trust github --repository reggieofarrell/http-client --file release.yml --environment
npm --allow-publish`.

## Quality gates

Pull requests run format, lint (including locally implemented SonarJS rules on `src/`), types,
Jest with `coverageThreshold`, build, and a runtime-dependency audit. Pushes to `main` also
upload coverage to SonarQube at <https://sonar.casadega.dev> (new-code quality gate). PR
decoration is deferred until that `main` baseline exists; see
[docs/development/sonarqube.md](docs/development/sonarqube.md).

Local Husky hooks run a fail-closed secret scan on commit and push. Coding-agent post-edit hooks
run a type-independent SonarJS subset on production `src/` files. The changed-file Sonar
precheck (`npm run sonar:precheck`) skips loudly when Scanner or credentials are missing; CI
still enforces the full scan after the project is provisioned.

## License

0BSD
