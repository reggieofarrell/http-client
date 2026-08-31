import xior from 'xior';
import type { XiorError, XiorInstance, XiorPlugin, XiorRequestConfig, XiorResponse } from 'xior';
import errorRetryPlugin from 'xior/plugins/error-retry';
import type { UploadProgressEvent } from './upload-progress.js';
import {
  NetworkError,
  TimeoutError,
  HttpError,
  SerializationError,
  AbortError,
  classifyHttpError,
  isTimeoutError,
  isSerializationError,
  isAbortError,
  buildErrorMetadata,
  buildNetworkErrorMetadata,
  buildHttpErrorResponse,
  classifyErrorForRetry,
  type HttpErrorOptions,
} from './errors.js';

export enum RequestType {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

type BackoffOptions = 'exponential' | 'linear' | 'none';
type JitterOptions = 'none' | 'full' | 'equal' | 'decorrelated';

/**
 * Type for error message extraction from HTTP error responses
 * - String: dot notation path like "data.error.message"
 * - Function: custom extraction logic (errorResponse) => string | undefined
 */
export type ErrorMessageExtractor = string | ((errorResponse: any) => string | undefined);

export interface HttpClientRetryConfig {
  /**
   * Number of times to retry failed requests
   */
  retries?: number;
  /**
   * Function to determine the delay between retries
   */
  retryDelay?: (retryCount: number, error: XiorError, config: XiorRequestConfig) => number;
  /**
   * Callback function called on each retry attempt
   */
  onRetry?: (config: XiorRequestConfig, error: XiorError, retryCount: number) => void;
  /**
   * The base delay factor in milliseconds
   */
  delayFactor?: number;
  /**
   * Backoff strategy: 'exponential', 'linear', or 'none'
   */
  backoff?: BackoffOptions;
  /**
   * Jitter strategy to prevent thundering herd: 'none', 'full', 'equal', or 'decorrelated'
   * @default 'none'
   */
  backoffJitter?: JitterOptions;
  /**
   * Function to determine if a request should be retried
   * Note: The error parameter will be a XiorError during retry evaluation,
   * but will be converted to HttpClientError types when thrown
   */
  enableRetry?: boolean | ((config: XiorRequestConfig, error: XiorError) => boolean | undefined);
}

export interface IdempotencyConfig {
  /**
   * Enable idempotency key generation
   * @default false
   */
  enabled?: boolean;
  /**
   * HTTP methods that should include idempotency keys
   * @default ['POST', 'PATCH']
   */
  methods?: RequestType[];
  /**
   * Header name for idempotency key
   * @default 'Idempotency-Key'
   */
  headerName?: string;
  /**
   * Custom function to generate idempotency keys
   * @default counter-based key generation
   */
  keyGenerator?: () => string;
}

export interface HttpClientRequestConfig extends XiorRequestConfig {
  retryConfig?: HttpClientRetryConfig;
  /**
   * Manual idempotency key for this request
   */
  idempotencyKey?: string;
  /**
   * Per-request idempotency configuration
   */
  idempotencyConfig?: IdempotencyConfig;
  /**
   * Per-request error message extractor override
   * String path: dot notation like "data.error.message"
   * Function: (errorResponse) => errorResponse.data?.error
   */
  errorMessageExtractor?: ErrorMessageExtractor;
  /**
   * Path parameters to substitute in the URL
   * URLs can contain path parameters in the format `:paramName`
   * Example: `/users/:userId/posts/:postId` with `pathParams: { userId: '123', postId: '456' }`
   * Results in: `/users/123/posts/456`
   * Values are automatically URL-encoded for safety
   */
  pathParams?: Record<string, string | number>;
  /**
   * Real (non-simulated) per-request upload-progress callback. Requires the instance to have
   * been constructed with `uploadProgressPlugin` (see
   * `@reggieofarrell/http-client/upload-progress`) - native fetch cannot report real upload
   * progress, so setting this bypasses fetch/xior entirely for this one request.
   *
   * Deliberately not named `onUploadProgress` - that name is already used by xior's own
   * (simulated, timer-based) `xior/plugins/progress` for a different mechanism; reusing it here
   * would let both silently fire on the same callback if a client has both configured.
   */
  realUploadProgress?: (event: UploadProgressEvent) => void;
}

export interface HttpClientResponse<T> {
  request: XiorResponse;
  data: T;
}

export interface HttpClientOptions {
  /**
   * Configuration for the underlying xior instance
   */
  xiorConfig?: Omit<XiorRequestConfig, 'baseURL'>;
  /**
   * Base URL for the API
   */
  baseURL: string;
  /**
   * A flag for your own use - this library does not log anything itself. Read
   * `this.debug`/`this.debugLevel` inside your own `beforeRequest`/`afterResponse`/`onError`
   * overrides to decide what (and whether) to log, with whatever logger you want. See the
   * README's "Debugging" section for a worked example.
   */
  debug?: boolean;
  /**
   * A granularity flag for your own use, alongside `debug` - this library does not interpret it
   * itself. 'normal' vs. 'verbose' is a convention your own hook overrides can apply (e.g. logging
   * just the request body vs. the full config), not a built-in behavior.
   */
  debugLevel?: 'normal' | 'verbose';
  /**
   * Name of the client. Used for logging
   */
  name?: string;
  /**
   * Configuration for the error-retry plugin.
   * The default configuration is `{ retries: 0, retryDelay: exponentialDelay, delayFactor: 500, backoff: 'exponential' }`.
   */
  retryConfig?: HttpClientRetryConfig;
  /**
   * Configuration for idempotency key generation.
   * The default configuration is `{ enabled: false, methods: ['POST', 'PATCH'], headerName: 'Idempotency-Key' }`.
   */
  idempotencyConfig?: IdempotencyConfig;
  /**
   * Path or function to extract error message from response.
   * String path: dot notation like "data.error.message"
   * Function: (errorResponse) => errorResponse.data?.error
   * @default "data.message"
   */
  errorMessageExtractor?: ErrorMessageExtractor;
  /**
   * Enables real (non-simulated) upload progress. Pass `createUploadProgressPlugin()` from
   * `@reggieofarrell/http-client/upload-progress` - a separate, opt-in entry point so consumers
   * who don't use this feature never pull its transport code into their bundle. Once supplied,
   * use the per-request `realUploadProgress` callback (`HttpClientRequestConfig`) to actually
   * receive progress events.
   */
  uploadProgressPlugin?: XiorPlugin;
}

/**
 * The largest delay `setTimeout` honors (a 32-bit signed integer, in ms) - roughly 24.8 days.
 * Node and browsers silently clamp anything larger (or non-finite, e.g. `Infinity`) down to ~0-1ms
 * instead of throwing, so an unbounded `Retry-After` value would otherwise invert the documented
 * "server-specified delay takes precedence" guarantee: a server asking for a long cool-down (a
 * multi-week rate-limit suspension, say) would be retried almost instantly instead. Confirmed
 * directly: `setTimeout(fn, 999999999000)` and `setTimeout(fn, Infinity)` both fire within ~1ms in
 * Node, emitting a `TimeoutOverflowWarning`.
 */
const MAX_RETRY_AFTER_MS = 2_147_483_647;

/** Clamps a parsed Retry-After delay (ms) into `[0, MAX_RETRY_AFTER_MS]`. */
function clampRetryDelay(delayMs: number): number {
  return Math.min(Math.max(delayMs, 0), MAX_RETRY_AFTER_MS);
}

export class HttpClient {
  client: XiorInstance;
  xiorConfig: HttpClientOptions['xiorConfig'];
  baseURL: HttpClientOptions['baseURL'];
  debug: HttpClientOptions['debug'];
  debugLevel: HttpClientOptions['debugLevel'];
  name: HttpClientOptions['name'];
  retryConfig: HttpClientRetryConfig;
  idempotencyConfig: IdempotencyConfig;
  errorMessageExtractor: ErrorMessageExtractor;
  /**
   * Set once in the constructor from `config.uploadProgressPlugin` and never
   * mutated afterward - `readonly` makes that invariant visible to readers and
   * to Sonar (S2933).
   */
  private readonly hasUploadProgressPlugin: boolean;

