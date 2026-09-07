---
title: Configuration
description: Set client-level defaults and override request settings.
---

[Back to getting started](/http-client/getting-started/)

## Client configuration

`HttpClient` options include:

- `baseURL` (required)
- `xiorConfig` for low-level xior transport defaults
- `retryConfig` and `idempotencyConfig`
- `errorMessageExtractor` for error message extraction
- Optional logging flags (`debug`, `debugLevel`) that are only flags for your own hooks
- `uploadProgressPlugin` for opt-in upload progress integration

```ts
import { HttpClient } from '@reggieofarrell/http-client';

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  name: 'ApiClient',
  xiorConfig: {
    timeout: 30000,
  },
  retryConfig: {
    retries: 2,
    delayFactor: 500,
    backoff: 'exponential',
    backoffJitter: 'none',
  },
  idempotencyConfig: {
    enabled: true,
    methods: ['POST', 'PATCH'],
    headerName: 'Idempotency-Key',
  },
});
```

## Request-level configuration

Use request options for per-call overrides:

```ts
const { data } = await client.get('/endpoint', {
  headers: {
    'x-request-trace': 'trace-123',
  },
  timeout: 5000,
  retryConfig: {
    retries: 5,
    backoff: 'linear',
    delayFactor: 1000,
  },
  errorMessageExtractor: 'data.error.message',
});
```

## Path and query parameters

`pathParams` fills `:paramName` placeholders:

```ts
const { data } = await client.get('/users/:userId/posts/:postId', {
  pathParams: {
    userId: 'user@example.com',
    postId: 456,
  },
});
```

This produces encoded path segments (`user@example.com` -> `user%40example.com`).

Query parameters use xior's inherited axios-compatible `params`:

```ts
const { data } = await client.get('/users', {
  params: {
    status: 'active',
    limit: 20,
  },
});
```

[Back to the guide map](/http-client/overview/)
