# Http Client

A lightweight HTTP client for both the server and browser built on `xior` with retry functionality, written in TypeScript.

## Installation

```bash
npm install @reggieofarrell/http-client
```

## What is Xior?

[Xior](https://suhaotian.github.io/xior/) is a lightweight (~6KB) fetch-based HTTP client with an axios-like API. It supports plugins, interceptors, and provides similar functionality to axios while being built on the modern `fetch` API.

## Built on

This package is built on top of `@reggieofarrell/axios-retry-client v2` and provides a similar API, but uses `xior` instead of `axios` for smaller bundle size and modern fetch-based architecture.

## Usage

### Configuration Options

The `HttpClient` accepts the following configuration options:

- `xiorConfig`: Configuration for the underlying [xior instance](https://suhaotian.github.io/xior/). This includes timeout settings, headers, and other xior-specific options.
- `baseURL`: Base URL for the API.
- `debug`: Whether to log request and response details.
- `debugLevel`: Debug level. 'normal' will log request and response data. 'verbose' will log all xior properties for the request and response.
- `name`: Name of the client. Used for logging.
- `retryConfig`: Configuration for error retry functionality. The default config if you don't override it is `{ retries: 0, retryDelay: exponentialDelay, delayFactor: 500, backoff: 'exponential', backoffJitter: 'none' }`. You can override individual properties in the `retryConfig` and they will be merged with the default. We add `delayFactor`, `backoff`, and `backoffJitter` to make configuring the retry delay easier. Otherwise you'd have to create your own `retryDelay` function (which you can still do if you like).
- `idempotencyConfig`: Configuration for idempotency key generation. The default config is `{ enabled: false, methods: ['POST', 'PATCH'], headerName: 'Idempotency-Key' }`. This helps prevent duplicate operations when requests are retried due to network issues or timeouts.

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
      return error.response?.status === 503;
    }
  }
})
```

**Note**: Per-request retry configuration leverages xior's built-in error-retry plugin options that are applied at the request level.

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
      // Retry on timeout errors
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
   * @default counter-based key generation
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

The client automatically handles retry scenarios by reusing the same idempotency key:

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

// If this request fails and retries, the same idempotency key will be used
const { data } = await client.post('/critical-operation', data);
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
4. **Key cleanup**: Keys are automatically cleaned up after successful requests
5. **Retry scenarios**: The same key is reused during retries, preventing duplicate operations

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

The `HttpClient` supports various data types for requests:

#### FormData (File Uploads)

```typescript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('description', 'My file upload');

const { data } = await client.post('/upload', formData);
```

#### URL-Encoded Form Data

```typescript
const params = new URLSearchParams();
params.append('username', 'johndoe');
params.append('password', 'secret123');

const { data } = await client.post('/login', params, {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
});
```

#### Plain Text

```typescript
const textData = 'Hello World';

const { data } = await client.post('/text', textData, {
  headers: {
    'Content-Type': 'text/plain'
  }
});
```

#### XML Data

```typescript
const xmlData = '<?xml version="1.0"?><root><item>value</item></root>';

const { data } = await client.post('/xml', xmlData, {
  headers: {
    'Content-Type': 'application/xml'
  }
});
```

#### Binary Data

```typescript
const binaryData = new ArrayBuffer(8);
const view = new Uint8Array(binaryData);
view[0] = 0x48; // 'H'
view[1] = 0x65; // 'e'

const { data } = await client.post('/binary', binaryData, {
  headers: {
    'Content-Type': 'application/octet-stream'
  }
});
```

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

  // Method for requests that need progress tracking
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

// Upload with progress
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
- **Progress**: `xior/plugins/progress` - Upload/download progress
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

### Error Handling

The `HttpClient` provides comprehensive error handling:

```typescript
try {
  const { data } = await client.get('/endpoint');
  console.log(data);
} catch (error) {
  if (error instanceof ApiResponseError) {
    console.log('API Error:', error.status, error.response);
  } else {
    console.log('Network Error:', error.message);
  }
}
```

### Debugging

Enable debug logging to see request and response details:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  debug: true,
  debugLevel: 'verbose' // or 'normal'
});
```

## License

0BSD
