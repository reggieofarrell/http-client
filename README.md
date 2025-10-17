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
      // Note: error is a XiorError during retry evaluation
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

### Middleware Hooks

The `HttpClient` provides middleware-style hooks that allow you to modify requests and responses. These hooks are designed for direct mutation of parameters, making them more efficient and easier to use.

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

#### Error Handling

The `afterResponse` hook is only called for successful responses (2xx status codes). Error responses are handled by the `errorHandler` method:

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

The `HttpClient` provides comprehensive error handling with stable error types:

```typescript
import { HttpClient, NetworkError, TimeoutError, HttpError, SerializationError, HttpErrorCategory } from '@reggieofarrell/http-client';

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
  }
}
```

#### Error Types

The HTTP client provides four stable error types:

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
  type: 'network' | 'timeout' | 'http' | 'serialization' | 'unknown';
  isRetriable: boolean;
  status?: number;           // For HTTP errors
  category?: HttpErrorCategory; // For HTTP errors
}
```

This gives you access to:
- **Error type detection** - Know if it's a network, timeout, HTTP, or serialization error
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

### Debugging

Enable debug logging to see request and response details:

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  debug: true,
  debugLevel: 'verbose' // or 'normal'
});
```

## Breaking Changes

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

## License

0BSD
