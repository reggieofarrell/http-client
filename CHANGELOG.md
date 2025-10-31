# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [2.3.1](https://github.com/reggieofarrell/http-client/compare/v2.3.0...v2.3.1) (2025-10-31)


### Features

* enhance OpenAPI code generator with type-safe error handling and improved type extraction ([#12](https://github.com/reggieofarrell/http-client/issues/12)) ([b2d3d98](https://github.com/reggieofarrell/http-client/commit/b2d3d986b086022dd483c2d99b11bad33e20c325))

## [2.3.0](https://github.com/reggieofarrell/http-client/compare/v2.2.0...v2.3.0) (2025-10-31)


### Features

* add query parameter support in HttpClient requests ([#11](https://github.com/reggieofarrell/http-client/issues/11)) ([769c102](https://github.com/reggieofarrell/http-client/commit/769c102dacd88f4a6cd4a965ac37c469cde31c20))

## [2.2.0](https://github.com/reggieofarrell/http-client/compare/v2.1.0...v2.2.0) (2025-10-31)


### Features

* add support for path parameters in HttpClient requests ([#10](https://github.com/reggieofarrell/http-client/issues/10)) ([3774383](https://github.com/reggieofarrell/http-client/commit/3774383bcbab49260ca740871de0fe0a2d8c08a4))

## [2.1.0](https://github.com/reggieofarrell/http-client/compare/v2.0.0...v2.1.0) (2025-10-17)


### Features

* introduce OpenAPI SDK Code Generator for strongly-typed client generation ([#9](https://github.com/reggieofarrell/http-client/issues/9)) ([c2268f3](https://github.com/reggieofarrell/http-client/commit/c2268f313cbdfe5a24c4477fa4b14474af56abf3))

## [2.0.0](https://github.com/reggieofarrell/http-client/compare/v1.2.1...v2.0.0) (2025-10-17)


### ⚠ BREAKING CHANGES

* introduce stable error types and enhance error handling in HttpClient (#4)

### Features

* add HEAD and OPTIONS request methods to HttpClient and make request method public ([#7](https://github.com/reggieofarrell/http-client/issues/7)) ([4b80c41](https://github.com/reggieofarrell/http-client/commit/4b80c41ad1d174e90747ccf2dacbec5144ec4b10))
* add/change middleware hooks for request and response modification in HttpClient ([#5](https://github.com/reggieofarrell/http-client/issues/5)) ([1e715eb](https://github.com/reggieofarrell/http-client/commit/1e715ebce4dde9118470ee006158652c372dc510))
* introduce stable error types and enhance error handling in HttpClient ([#4](https://github.com/reggieofarrell/http-client/issues/4)) ([697295e](https://github.com/reggieofarrell/http-client/commit/697295e434a7e92a571f8b9c3f3855dd7efb2bf4))
* refactor error handling in HttpClient with processError method ([#6](https://github.com/reggieofarrell/http-client/issues/6)) ([48fd0e7](https://github.com/reggieofarrell/http-client/commit/48fd0e716d2575051014b40c46cf2a75873224ce))

## [1.2.1](https://github.com/reggieofarrell/http-client/compare/v1.2.0...v1.2.1) (2025-10-15)


### Bug Fixes

* update package.json to fix module exports and adjust main/module paths ([06aa5d9](https://github.com/reggieofarrell/http-client/commit/06aa5d9db490427948323a19977876177bef0154))

## [1.2.0](https://github.com/reggieofarrell/http-client/compare/v1.1.0...v1.2.0) (2025-10-14)


### Features

* implement idempotency key support ([#3](https://github.com/reggieofarrell/http-client/issues/3)) ([33e157c](https://github.com/reggieofarrell/http-client/commit/33e157c18111d1cc8720aa568073b321b179c0c9))

## [1.1.0](https://github.com/reggieofarrell/http-client/compare/v1.0.6...v1.1.0) (2025-10-14)


### Features

* add backoff jitter and Retry-After header support ([#2](https://github.com/reggieofarrell/http-client/issues/2)) ([974f962](https://github.com/reggieofarrell/http-client/commit/974f962aab1d1c99c00dc7148209ba8ec30e5609))
