import type { XiorRequestConfig, XiorResponse } from 'xior';

/**
 * `instanceof Error` is not reliable here: a real Node system error (e.g. a genuine ECONNREFUSED
 * from `node:net`) can be constructed in a different realm/VM context than the one this code runs
 * in - confirmed directly, including with Jest's own sandboxed test environment, where a real
 * ECONNREFUSED's `instanceof Error` check came back `false` despite the object being a completely
 * normal Error with a message/stack/code. `Object.prototype.toString.call` reads the internal
 * `[[Class]]`/`Symbol.toStringTag` instead of walking the prototype chain, so it correctly
 * identifies an Error-like object regardless of which realm constructed it.
 */
export function isErrorLike(value: unknown): value is Error {
  return Object.prototype.toString.call(value) === '[object Error]';
}

/**
 * A real upload progress event, reported by the transport that actually sent the bytes
 * (XMLHttpRequest in the browser, node:http/https in Node) - not simulated.
 * @typeParam total/progress - Only present when the request body's byte length is known ahead
 * of time (string/Buffer/Uint8Array bodies, or a stream body with a caller-supplied
 * Content-Length header). Omitted entirely (not `undefined`) when unknown, per this project's
 * `exactOptionalPropertyTypes` setting.
 */
export interface UploadProgressEvent {
  /** Bytes uploaded so far. Always present and monotonically non-decreasing. */
  loaded: number;
  /** Total bytes to upload, if known ahead of time. */
  total?: number;
  /** `(loaded / total) * 100`, not rounded. Only present when `total` is known. */
  progress?: number;
  /** Mirrors XHR's `ProgressEvent.lengthComputable` - true only when `total` is known. */
  lengthComputable: boolean;
}

/**
 * `realUploadProgress` is declared on `HttpClientRequestConfig` (`src/http-client.ts`), not as a
 * global ambient augmentation of xior's own `XiorRequestConfig` (unlike xior's own progress
 * plugin, which does augment `XiorRequestConfig` globally for `onUploadProgress`/
 * `onDownloadProgress`) - deliberately, so this feature's type footprint stays scoped to this
 * library's own config surface. Internally, though, this plugin operates on a plain
 * `XiorRequestConfig` (xior's `XiorPlugin` type requires it), so this local, internal-only type
 * is used to safely read the field `HttpClient` is guaranteed to have put there.
 */
export interface RequestConfigWithProgress extends XiorRequestConfig {
  realUploadProgress?: (event: UploadProgressEvent) => void;
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

export function isNullBodyStatus(status: number): boolean {
  return NULL_BODY_STATUSES.has(status);
}

export function buildProgressEvent(loaded: number, total: number | undefined): UploadProgressEvent {
  return {
    loaded,
    ...(total !== undefined && { total, progress: (loaded / total) * 100 }),
    lengthComputable: total !== undefined,
  };
}

function parseResponseData(bodyText: string): any {
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

/**
 * Builds a real Headers instance from a plain header map (Node's `res.headers`, or a parsed
 * XHR `getAllResponseHeaders()` string turned into entries) - deliberately a genuine Headers
 * instance, not a duck-typed stand-in, since XiorResponse types it as a real Headers.
 */
export function buildHeadersFromEntries(entries: Iterable<[string, string]>): Headers {
  const headers = new Headers();
  for (const [key, value] of entries) {
    headers.append(key, value);
  }
  return headers;
}

/**
 * Coerces a header value to a wire-safe string without relying on Object's default
 * stringification (`[object Object]`), which Sonar flags (S6551) and which would be
 * useless on the wire anyway.
 *
 * Strings pass through; numbers/booleans use `String(...)`; arrays are joined with
 * commas (HTTP's multi-value convention); unexpected objects are JSON-serialized so
 * we never accidentally send `[object Object]`.
 *
 * @param value - A single header value from xior's `Record<string, any>` headers map.
 * @returns A string suitable for `setRequestHeader` / Node's `headers` option.
 */
export function stringifyHeaderValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(item => stringifyHeaderValue(item)).join(', ');
  }
  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  // null / undefined / symbol / function - String() is fine for these primitives
  return String(value);
}

/**
 * Builds a real, spec-correct XiorResponse from raw transport results. Constructs a genuine
 * `Headers`/`Response` (both globally available in Node 18+ and all target browsers) rather than
 * a duck-typed stand-in. `config`/`request` are both set to the same request-config object,
 * mirroring xior's own real shape (and MockPlugin's confirmed-legitimate synthetic pattern) -
 * `XiorResponse.request`/`.config` are typed identically as "the config," not a distinct
 * network-level object.
 */
