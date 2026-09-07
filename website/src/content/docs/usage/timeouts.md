---
title: Timeouts and cancellation
description: Configure request lifetimes and abort in-flight work.
---

[Back to configuration and request fundamentals](/http-client/usage/configuration/)

## Global timeout

Set a default timeout via `xiorConfig.timeout`.

```ts
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  xiorConfig: {
    timeout: 15000,
  },
});
```

## Per-request timeout

Override a default timeout at request time.

```ts
const { data } = await client.get('/fast', {
  timeout: 3000,
});
```

## Aborting in-flight requests

Use `AbortController` when the caller leaves a page or no longer needs a call.

```ts
const controller = new AbortController();

const request = client.get('/long-task', {
  signal: controller.signal,
});

controller.abort();

try {
  await request;
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('request cancelled');
  }
}
```

A deliberate abort is not retriable by default and does not consume idempotent automatic retries.

```ts
await client.get('/slow', {
  signal: controller.signal,
  retryConfig: {
    retries: 3,
  },
});
```

The abort is treated as cancellation, not a network transport failure.

[Back to overview](/http-client/overview/)
