---
title: Error handling
description: Public error classes, classification helpers, and retry-aware behavior.
---

[Back to docs overview](/http-client/overview/)

## Stable error types

- `HttpError` for HTTP status errors (`4xx`/`5xx`) with `status`, `category`, and `response` payload.
- `NetworkError` for connectivity failures.
- `TimeoutError` for request timeout paths.
- `SerializationError` for parse/serialize failures.
- `AbortError` for explicit caller cancellation.

All errors expose `isRetriable` so request-level retry logic can remain explicit and tested.

## Error type categories

`HttpErrorCategory` includes:

- `AUTHENTICATION`
- `NOT_FOUND`
- `RATE_LIMIT`
- `VALIDATION`
- `CLIENT_ERROR`
- `SERVER_ERROR`

## Error classification helpers

- `classifyErrorForRetry(error)` returns `{ type, isRetriable, status?, category? }`
- `isHttpError<T>()` narrows `response.data` safely
- `classifyHttpError`, `isAbortError`, `isTimeoutError`, and `isSerializationError`

```ts
import { HttpClient, HttpError, isHttpError, classifyErrorForRetry } from '@reggieofarrell/http-client';

try {
  const { data } = await new HttpClient({ baseURL: 'https://api.example.com' }).get('/endpoint');
  console.log(data);
} catch (error) {
  if (error instanceof HttpError) {
    console.log('status', error.status, 'category', error.category);
  }

  if (isHttpError<{ message: string }>(error)) {
    console.log('typed body', error.response.data.message);
  }

  if (classifyErrorForRetry(error).type === 'network') {
    console.log('network class; retriable?', classifyErrorForRetry(error).isRetriable);
  }
}
```

[Back to overview](/http-client/overview/)