export function buildXiorResponse(
  request: XiorRequestConfig,
  status: number,
  statusText: string,
  headers: Headers,
  body: string | Uint8Array
): XiorResponse<any> {
  // Accepts either a string (the browser transport already has `xhr.responseText` as a string -
  // encoding it to bytes and back would be pure overhead, and `TextEncoder` isn't reliably
  // present in every test/sandboxed environment even though it is in every real browser) or raw
  // bytes (the Node transport reads bytes off the socket directly). TextDecoder works
  // identically for a Node Buffer (a Uint8Array subclass) and a real browser Uint8Array.
  const bodyText = typeof body === 'string' ? body : new TextDecoder().decode(body);
  const data = bodyText.length > 0 ? parseResponseData(bodyText) : bodyText;
  const isEmpty = typeof body === 'string' ? body.length === 0 : body.byteLength === 0;
  const responseBody = isNullBodyStatus(status) || isEmpty ? null : body;
  const response = new Response(responseBody, { status, statusText, headers });

  return {
    data,
    status,
    statusText,
    headers,
    response,
    config: request as any,
    request: request as any,
  };
}

/**
 * xior's real adapter rejects with a XiorError-shaped object whenever `!response.ok` (confirmed
 * by reading xior's own core adapter source, not assumed) - this replicates that exactly, using
 * xior's own "Request failed with status code {n}" message format for consistency, so a
 * progress-tracked request's error surfaces identically to a normal one.
 */
export function buildHttpStatusError(
  request: XiorRequestConfig,
  xiorResponse: XiorResponse<any>
): Error {
  const message = `Request failed with status code ${xiorResponse.status}`;
  return Object.assign(new Error(message), {
    name: 'XiorError',
    request,
    config: request,
    response: xiorResponse,
  });
}

export function buildTimeoutError(request: XiorRequestConfig, timeoutMs: number): Error {
  return Object.assign(new Error(`timeout of ${timeoutMs}ms exceeded`), {
    name: 'Error',
    code: 'ETIMEDOUT',
    request,
    config: request,
  });
}

export function buildAbortError(request: XiorRequestConfig): Error {
  return Object.assign(new Error('The user aborted a request.'), {
    name: 'AbortError',
    request,
    config: request,
  });
}

export function buildNetworkError(request: XiorRequestConfig, cause: unknown): Error {
  const message = isErrorLike(cause) ? cause.message : String(cause);
  const error = Object.assign(new Error(message || 'Network Error'), {
    request,
    config: request,
  });
  if (isErrorLike(cause) && 'code' in cause) {
    (error as any).code = (cause as any).code;
  }
  return error;
}

/** Resolves whichever of `response`/`resolve` a completed request should trigger. */
export function settleFromResponse(
  request: XiorRequestConfig,
  xiorResponse: XiorResponse<any>,
  resolve: (value: XiorResponse<any>) => void,
  reject: (reason: Error) => void
): void {
  if (xiorResponse.response.ok) {
    resolve(xiorResponse);
  } else {
    reject(buildHttpStatusError(request, xiorResponse));
  }
}

export type SupportedBody = string | Buffer | Uint8Array | NodeJS.ReadableStream | FormData;

export function assertSupportedBody(data: unknown): asserts data is SupportedBody {
  // `data instanceof Uint8Array` already covers a Node Buffer (a Uint8Array subclass) - no
  // separate Buffer check is needed, and `Buffer` isn't a safe global to reference here since
  // this module is also loaded in real browsers with no Node polyfill.
  const isStringOrBuffer = typeof data === 'string' || data instanceof Uint8Array;
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
  const isReadableStream =
    data !== null &&
    typeof data === 'object' &&
    typeof (data as any).pipe === 'function' &&
    typeof (data as any).read === 'function';

  if (!isStringOrBuffer && !isFormData && !isReadableStream) {
    throw new TypeError(
      'realUploadProgress requires a pre-serialized body (string/Buffer/Uint8Array/Readable/FormData) - ' +
        'JSON.stringify plain objects yourself and set Content-Type: application/json.'
    );
  }
}

const NO_BODY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Shared by both the universal plugin factory (`upload-progress-plugin.ts`, which dispatches to
 * either transport at runtime) and the browser-only one (`upload-progress-plugin.browser.ts`,
 * which never imports the Node transport at all - see that file's module doc for why) so the
 * passthrough/validation decision isn't duplicated between them.
 *
 * Returns `true` if this request should be intercepted and handled by a real transport;
 * `false` if it should pass through to the adapter unchanged. Throws (via `assertSupportedBody`)
 * if the request should be intercepted but has an unsupported body type.
 */
export function shouldHandleProgressRequest(request: XiorRequestConfig): boolean {
  const config = request as RequestConfigWithProgress;
  // xior always normalizes `method` to a real string before any plugin sees the request
  // (confirmed empirically against a real xior instance) - no fallback needed.
  const method = config.method!.toUpperCase();

  // Also passes through when there's no actual body to track (e.g. a DELETE or PUT with
  // realUploadProgress set but no data) - method alone isn't enough to decide this, since
  // DELETE/PUT/PATCH can legitimately have a body or not.
  if (
    typeof config.realUploadProgress !== 'function' ||
    NO_BODY_METHODS.has(method) ||
    request.data === undefined
  ) {
    return false;
  }

  // Don't try to replicate xior's internal (undocumented, minified) JSON-serialization
  // inference here - require a pre-serialized body instead. Duck-typing that inference would
  // invite exactly the kind of drift this project has already been bitten by more than once.
  assertSupportedBody(request.data);
  return true;
}