  constructor(config: HttpClientOptions) {
    const backoff = config.retryConfig?.backoff || 'exponential';
    const delayFactor = config.retryConfig?.delayFactor || 500;
    const name = config.name || 'HttpClient';

    const defaultRetryConfig: HttpClientRetryConfig = {
      retries: 0,
      // No-op by default - this library does not log anything itself (see debug/debugLevel's
      // doc comments). Pass your own retryConfig.onRetry to observe retry attempts.
      onRetry: () => {},
      delayFactor,
      backoff,
      backoffJitter: 'none',
      // By default, retry on 5xx errors and network errors
      enableRetry: (_config, error) => {
        // Use our error classification helper for consistent logic
        const classification = classifyErrorForRetry(error);
        return classification.isRetriable;
      },
    };

    const retryConfig: HttpClientRetryConfig = config.retryConfig
      ? {
          ...defaultRetryConfig,
          ...config.retryConfig,
        }
      : defaultRetryConfig;

    const defaultIdempotencyConfig: IdempotencyConfig = {
      enabled: false,
      methods: [RequestType.POST, RequestType.PATCH],
      headerName: 'Idempotency-Key',
    };

    const idempotencyConfig: IdempotencyConfig = config.idempotencyConfig
      ? {
          ...defaultIdempotencyConfig,
          ...config.idempotencyConfig,
        }
      : defaultIdempotencyConfig;

    delete config.retryConfig;
    delete config.idempotencyConfig;

    config = {
      xiorConfig: {},
      retryConfig,
      debug: false,
      debugLevel: 'normal',
      name,
      ...config,
    };

    this.xiorConfig = config.xiorConfig;
    this.baseURL = config.baseURL;
    this.debug = config.debug;
    this.debugLevel = config.debugLevel;
    this.name = config.name;
    this.retryConfig = config.retryConfig!;
    this.idempotencyConfig = idempotencyConfig;
    this.errorMessageExtractor = config.errorMessageExtractor || 'data.message';
    this.hasUploadProgressPlugin = !!config.uploadProgressPlugin;

    const client = xior.create({
      ...config.xiorConfig,
      baseURL: config.baseURL,
    });

    // Only registered if the consumer explicitly opted in (imported the /upload-progress
    // subpath and passed the result here) - and, whenever it is, registered before the
    // conditional retry plugin below so retryConfig composes correctly with progress-tracked
    // uploads (each retry attempt re-invokes this plugin, and therefore the real transport, from
    // scratch). See @reggieofarrell/http-client/upload-progress for why both the conditionality
    // (tree-shaking - nothing here imports that subpath) and the ordering (retry composition)
    // matter.
    if (config.uploadProgressPlugin) {
      client.plugins.use(config.uploadProgressPlugin);
    }

    // Always registered, even when retryConfig.retries is 0 (the default) - xior's error-retry
    // plugin reads retryTimes/retryInterval/enableRetry/onRetry fresh from each request's own
    // config (falling back to these plugin-creation-time values only when a request doesn't set
    // its own), so a per-request `retryConfig.retries` override needs the plugin to already be in
    // the chain to have any effect. Registering it conditionally on the instance-level default
    // meant a per-request override on an instance built with the default retries silently did
    // nothing - confirmed directly: an instance built with no retryConfig, given a per-request
    // `retryConfig: { retries: 3 }`, made exactly 1 request instead of 4. With retryTimes: 0 (the
    // default), a failure is still thrown on the very first attempt, so this changes nothing for
    // an instance that never opts into retries at any level.
    const pluginOptions: any = {
      retryTimes: this.retryConfig.retries,
      retryInterval: this.buildRetryInterval(),
    };

    if (this.retryConfig.onRetry) {
      pluginOptions.onRetry = this.retryConfig.onRetry;
    }

    if (this.retryConfig.enableRetry !== undefined) {
      pluginOptions.enableRetry = this.retryConfig.enableRetry;
    }

    client.plugins.use(errorRetryPlugin(pluginOptions));

    this.client = client;
  }

