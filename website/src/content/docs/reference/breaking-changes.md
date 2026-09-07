---
title: Breaking changes
description: Migration notes for notable releases.
---

[Back to docs overview](/http-client/overview/)

## v3.0.4

- Logging is no longer emitted automatically.
- `onError` hook was added as the failure-path lifecycle companion to `beforeRequest` and `afterResponse`.

## v3.0.0

- OpenAPI code generation shipped in this library was removed.
- Query alias cleanup: use `params` (the `query` alias is not part of the public client surface).
- `errorMessagePath` -> `errorMessageExtractor` naming alignment.
- `HttpError` now uses an options object constructor.
- `HttpError.response.data` defaults to `unknown` and should be narrowed before use.
- Real upload progress moved to optional entry point `@reggieofarrell/http-client/upload-progress`.

## v2.0.0

- Introduced stable error typing and removed legacy `ApiResponseError`.

For detailed migration snippets and runtime behavior, see the release notes in the package changelog.

[Back to overview](/http-client/overview/)
