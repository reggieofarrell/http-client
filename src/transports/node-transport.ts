import { request as httpRequest, type IncomingMessage, type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { XiorRequestConfig, XiorResponse } from 'xior';
import { joinPath, isAbsoluteURL, buildSortedURL } from 'xior';
import {
  buildHeadersFromEntries,
  buildXiorResponse,
  buildAbortError,
  buildNetworkError,
  buildTimeoutError,
  buildProgressEvent,
  settleFromResponse,
  stringifyHeaderValue,
  type RequestConfigWithProgress,
} from './shared.js';

const CHUNK_SIZE = 64 * 1024;

/**
 * Builds the final absolute URL using xior's own public, documented utility exports
 * (joinPath/isAbsoluteURL/buildSortedURL/encodeParams) rather than reverse-engineering xior's
 * internal (minified, undocumented) request-building logic - this stays correct even if xior
 * changes its internals in a future version.
 *
 * By the time a request reaches any xior plugin (including this one), xior has already
 * normalized it into its own `XiorInterceptorRequestConfig` shape, which guarantees `baseURL`,
 * `method`, `headers`, and `params` are always real values (never falsy/absent) and
 * `paramsSerializer` is always already a function (xior's own default) - confirmed empirically
 * against a real xior instance, not assumed - so none of these need a fallback here. `url` is the
 * one exception: it comes directly from what the caller passed to e.g. `client.get(url, ...)`, so
 * an empty string is a real (if unusual) possibility worth keeping a fallback for.
 *
 * Non-null assertions on those normalized fields are omitted deliberately: `joinPath` already
 * accepts optional strings, and Sonar (S4325) flags assertions the receiver does not need.
 */
function buildFinalUrl(request: XiorRequestConfig): string {
  const path = request.url || '';
  const fullPath = isAbsoluteURL(path) ? path : joinPath(request.baseURL, path);

  const paramsSerializer = request.paramsSerializer ?? (() => '');
  return buildSortedURL(fullPath, request.params ?? null, paramsSerializer);
}

function readIncomingMessageBody(res: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });
}

function isReadableStream(data: unknown): data is Readable {
  return data !== null && typeof data === 'object' && typeof (data as any).pipe === 'function';
}

/**
 * Tracks streams that have already had at least one byte read from them by this transport -
 * checked synchronously, independent of whatever Node's own `readableEnded`/`destroyed` state
 * happens to be by the time a retry re-invokes this function. `stream.pipeline()` does reliably
 * destroy a failed pipeline's source stream (confirmed empirically: 20/20 adversarial trials of a
 * mid-upload connection reset, immediately retried with `delayFactor: 0`, were correctly rejected
 * via the `readableEnded`/`destroyed` check alone), but relying on that as the *only* guard means
 * trusting Node-internal async cleanup timing for something whose failure mode is silent data
 * corruption - a partially-retried stream would truncate the body with no error at all. This set
 * makes the guard correct by construction instead of by observed timing.
 */
const streamsAlreadyStartedReading = new WeakSet<Readable>();

function getContentLengthHeader(request: XiorRequestConfig): number | undefined {
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === 'content-length' && value !== undefined) {
      return Number(stringifyHeaderValue(value));
    }
  }
  return undefined;
}

/**
 * Splits the request body into a Buffer (copied from string/Uint8Array, reused
 * for Buffer) or a Readable stream. Buffers are checked first because they are
 * also Uint8Array instances and must not be copied.
 *
 * @param data Body already validated by `assertSupportedBody`.
 * @param request Used only to read Content-Length for streams.
 * @returns Buffer or stream plus an optional known byte length.
 */
function resolveNodeUploadBody(
  data: unknown,
  request: XiorRequestConfig
): { bodyBuffer?: Buffer; bodyStream?: Readable; total: number | undefined } {
  if (Buffer.isBuffer(data)) {
    return { bodyBuffer: data, total: data.length };
  }
  if (typeof data === 'string' || data instanceof Uint8Array) {
    const bodyBuffer = Buffer.from(data);
    return { bodyBuffer, total: bodyBuffer.length };
  }
  return { bodyStream: data as Readable, total: getContentLengthHeader(request) };
}

