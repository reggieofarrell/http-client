---
title: Retry strategy
description: Backoff, jitter, and retry classification.
---

[Back to request fundamentals](/http-client/usage/configuration/)

## Retry controls

```ts
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 3,
    delayFactor: 1000,
    backoff: 'exponential',
    backoffJitter: 'full',
  },
});
```

### Backoff strategies

- `exponential` (default): multiply delay by attempt count.
- `linear`: constant step growth.
- `none`: fixed delay.

### Jitter options

- `none`
- `full`
- `equal`
- `decorrelated`

## Per-request override

```ts
await client.get('/billing/status', {
  retryConfig: {
    retries: 1,
    backoff: 'linear',
    delayFactor: 250,
    backoffJitter: 'none',
  },
});
```

## Retry-After behavior

When servers return `Retry-After`, the client honors that delay before continuing and does not apply jitter for that header path.

## Keep retry logic in one place

`retryConfig` is the supported path for this client. Do not register `xior/plugins/error-retry` manually on the underlying `xior` instance.

```ts
await client.get('/unstable-endpoint', {
  retryConfig: {
    enableRetry: (config, error) => {
      return error.response?.status === 503;
    },
  },
});
```

[Back to overview](/http-client/overview/)
