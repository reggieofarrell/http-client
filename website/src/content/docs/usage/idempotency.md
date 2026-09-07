---
title: Idempotency
description: Keep retriable mutation requests safe.
---

[Back to request fundamentals](/http-client/usage/configuration/)

## Why idempotency

When network or timeout failures can produce uncertain outcomes, idempotent mutation keys prevent duplicate side effects.

## Configuration

```ts
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  idempotencyConfig: {
    enabled: true,
    methods: ['POST', 'PATCH', 'PUT'],
    headerName: 'Idempotency-Key',
  },
});
```

The key is generated per client request call and reused automatically for automatic retries inside that same call.

## Per-request options

```ts
await client.post('/payments', payload, {
  idempotencyKey: 'order-42-attempt',
});

await client.post('/payments', payload, {
  idempotencyConfig: {
    enabled: false,
  },
});
```

Provide explicit keys when you own the retry loop at the application level.

## Custom key generation

```ts
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  idempotencyConfig: {
    enabled: true,
    keyGenerator: () => `order-${Date.now()}`,
  },
});
```

## Best practices

1. Use idempotency for mutation endpoints that are safe to repeat.
2. Keep key naming stable across retries you control.
3. Keep long-running non-idempotent commands behind explicit keys.

[Back to overview](/http-client/overview/)