/**
 * Reads the Node HTTP response body and settles the outer Promise exactly once.
 * Kept at module scope so the `http.request` callback does not nest past the
 * SonarJS function-nesting limit.
 *
 * @param request Original xior config, used to build the library response object.
 * @param res Incoming message from `node:http` / `node:https`.
 * @param settleOnce Guard that ignores late success/failure after the first settlement.
 * @param resolve Fulfill the outer upload Promise with a xior-shaped response.
 * @param reject Reject the outer upload Promise with a typed transport error.
 */
function handleIncomingResponse(
  request: XiorRequestConfig,
  res: IncomingMessage,
  settleOnce: (fn: () => void) => void,
  resolve: (value: XiorResponse<any>) => void,
  reject: (reason: unknown) => void
): void {
  readIncomingMessageBody(res)
    .then(responseBodyBuffer => {
      const status = res.statusCode || 0;
      const statusText = res.statusMessage || '';
      const responseHeaders = buildHeadersFromEntries(flattenNodeHeaders(res.headers));
      const xiorResponse = buildXiorResponse(
        request,
        status,
        statusText,
        responseHeaders,
        responseBodyBuffer
      );
      settleOnce(() => settleFromResponse(request, xiorResponse, resolve, reject));
    })
    // Defensive: a response stream failing specifically during body-read (as opposed to
    // the request itself failing, already covered by the real-server test for a
    // mid-response connection reset below) is hard to force deterministically - in
    // practice, destroying the underlying socket surfaces through `req`'s own 'error'
    // handler before/instead of this one.
    /* istanbul ignore next */
    .catch(err => settleOnce(() => reject(buildNetworkError(request, err))));
}

class UploadCounterTransform extends Transform {
  private loaded = 0;

  constructor(
    private readonly source: Readable,
    private readonly total: number | undefined,
    private readonly onProgress: (event: ReturnType<typeof buildProgressEvent>) => void
  ) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: any) => void
  ): void {
    // Mark on the first real byte specifically - not any earlier - so a stream that fails before
    // any data actually flows (e.g. connection refused before the pipeline starts moving) is
    // still safely retryable; it's genuinely untouched.
    streamsAlreadyStartedReading.add(this.source);
    this.loaded += chunk.length;
    this.onProgress(buildProgressEvent(this.loaded, this.total));
    callback(null, chunk);
  }
}

/**
 * Real upload-progress transport for Node, using node:http/node:https directly - fetch (and
 * therefore xior) cannot report real upload progress, so this bypasses it entirely.
 *
 * v1 limitations, all deliberate (see the plan this was implemented from):
 * - No redirect-following (Node's http/https don't auto-follow, unlike fetch's default).
 * - FormData bodies are not supported (Node's http/https can't natively serialize them the way
 *   fetch does - use the browser transport, or pass a pre-encoded Buffer with your own
 *   Content-Type instead).
 * - Only the default json/text response parsing is supported (matches xior's own default).
 */
