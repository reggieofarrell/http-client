---
title: Request methods
description: Use the supported methods and request type helpers.
---

[Back to request fundamentals](/http-client/usage/configuration/)

## Supported methods

```ts
const { data } = await client.get('/endpoint');
await client.post('/users', { name: 'Ada' });
await client.put('/users/1', { name: 'Ada' });
await client.patch('/users/1', { name: 'Ada' });
await client.delete('/users/1');
await client.head('/health');
await client.options('/options');
```

You can also call the generic request API directly:

```ts
import { RequestType } from '@reggieofarrell/http-client';

const { data } = await client.request(RequestType.GET, '/endpoint');
```

## Response typing

Pass response types through generics:

```ts
interface User {
  id: string;
  name: string;
}

const { data } = await client.get<User>('/users/123');
console.log(data.id);
```

## Underlying transport response

All request helpers return `{ request, data }`, where `request` is the transport response.

```ts
const { request, data } = await client.get('/endpoint');
console.log(request.status, request.headers);
```

## Data formats

Any body shape accepted by `fetch` can be sent:

```ts
await client.post('/form', new URLSearchParams({ mode: 'oauth' }));
await client.post('/text', 'hello', { headers: { 'Content-Type': 'text/plain' } });
await client.post('/binary', new Blob(['payload']), {
  headers: { 'Content-Type': 'application/octet-stream' },
});
```

[Back to overview](/http-client/overview/)