  /**
   * Builds a retryInterval function for xior's error-retry plugin.
   * If a custom `retryDelay` is provided (either via `overrides` or the instance's
   * `retryConfig`), it is used verbatim and fully bypasses the built-in backoff/jitter
   * calculation. Otherwise the delay is computed from the effective backoff, delayFactor,
   * and backoffJitter (per-request overrides take precedence over instance-level config).
   */
  private buildRetryInterval(overrides?: HttpClientRetryConfig) {
    return (count: number, cfg: XiorRequestConfig, error: XiorError): number => {
      const retryDelay = overrides?.retryDelay ?? this.retryConfig.retryDelay;
      if (retryDelay) {
        return retryDelay(count, error, cfg);
      }

      const backoff = overrides?.backoff ?? this.retryConfig.backoff!;
      const delayFactor = overrides?.delayFactor ?? this.retryConfig.delayFactor!;
      const backoffJitter = overrides?.backoffJitter ?? this.retryConfig.backoffJitter ?? 'none';

      return this.getRetryDelay(count, error, backoff, delayFactor, backoffJitter);
    };
  }

  private getRetryDelay(
    retryCount: number,
    error: XiorError,
    backoff: string,
    delayFactor: number,
    jitter: JitterOptions
  ): number {
    // Check for Retry-After header - it takes precedence over calculated delays
    if (error.response?.headers) {
      const headers = error.response.headers as any;
      const retryAfter = headers['retry-after'] || headers['Retry-After'];
      if (retryAfter) {
        const retryAfterMs = this.parseRetryAfter(retryAfter);
        if (retryAfterMs !== null) {
          // Return Retry-After value without jitter (server-specified delay)
          return retryAfterMs;
        }
      }
    }

    // Calculate base delay using backoff strategy
    let delay: number;
    if (backoff === 'exponential') {
      // Exponential backoff: delayFactor * 2^(retryCount - 1)
      delay = delayFactor * Math.pow(2, retryCount - 1);
    } else if (backoff === 'linear') {
      // Linear backoff: delayFactor * retryCount
      delay = delayFactor * retryCount;
    } else {
      // No backoff: constant delay
      delay = delayFactor;
    }

    // Apply jitter based on strategy
    if (jitter === 'full') {
      // Full jitter: random value between 0 and delay
      return this.sampleJitterFraction() * delay;
    } else if (jitter === 'equal') {
      // Equal jitter: half deterministic, half random
      return delay / 2 + this.sampleJitterFraction() * (delay / 2);
    } else if (jitter === 'decorrelated') {
      // Decorrelated jitter (stateless approximation): random between base and delay * 3
      return delayFactor + this.sampleJitterFraction() * (delay * 3 - delayFactor);
    } else {
      // No jitter
      return delay;
    }
  }