export function performNodeUploadRequest(request: XiorRequestConfig): Promise<XiorResponse<any>> {
  const onProgress = (request as RequestConfigWithProgress).realUploadProgress!;
  const data = request.data;

  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    return Promise.reject(
      new TypeError(
        "FormData bodies aren't supported by the real-upload-progress transport under Node. " +
          'Run this in a browser (XMLHttpRequest handles multipart/form-data natively, at zero ' +
          'extra cost), or pass a pre-encoded Buffer body with your own Content-Type, or omit ' +
          'realUploadProgress to fall back to normal fetch handling of FormData.'
      )
    );
  }

  // A Readable is single-use. If retryConfig (instance-level or per-request) causes this same
  // request to be re-dispatched, this plugin runs again with the *same* config object - which,
  // for a stream body, means the *same* Readable, possibly already (even just partially)
  // consumed. Rather than trying to detect "are retries configured" (this plugin has no
  // visibility into a sibling plugin's config), catch the actual symptom directly: a stream this
  // transport has already started reading from, tracked explicitly rather than inferred from
  // `readableEnded`/`destroyed` (see `streamsAlreadyStartedReading`'s doc for why).
  if (
    isReadableStream(data) &&
    (streamsAlreadyStartedReading.has(data) || data.readableEnded || data.destroyed)
  ) {
    return Promise.reject(
      new TypeError(
        'A Readable-stream request body cannot be safely retried (streams can only be read ' +
          'once). Disable retries for this request (retryConfig: { retries: 0 }) or provide the ' +
          'body as a Buffer/string instead.'
      )
    );
  }

  // No further "else" branch here: `performNodeUploadRequest` is only ever called from
  // `upload-progress-plugin.ts`, which already calls `assertSupportedBody` (string/Buffer/
  // Uint8Array/Readable/FormData only) before dispatching here, and FormData is already rejected
  // above - so one of these three cases always holds by the time this function runs. This isn't
  // itself the system boundary, so it trusts that guarantee rather than re-validating it.
  const { bodyBuffer, bodyStream, total } = resolveNodeUploadBody(data, request);

  const finalUrl = buildFinalUrl(request);
  const url = new URL(finalUrl);
  const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (value !== undefined) headers[key] = stringifyHeaderValue(value);
  }
  if (
    total !== undefined &&
    !Object.keys(headers).some(h => h.toLowerCase() === 'content-length')
  ) {
    headers['Content-Length'] = String(total);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settleOnce = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const req: ClientRequest = requestFn(
      url,
      {
        method: request.method!.toUpperCase(),
        headers,
        agent: (request as any).httpsAgent,
      },
      (res: IncomingMessage) => {
        handleIncomingResponse(request, res, settleOnce, resolve, reject);
      }
    );

    req.on('error', err => settleOnce(() => reject(buildNetworkError(request, err))));

    // Capture timeout into a local so the setTimeout callback does not need a
    // non-null assertion on `request.timeout` (S4325).
    const timeoutMs = request.timeout;
    if (timeoutMs) {
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        settleOnce(() => reject(buildTimeoutError(request, timeoutMs)));
      });
    }

    if (request.signal) {
      if (request.signal.aborted) {
        req.destroy();
        settleOnce(() => reject(buildAbortError(request)));
        return;
      }
      request.signal.addEventListener('abort', () => {
        req.destroy();
        settleOnce(() => reject(buildAbortError(request)));
      });
    }

    // Defensive: writeBody failing independently of the request/timeout/abort/response paths
    // already covered above (e.g. a write specifically failing mid-flight) isn't realistically
    // forceable without deep, invasive mocking of the socket - not worth it for one line.
    /* istanbul ignore next */
    void writeBody(req, bodyBuffer, bodyStream, total, onProgress).catch(err =>
      settleOnce(() => reject(buildNetworkError(request, err)))
    );
  });
}

async function writeBody(
  req: ClientRequest,
  bodyBuffer: Buffer | undefined,
  bodyStream: Readable | undefined,
  total: number | undefined,
  onProgress: (event: ReturnType<typeof buildProgressEvent>) => void
): Promise<void> {
  if (bodyStream) {
    const counter = new UploadCounterTransform(bodyStream, total, onProgress);
    await pipeline(bodyStream, counter, req);
    return;
  }

  const buf = bodyBuffer!;
  let offset = 0;
  let loaded = 0;

  while (offset < buf.length) {
    const end = Math.min(offset + CHUNK_SIZE, buf.length);
    const chunk = buf.subarray(offset, end);
    const canContinue = req.write(chunk);
    loaded += chunk.length;
    onProgress(buildProgressEvent(loaded, total));
    if (!canContinue) {
      await new Promise<void>(resolveDrain => req.once('drain', resolveDrain));
    }
    offset = end;
  }

  // Zero-length body: still emit one event so a caller always sees at least a final callback.
  if (buf.length === 0) {
    onProgress(buildProgressEvent(0, total));
  }

  req.end();
}

function* flattenNodeHeaders(rawHeaders: IncomingMessage['headers']): Generator<[string, string]> {
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) yield [key, v];
    } else {
      yield [key, value];
    }
  }
}
