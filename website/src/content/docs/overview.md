---
title: Documentation overview
description: How the usage docs are split into getting started, guides, and reference.
---

This site is intentionally split into three layers:

- **Getting started**: set up a client and run your first request.
- **Guides**: practical pages for configuration, transport behavior, and extension points.
- **Reference**: error handling and compatibility notes for long-lived integrations.

## User journeys

- [Quick start](/http-client/getting-started/) for install and first request.
- [Configuration](/http-client/usage/configuration/) when you need client defaults.
- [Request methods](/http-client/usage/request-methods/) for all HTTP verbs and response typing.
- [Timeouts](/http-client/usage/timeouts/) for cancellation, `AbortController`, and retry combinations.
- [Retries](/http-client/usage/retries/) for backoff, jitter, and `Retry-After` handling.
- [Idempotency](/http-client/usage/idempotency/) to keep retries safe for mutation requests.
- [Upload progress](/http-client/usage/upload-progress/) for true upload progress without simulated progress bars.
- [Plugins and Xior integration](/http-client/usage/plugins/) for low-level extension when you need xior-level control.
- [Middleware hooks](/http-client/usage/middleware/) for request/response/error lifecycle customization.

## Reference map

- [Error handling](/http-client/reference/error-handling/) for the public error hierarchy.
- [Breaking changes](/http-client/reference/breaking-changes/) for upgrade guidance.
- [License](/http-client/reference/license/) for package terms.
