---
title: Plugins and Xior integration
description: Extend the underlying transport and reuse xior power safely.
---

[Back to all guides](/http-client/usage/configuration/)

## Adding xior plugins

Because `HttpClient` is a thin wrapper around xior, you can add xior plugins when needed.

```ts
import cachePlugin from 'xior/plugins/cache';

const client = new HttpClient({ baseURL: 'https://api.example.com' });
client.client.plugins.use(cachePlugin({ cacheTime: 60_000, cacheItems: 50 }));
```

Use direct xior clients if you need a different plugin set for one request.

### Custom plugin wrapper

```ts
class EnhancedClient extends HttpClient {
  constructor() {
    super({ baseURL: 'https://api.example.com' });

    // plugin for all regular requests through this client
    this.client.plugins.use(cachePlugin({ cacheItems: 100 }));
  }
}
```

## Accessing the underlying client

The wrapped xior instance is available as `client.client`.

```ts
const xiorInstance = client.client;
const response = await xiorInstance.get('/native-xior-endpoint');
```

## Available xior plugins to evaluate

- `xior/plugins/cache`
- `xior/plugins/throttle`
- `xior/plugins/dedupe`
- `xior/plugins/progress`
- `xior/plugins/mock`
- `xior/plugins/error-cache`

See [xior's plugin docs](https://suhaotian.github.io/xior/) for the full list.

[Back to overview](/http-client/overview/)
