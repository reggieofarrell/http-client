---
title: Upload progress
description: Real upload progress via the optional upload-progress entry point.
---

[Back to guides](/http-client/usage/configuration/)

Native `fetch` does not provide true upload progress for browser and Node. This library exposes an
opt-in path that swaps transport only for requests that pass `realUploadProgress`.

## Install and configure

```ts
import { HttpClient } from '@reggieofarrell/http-client';
import { createUploadProgressPlugin } from '@reggieofarrell/http-client/upload-progress';

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  uploadProgressPlugin: createUploadProgressPlugin(),
});
```

## Browser and Node usage

```ts
// Browser example
const formData = new FormData();
formData.append('file', fileInput.files[0]);

await client.post('/upload', formData, {
  realUploadProgress: ({ loaded, total, progress }) => {
    console.log(`${loaded}/${total} (${progress}%)`);
  },
});
```

```ts
// Node example
import { createReadStream, statSync } from 'node:fs';

const { size } = statSync('./large-file.zip');

await client.post('/upload', createReadStream('./large-file.zip'), {
  headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(size),
  },
  realUploadProgress: ({ loaded, total, progress }) => {
    console.log(`bytes uploaded: ${loaded}/${total} (${progress}%)`);
  },
});
```

## Field notes

- `realUploadProgress` is intentionally separate from xior's simulated `onUploadProgress`.
- Streaming uploads can require known content length on Node for percentage values.
- Download progress is still handled by xior's own mechanisms.

[Back to overview](/http-client/overview/)
