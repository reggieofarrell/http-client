---
title: Getting started
description: Install the package and run your first request.
---

[Back to docs map](/http-client/overview/)

## Install

```bash
npm install @reggieofarrell/http-client
```

## Quick start

```ts
import { HttpClient } from '@reggieofarrell/http-client';

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retryConfig: {
    retries: 2,
    delayFactor: 500,
  },
});

const { data } = await client.get('/status');
console.log(data);
```

The methods are thin wrappers around a single `request` implementation and return:

- `request`, `data`, and the underlying transport response for `200`-style responses.
- A raised error from one of the documented client error types for failed requests.

## Where to go next

- Configure the client defaults in [Configuration](/http-client/usage/configuration/).
- Learn how retries work in [Retries](/http-client/usage/retries/).
- See what comes back on failure in [Error handling](/http-client/reference/error-handling/).

[Read the full guide map](/http-client/overview/) and jump to the page you need.
