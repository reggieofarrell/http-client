---
title: Middleware hooks
description: Customize request/response/error lifecycle behavior.
---

[Back to guides](/http-client/usage/configuration/)

`HttpClient` exposes hook methods for cross-cutting logic.

## `beforeRequest`

```ts
import { HttpClient } from '@reggieofarrell/http-client';

class ApiClient extends HttpClient {
  protected async beforeRequest(requestType: any, url: string, data: any, config: any): Promise<void> {
    config.headers = {
      ...config.headers,
      'x-request-id': crypto.randomUUID(),
    };
    if (data && typeof data === 'object') {
      data.requestId = crypto.randomUUID();
    }
  }
}
```

## `afterResponse`

```ts
class ApiClient extends HttpClient {
  protected async afterResponse(requestType: any, url: string, response: any, data: any): Promise<void> {
    if (data && Array.isArray(data.items)) {
      data.itemCount = data.items.length;
    }
  }
}
```

## `onError`

Use this for non-throwing telemetry hooks before the default throw.

```ts
class ApiClient extends HttpClient {
  protected async onError(requestType: any, url: string, error: any): Promise<void> {
    console.error(`${requestType} ${url} failed`, error.message);
  }
}
```

## `errorHandler`

If you override `errorHandler`, it must always throw.

```ts
class ApiClient extends HttpClient {
  protected errorHandler(error: any, reqType: any, url: string) {
    const processed = this.processError(error, reqType, url);
    processed.message = `[api] ${processed.message}`;
    throw processed;
  }
}
```

[Back to overview](/http-client/overview/)