  /**
   * Unit-interval sample used only to spread retry timestamps. This is not a
   * security context: a CSPRNG would add latency without changing the
   * thundering-herd property the jitter is meant to provide.
   *
   * @returns A number in `[0, 1)`.
   */
  private sampleJitterFraction(): number {
    // eslint-disable-next-line sonarjs/pseudo-random -- retry jitter is not cryptographic
    return Math.random();
  }

  private parseRetryAfter(retryAfter: string | number): number | null {
    // If it's a number (or string number), treat as seconds
    const asNumber = Number(retryAfter);
    if (!Number.isNaN(asNumber)) {
      // Clamp to [0, MAX_RETRY_AFTER_MS]: negative values (a malformed/adversarial header) become
      // 0, and anything - including `Infinity` - past setTimeout's 32-bit limit is capped rather
      // than silently firing almost instantly (see MAX_RETRY_AFTER_MS).
      return clampRetryDelay(asNumber * 1000); // Convert to milliseconds
    }

    // Try parsing as HTTP date
    const asDate = new Date(retryAfter);
    if (!Number.isNaN(asDate.getTime())) {
      return clampRetryDelay(asDate.getTime() - Date.now());
    }

    return null;
  }

  /**
   * Extracts error message from response data using configured path or function
   * @param errorResponse - The error response object
   * @param extractor - String path or function to extract message
   * @returns Extracted message or undefined
   */
  private extractErrorMessage(
    errorResponse: any,
    extractor: ErrorMessageExtractor
  ): string | undefined {
    if (typeof extractor === 'function') {
      // Function-based extraction
      return extractor(errorResponse);
    }

    // String path extraction (dot notation)
    const parts = extractor.split('.');
    let current = errorResponse;

    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }

    return typeof current === 'string' ? current : undefined;
  }

