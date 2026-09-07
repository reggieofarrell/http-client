---
title: HTTP Client documentation
description: A lightweight, practical HTTP client for Node.js and browsers built on xior.
template: splash
hero:
  title: HTTP Client
  tagline: |
    Reliable HTTP transport defaults, controlled retries, idempotent mutation support, and extensible middleware hooks.
  actions:
    - text: Get started
      link: /http-client/getting-started/
      icon: right-arrow
      variant: primary
    - text: Documentation overview
      link: /http-client/overview/
      variant: secondary
    - text: GitHub
      link: https://github.com/reggieofarrell/http-client
      icon: external
      variant: minimal
---

## Why use this library?

- **Stable client behavior** — configurable timeout and retry defaults, with explicit backoff and jitter.
- **Familiar ergonomics** — axios-like request syntax through xior’s API shape, with a small migration path for teams already using axios-style flows.
- **Fetch-native foundation** — built on xior’s fetch-based stack, so behavior stays close to standards-based browser and server runtimes.
- **Cross-platform parity** — the same client API works in Node.js and modern browsers for reuse across backend and frontend codebases.
- **Safer writes** — idempotency key support for retriable mutation requests.
- **Extensible hooks** — `beforeRequest`, `afterResponse`, and `errorHandler` points for custom behavior.
- **Compact footprint** — ~18.5 KB minified and ~7.3 KB gzipped when `xior` is bundled in.
- **Upload progress support** — optional upload progress handling without simulated progress bars.

## Where to go next

1. **[Getting started](/http-client/getting-started/)** — install and run your first request.
2. **[Documentation overview](/http-client/overview/)** — discover all guide and reference topics.
3. **[Configuration](/http-client/usage/configuration/)** — tune defaults and request behavior.
4. **[Reference: error handling](/http-client/reference/error-handling/)** — understand error classes and retryability.
