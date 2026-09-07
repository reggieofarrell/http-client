<!-- npm-readme -->
# Http Client

A lightweight HTTP client for Node.js and browsers built on [`xior`](https://suhaotian.github.io/xior/).

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

## Primary docs

Full usage docs live at:

- https://reggieofarrell.github.io/http-client/

That site includes:

- setup and quick start
- request methods and transport configuration
- timeout, retry, and idempotency behavior
- real upload progress feature path
- middleware hooks and error handling
- plugin integration guidance
- breaking changes and migration notes

If you land here from npm, this file is intentionally compact and points to the full docs.