  /**
   * Substitutes path parameters in a URL with values from the pathParams object
   * Path parameters are defined using the :paramName format in the URL
   * All substituted values are URL-encoded for safety
   * @param url - The URL containing path parameters in :paramName format
   * @param pathParams - Object containing parameter names and their values
   * @returns The URL with path parameters substituted and URL-encoded
   * @throws Error if a required path parameter is missing from pathParams
   */
  private substitutePathParams(url: string, pathParams?: Record<string, string | number>): string {
    // Fresh regex each call: a module-level `/g` pattern would retain lastIndex
    // across requests and skip matches. `\w` is `[A-Za-z0-9_]` without the `u` flag.
    const paramPattern = /:([a-zA-Z_]\w*)/g;

    // Path parameters only ever belong in the path segment - scanning the whole URL also matched
    // colon-then-letter runs inside the query string or fragment (e.g. a connection string like
    // `?db=redis://user:pass@host`, or a fragment like `#section:intro`), misidentifying them as
    // unresolved :paramName placeholders and throwing on a perfectly valid request. Split the
    // query/fragment off first and leave it untouched.
    const queryOrFragmentIndex = url.search(/[?#]/);
    const pathPart = queryOrFragmentIndex === -1 ? url : url.slice(0, queryOrFragmentIndex);
    const rest = queryOrFragmentIndex === -1 ? '' : url.slice(queryOrFragmentIndex);

    // If no pathParams provided, return URL as-is
    if (!pathParams || Object.keys(pathParams).length === 0) {
      // Check if the path contains any :paramName patterns - if so, throw error
      const matches = pathPart.match(paramPattern);
      if (matches && matches.length > 0) {
        const missingParams = matches.map(match => match.substring(1)); // Remove the :
        throw new Error(
          `Missing required path parameters: ${missingParams.join(', ')}. Provide values via pathParams config.`
        );
      }
      return url;
    }

    // Replace each :paramName with its URL-encoded value from pathParams
    const substitutedPath = pathPart.replaceAll(paramPattern, (_match, paramName: string) => {
      if (!(paramName in pathParams)) {
        throw new Error(
          `Missing required path parameter: ${paramName}. Provide value via pathParams.${paramName}`
        );
      }

      const value = pathParams[paramName];
      const stringValue = typeof value === 'number' ? value.toString() : value;

      // encodeURIComponent encodes everything except: A-Z a-z 0-9 - _ . ! ~ * ' ( )
      return encodeURIComponent(stringValue);
    });

    return substitutedPath + rest;
  }

  /**
   * Generates a fresh idempotency key. Uses `crypto.randomUUID()` when available
   * (Node 19+/modern browsers), falling back to a timestamp + random suffix otherwise.
   * Uniqueness matters more than unpredictability here; replay protection is the
   * server's job.
   */
  private generateIdempotencyKey(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    // eslint-disable-next-line sonarjs/pseudo-random -- last-resort uniqueness when Web Crypto is absent
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Performs an HTTP request with the specified method, URL, data, and configuration
   * @param requestType - The HTTP method to use (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
   * @param url - The URL to send the request to. Can contain path parameters in the format `:paramName`
   * @param data - Optional data to send in the request body (for POST, PUT, PATCH)
   * @param config - Optional request configuration. Use `pathParams` to substitute path parameters in the URL
   * @returns Promise resolving to HttpClientResponse
   */
  async request<T>(
    requestType: RequestType,
    url: string,
    data?: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    // Shallow-clone before any mutation below: applyPathParams/applyPerRequestRetryConfig/
    // applyIdempotencyHeaders all delete trigger fields (pathParams, retryConfig,
    // idempotencyKey/idempotencyConfig) off of `config` once they've used them, and
    // applyIdempotencyHeaders reassigns `config.headers` to a new object carrying the generated
    // key. Without this clone, all of that mutates the SAME object reference the caller passed
    // in - so reusing one config object across two calls (a natural pattern: a shared options
    // object in a loop or helper) either throws on the second call (pathParams looks "missing"
    // because it was deleted after call 1) or silently resends call 1's stale, now-unregenerable
    // Idempotency-Key header (idempotencyConfig was deleted, so call 2 can't tell it should
    // generate a fresh one - but the header from call 1 is still sitting on the shared object).
    // Cloning isolates every call's derived state from the caller's own object.
    config = { ...config };
    let req: XiorResponse<T> | undefined;

    if (config.realUploadProgress && !this.hasUploadProgressPlugin) {
      throw new Error(
        'realUploadProgress requires passing uploadProgressPlugin: createUploadProgressPlugin() ' +
          "(from '@reggieofarrell/http-client/upload-progress') to the HttpClient constructor."
      );
    }

    // Path params, per-request retry, and idempotency headers are applied before
    // `beforeRequest` so subclass hooks see the fully resolved request.
    url = this.applyPathParams(url, config);
    this.applyPerRequestRetryConfig(config);
    this.applyIdempotencyHeaders(requestType, config);

    // Call beforeRequest middleware hook to modify request parameters and perform actions
    await this.beforeRequest(requestType, url, data, config);

    try {
      switch (requestType) {
        case RequestType.GET:
          req = await this.client.get<T>(url, config);
          break;
        case RequestType.POST:
          req = await this.client.post<T>(url, data, config);
          break;
        case RequestType.PUT:
          req = await this.client.put<T>(url, data, config);
          break;
        case RequestType.PATCH:
          req = await this.client.patch<T>(url, data, config);
          break;
        case RequestType.DELETE:
          req = await this.client.delete<T>(url, config);
          break;
        case RequestType.HEAD:
          req = await this.client.head<T>(url, config);
          break;
        case RequestType.OPTIONS:
          req = await this.client.options<T>(url, config);
          break;
      }
    } catch (err) {
      this.errorHandler(err, requestType, url);
    }

    if (!req) {
      // errorHandler is typed to return `never` so a conforming TypeScript override can't
      // compile without unconditionally throwing - but a plain-JS consumer, or an override that
      // routes around the type system (e.g. assigning a jest.fn()-style mock in a test), can
      // still return normally. There's no fallback response to construct in that case, so fail
      // loudly and specifically here rather than letting `req!.data` below throw a confusing
      // "Cannot read properties of undefined" with no indication of the actual cause.
      throw new Error(
        `[${this.name || 'HttpClient'}] errorHandler must throw - it returned normally instead ` +
          `of throwing for a failed ${requestType} ${url} request. Override errorHandler and ` +
          `either call "throw this.processError(error, reqType, url)" or throw a custom error ` +
          'built from it - see the README\'s "Error Handling" section.'
      );
    }

    // Call afterResponse middleware hook for successful responses.
    // After the `if (!req)` guard above, TypeScript has already narrowed `req`
    // to defined - non-null assertions here are redundant (S4325).
    await this.afterResponse(requestType, url, req, req.data);

    return { request: req, data: req.data };
  }

  /**
   * Substitutes `:paramName` segments and strips `pathParams` so it never reaches xior.
   * Calling this with no `pathParams` still validates that the URL has none left.
   *
   * @param url Request path that may contain `:paramName` placeholders.
   * @param config Mutable per-request config; `pathParams` is deleted after use.
   * @returns The URL with placeholders replaced.
   */
  private applyPathParams(url: string, config: HttpClientRequestConfig): string {
    const substitutedUrl = this.substitutePathParams(url, config.pathParams);
    delete config.pathParams;
    return substitutedUrl;
  }

  /**
   * Maps this library's `retryConfig` onto xior's error-retry plugin options
   * (`retryTimes`, `retryInterval`, `onRetry`, `enableRetry`) for one request.
   *
   * @param config Mutable per-request config; `retryConfig` is deleted after mapping.
   */
  private applyPerRequestRetryConfig(config: HttpClientRequestConfig): void {
    if (!config.retryConfig) {
      return;
    }

    const perRequestRetryConfig = config.retryConfig;

    if (perRequestRetryConfig.retries !== undefined) {
      config.retryTimes = perRequestRetryConfig.retries;
    }

    config.retryInterval = this.buildRetryInterval(perRequestRetryConfig);

    if (perRequestRetryConfig.onRetry !== undefined) {
      config.onRetry = perRequestRetryConfig.onRetry;
    }

    if (perRequestRetryConfig.enableRetry !== undefined) {
      config.enableRetry = perRequestRetryConfig.enableRetry;
    }

    delete config.retryConfig;
  }

  /**
   * Injects an idempotency header when the merged instance/request config says
   * this method should send one. A caller-supplied `idempotencyKey` wins;
   * otherwise a custom `keyGenerator` or the built-in generator is used.
   *
   * @param requestType HTTP method for this call.
   * @param config Mutable per-request config; idempotency fields are deleted after use.
   */
  private applyIdempotencyHeaders(requestType: RequestType, config: HttpClientRequestConfig): void {
    const mergedIdempotencyConfig = {
      ...this.idempotencyConfig,
      ...config.idempotencyConfig,
    };

    if (mergedIdempotencyConfig.enabled && mergedIdempotencyConfig.methods?.includes(requestType)) {
      // To reuse the same key across manual retries, pass `idempotencyKey` explicitly.
      // Automatic retries already reuse this request/header internally.
      const idempotencyKey = this.resolveIdempotencyKey(config, mergedIdempotencyConfig);
      config.headers = {
        ...config.headers,
        [mergedIdempotencyConfig.headerName!]: idempotencyKey,
      };
    }

    delete config.idempotencyKey;
    delete config.idempotencyConfig;
  }

  /**
   * Picks the idempotency key for one request without nested ternaries.
   *
   * @param config Per-request config that may already hold a manual key.
   * @param merged Combined instance + request idempotency settings.
   * @returns The key to send in the configured header.
   */
  private resolveIdempotencyKey(
    config: HttpClientRequestConfig,
    merged: IdempotencyConfig
  ): string {
    if (config.idempotencyKey) {
      return config.idempotencyKey;
    }
    if (merged.keyGenerator) {
      return merged.keyGenerator();
    }
    return this.generateIdempotencyKey();
  }

  /**
   * Performs a GET request to the specified URL
   * @param url - The URL to send the GET request to
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async get<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.GET, url, undefined, config);
  }

  /**
   * Performs a POST request to the specified URL
   * @param url - The URL to send the POST request to
   * @param data - The data to send in the request body
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async post<T = any>(
    url: string,
    data: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.POST, url, data, config);
  }

  /**
   * Performs a PUT request to the specified URL
   * @param url - The URL to send the PUT request to
   * @param data - The data to send in the request body
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async put<T = any>(
    url: string,
    data: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.PUT, url, data, config);
  }

  /**
   * Performs a PATCH request to the specified URL
   * @param url - The URL to send the PATCH request to
   * @param data - The data to send in the request body
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async patch<T = any>(
    url: string,
    data: any,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.PATCH, url, data, config);
  }

  /**
   * Performs a DELETE request to the specified URL
   * @param url - The URL to send the DELETE request to
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async delete<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.DELETE, url, undefined, config);
  }

  /**
   * Performs a HEAD request to the specified URL
   * @param url - The URL to send the HEAD request to
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async head<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.HEAD, url, undefined, config);
  }

  /**
   * Performs an OPTIONS request to the specified URL
   * @param url - The URL to send the OPTIONS request to
   * @param config - Optional request configuration
   * @returns Promise resolving to HttpClientResponse
   */
  async options<T = any>(
    url: string,
    config: HttpClientRequestConfig = {}
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(RequestType.OPTIONS, url, undefined, config);
  }

  /**
   * Override this method in your extending class to modify request parameters, perform actions
   * before the request is sent, or log the outgoing request (check `this.debug`/`this.debugLevel`
   * to decide what to log - see the README's "Debugging" section for a worked example; this
   * library does not log anything itself). You can modify the `data` and `config` objects
   * directly as they are passed by reference.
   *
   * If this override throws, the exception propagates out of `request()` as-is - it does NOT go
   * through `errorHandler`/`processError` and is never one of this library's error types
   * (`HttpError`, `NetworkError`, etc.). That's deliberate: an exception here comes from your own
   * hook logic, not the transport, so there's no correct error category to force it into.
   * `catch (err) { err instanceof HttpError }` will always be `false` for a `beforeRequest`
   * failure - that's how you can tell it apart from a real request failure.
   *
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param data - The request data (mutable)
   * @param config - The request config (mutable)
   */
  protected async beforeRequest(
    _requestType: RequestType,
    _url: string,
    _data: any,
    _config: XiorRequestConfig
  ): Promise<void> {
    // Default implementation - override in extending classes
  }

  /**
   * Override this method in your extending class to modify response data
   * and perform actions after receiving a successful response. You can modify
   * the `response.data` directly as it is passed by reference.
   *
   * Only called for a successful (already-resolved) response, and only after the underlying
   * request has genuinely succeeded - so if this override throws, that exception propagates out
   * of `request()` as-is, the same way a `beforeRequest` failure does (see its doc comment): not
   * through `errorHandler`, and not as one of this library's error types. A raw exception here
   * tells you the request itself succeeded but your own post-processing failed - distinct from a
   * request failure, which always throws one of `HttpError`/`NetworkError`/etc.
   *
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param response - The xior response object (mutable)
   * @param data - The response data (mutable reference to response.data)
   */
  protected async afterResponse(
    _requestType: RequestType,
    _url: string,
    _response: XiorResponse,
    _data: any
  ): Promise<void> {
    // Default implementation - override in extending classes
  }

  /**
   * Processes all types of errors and returns the appropriate error object
   * This method handles all the core error processing logic that should be preserved
   * @param error - The error object from xior
   * @param reqType - The request type
   * @param url - The request URL
   * @returns A fully constructed error object (HttpError, NetworkError, TimeoutError, or SerializationError)
   */
  protected processError(
    error: any,
    reqType: RequestType,
    url: string
  ): HttpError | NetworkError | TimeoutError | SerializationError | AbortError {
    const requestConfig: XiorRequestConfig = {
      method: reqType,
      url,
      baseURL: this.baseURL,
      headers: error.config?.headers || {},
      timeout: error.config?.timeout,
    };

    if (error.response) {
      return this.processHttpResponseError(error, requestConfig);
    }

    return this.processTransportError(error, reqType, url, requestConfig);
  }

  /**
   * Builds an `HttpError` from a response whose status is outside 2xx.
   *
   * @param error Original xior error that still has `response`.
   * @param requestConfig Metadata snapshot shared with other error types.
   * @returns Classified HTTP error ready to throw.
   */
  private processHttpResponseError(error: any, requestConfig: XiorRequestConfig): HttpError {
    const metadata = buildErrorMetadata(requestConfig, this.name || 'HttpClient');
    const response = buildHttpErrorResponse(error.response);
    const category = classifyHttpError(error.response.status);
    const statusText = error.response.statusText || '';
    const extractor = error.config?.errorMessageExtractor || this.errorMessageExtractor;
    const extractedMessage = this.extractErrorMessage(error.response, extractor);
    const message = extractedMessage || statusText;

    // `error.config` is the actual config xior's error-retry plugin evaluated for the live retry
    // loop - the same object a per-request `retryConfig.enableRetry` override was merged onto (see
    // `applyPerRequestRetryConfig`). Preferring it over `this.retryConfig.enableRetry` (and over
    // the reconstructed `requestConfig`) means the isRetriable computed here always matches what
    // actually happened during retries, instead of silently falling back to the instance-level
    // default's answer for a request that used a per-request override.
    const effectiveConfig = (error.config as HttpClientRequestConfig | undefined) ?? requestConfig;
    const effectiveEnableRetry = effectiveConfig.enableRetry ?? this.retryConfig.enableRetry;

    let isRetriable: boolean | undefined;
    if (effectiveEnableRetry && typeof effectiveEnableRetry === 'function') {
      isRetriable = effectiveEnableRetry(effectiveConfig, error);
    }

    // Assemble a single HttpErrorOptions object (named fields at the call site) rather
    // than a long positional list. Only attach isRetriable when enableRetry produced an
    // explicit boolean so exactOptionalPropertyTypes stays happy and HttpError can still
    // derive retriability when the field is omitted.
    const httpErrorOptions: HttpErrorOptions = {
      message,
      status: error.response.status,
      category,
      statusText,
      response,
      metadata,
      cause: error,
    };
    if (typeof isRetriable === 'boolean') {
      httpErrorOptions.isRetriable = isRetriable;
    }

    return new HttpError(httpErrorOptions);
  }

  /**
   * Classifies errors that never produced an HTTP response (abort, timeout,
   * serialization, or generic network failure).
   *
   * @param error Original xior/transport error without `response`.
   * @param reqType HTTP method used for the call.
   * @param url Request URL after path-param substitution.
   * @param requestConfig Metadata snapshot shared with other error types.
   * @returns The matching typed error from this library's hierarchy.
   */
  private processTransportError(
    error: any,
    reqType: RequestType,
    url: string,
    requestConfig: XiorRequestConfig
  ): NetworkError | TimeoutError | SerializationError | AbortError {
    const clientName = this.name || 'HttpClient';
    const prefix = `[${clientName}] ${reqType} ${url}`;

    if (isAbortError(error)) {
      const metadata = buildNetworkErrorMetadata(requestConfig, clientName, error);
      return new AbortError(
        `${prefix} [aborted] : ${error.message || 'Request aborted'}`,
        metadata,
        error
      );
    }

    if (isSerializationError(error)) {
      const metadata = buildErrorMetadata(requestConfig, clientName);
      return new SerializationError(
        `${prefix} [serialization error] : ${error.message || 'Serialization error'}`,
        metadata,
        error
      );
    }

    if (isTimeoutError(error)) {
      const metadata = buildNetworkErrorMetadata(requestConfig, clientName, error);
      return new TimeoutError(
        `${prefix} [timeout] : ${error.message || 'Request timeout'}`,
        metadata,
        error
      );
    }

    const metadata = buildNetworkErrorMetadata(requestConfig, clientName, error);
    return new NetworkError(
      `${prefix} [network error] : ${error.message || 'Network error'}`,
      metadata,
      error
    );
  }

  /**
   * Called from the default `errorHandler`, right after `processError` classifies a request's
   * final error and right before it's thrown - the counterpart to `beforeRequest`/`afterResponse`
   * for the failure path. Override this to observe/log a failed request (check
   * `this.debug`/`this.debugLevel` to decide what to log; this library does not log anything
   * itself - see the README's "Debugging" section).
   *
   * Fire-and-forget by design: `errorHandler` does not await this, so it can never delay when the
   * caller sees the thrown error, and if this override itself throws or rejects, that failure is
   * swallowed rather than replacing (or being swallowed alongside) the real error - a flaky
   * logging/telemetry integration must never mask the actual request failure. If you need a
   * guarantee that this completes before your process exits (e.g. a serverless handler), use your
   * runtime's own keepalive mechanism (Lambda's `context.callbackWaitsForEmptyEventLoop`,
   * Cloudflare's `event.waitUntil()`, etc.) inside your override - that's a runtime concern this
   * library does not try to solve.
   *
   * The `async`/`Promise<void>` signature is NOT about awaiting this (nothing does) - it's what
   * makes the swallow-failures guarantee above actually hold. `errorHandler` protects itself with
   * `void this.onError(...).catch(() => {})`, and that `.catch()` only ever sees a *rejected
   * promise* - it cannot intercept a plain synchronous `throw`. An `async` function converts a
   * synchronous `throw` in its body into a promise rejection automatically, so a subclass override
   * that throws synchronously is still safely swallowed. Confirmed directly: with `onError`
   * declared as a plain (non-`async`) method, `this.onError(...)` throws immediately at the call
   * site, before `.catch()` is ever attached, so the intended `throw processedError` on the next
   * line never runs and the caller gets the onError override's own error instead of the real one -
   * precisely the failure mode this hook exists to prevent. Do not remove `async` from an override
   * (or from this declaration) even though its return value is never used.
   *
   * Not called at all if a subclass overrides `errorHandler` directly instead of relying on the
   * default implementation - that override already owns the full throw contract. Call
   * `this.onError(...)` yourself, or `await super.errorHandler(...)`, if you want both.
   *
   * @param requestType - The request type (GET, POST, PUT, PATCH, DELETE)
   * @param url - The request URL
   * @param error - The fully classified error `errorHandler` is about to throw
   */
  protected async onError(
    _requestType: RequestType,
    _url: string,
    _error: HttpError | NetworkError | TimeoutError | SerializationError | AbortError
  ): Promise<void> {
    // Default implementation - override in extending classes
  }

  /**
   * Handles errors from the xior instance. Override this method for
   * custom error handling functionality specific to the API you are
   * consuming.
   *
   * For custom error handling, you can:
   * 1. Call this.processError to get the processed error object, then customize and throw it
   * 2. Completely override the error handling logic
   * 3. Add custom logging, metrics, or other side effects before throwing
   *
   * This method must always throw - there is no fallback response for `request()` to return if
   * it doesn't. An override that returns normally instead is a bug: `request()` detects this and
   * throws a clear configuration error rather than silently producing a broken response (see the
   * guard immediately after this method is called in `request()`).
   *
   * Note: a `never` return type isn't used here to enforce this at compile time, even though it
   * would statically forbid a non-throwing override - TypeScript doesn't infer `never` for an
   * override that always throws unless the override itself is also explicitly annotated `: never`
   * (confirmed directly: an unannotated override method whose body unconditionally throws is
   * still inferred as `() => void` for override-compatibility checking, not `() => never`). Doing
   * so would force every subclass overriding this method - including every compliant example in
   * this README - to add that annotation too, just to keep compiling.
   *
   * @param error - The error object
   * @param reqType - The request type
   * @param url - The request URL
   * @see https://suhaotian.github.io/xior
   */
  protected errorHandler(error: any, reqType: RequestType, url: string) {
    const processedError = this.processError(error, reqType, url);
    // Fire-and-forget - see onError's own doc comment for why this is never awaited.
    void this.onError(reqType, url, processedError).catch(() => {
      // onError's own failures must never surface as an unhandled rejection or mask the real
      // error being thrown below.
    });
    throw processedError;
  }
}
