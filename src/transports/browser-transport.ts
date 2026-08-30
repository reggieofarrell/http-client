/// <reference lib="dom" />

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
  isErrorLike,
  type RequestConfigWithProgress,
} from './shared.js';

/**
 * Builds the final absolute URL using xior's own public, documented utility exports - identical
 * approach to the Node transport, kept as its own copy (rather than a shared helper) since this
 * file must stay independently loadable/typeable under `lib: "dom"` without pulling in anything
 * Node-specific.
 *
 * By the time a request reaches any xior plugin (including this one), xior has already
 * normalized it into its own `XiorInterceptorRequestConfig` shape, which guarantees `baseURL`,
 * `method`, `headers`, and `params` are always real values (never falsy/absent) and
 * `paramsSerializer` is always already a function (xior's own default) - confirmed empirically
 * against a real xior instance, not assumed - so none of these need a fallback here. `url` is the
 * one exception: it comes directly from what the caller passed to e.g. `client.get(url, ...)`, so
 * an empty string is a real (if unusual) possibility worth keeping a fallback for.
 */
function buildFinalUrl(request: XiorRequestConfig): string {
  const path = request.url || '';
  const fullPath = isAbsoluteURL(path) ? path : joinPath(request.baseURL!, path);

  return buildSortedURL(fullPath, request.params!, request.paramsSerializer!);
}

function* parseXhrResponseHeaders(raw: string): Generator<[string, string]> {
  const lines = raw.trim().length > 0 ? raw.trim().split(/\r?\n/) : [];
  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    yield [key, value];
  }
}

/**
 * Real upload-progress transport for the browser, using XMLHttpRequest directly - the one
 * genuinely reliable real upload-progress signal (`xhr.upload.onprogress`), unlike fetch.
 *
 * FormData bodies are handled natively by the browser (`xhr.send(formData)`) - no encoding logic
 * needed here at all, unlike the Node transport which has to reject FormData entirely.
 *
 * `request.credentials === 'include'` maps onto `xhr.withCredentials = true` - without this, a
 * cross-origin request relying on `credentials: 'include'` for cookie/session auth would work via
 * the normal fetch path but silently lose credentials the moment `realUploadProgress` bypasses it
 * to XHR, since XHR defaults to *not* sending cross-origin credentials unless told to. `'omit'`
 * has no XHR equivalent and can't be fully replicated: XHR always sends same-origin cookies
 * regardless of `withCredentials` (that flag only ever affects cross-origin credentials), where
 * real fetch with `credentials: 'omit'` would suppress them entirely even same-origin - a
 * documented limitation, not a silent one.
 */
export function performBrowserUploadRequest(
  request: XiorRequestConfig
): Promise<XiorResponse<any>> {
  const onProgress = (request as RequestConfigWithProgress).realUploadProgress!;
  const data = request.data;
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const finalUrl = buildFinalUrl(request);
    xhr.open(request.method!.toUpperCase(), finalUrl, true);

    for (const [key, value] of Object.entries(request.headers!)) {
      if (value === undefined) continue;
      // Browsers set their own multipart boundary for FormData bodies - an explicit
      // Content-Type header would break that.
      if (isFormData && key.toLowerCase() === 'content-type') continue;
      xhr.setRequestHeader(key, String(value));
    }

    if (request.timeout) {
      xhr.timeout = request.timeout;
    }

    if (request.credentials === 'include') {
      xhr.withCredentials = true;
    }

    xhr.upload.onprogress = (event: ProgressEvent) => {
      onProgress(
        buildProgressEvent(event.loaded, event.lengthComputable ? event.total : undefined)
      );
    };

    // xhr.onload runs as an event-handler callback, not inside this Promise executor's own call
    // stack - an uncaught throw here would never reach `reject`, leaving the promise permanently
    // pending instead of failing loudly. Catch and reject explicitly.
    xhr.onload = () => {
      try {
        const headers = buildHeadersFromEntries(
          parseXhrResponseHeaders(xhr.getAllResponseHeaders())
        );
        // xhr.responseText is already a string - pass it straight through rather than
        // encoding to bytes and immediately decoding back, which also avoids depending on
        // TextEncoder being present (it's a standard browser API, but not reliably present in
        // every sandboxed test environment).
        const xiorResponse = buildXiorResponse(
          request,
          xhr.status,
          xhr.statusText,
          headers,
          xhr.responseText
        );
        settleFromResponse(request, xiorResponse, resolve, reject);
      } catch (err) {
        // Defensive: none of the calls above are expected to throw for a well-formed XHR
        // response in practice, but per the comment above, an uncaught throw here would hang
        // the promise forever rather than failing loudly - not worth forcing a contrived
        // failure just to cover this line.
        /* istanbul ignore next */
        reject(isErrorLike(err) ? err : new Error(String(err)));
      }
    };

    xhr.onerror = () => reject(buildNetworkError(request, new Error('Network Error')));
    // ontimeout can only fire if xhr.timeout was set above, which only happens when
    // request.timeout was already truthy - so it's guaranteed non-null here.
    xhr.ontimeout = () => reject(buildTimeoutError(request, request.timeout!));
    xhr.onabort = () => reject(buildAbortError(request));

    if (request.signal) {
      if (request.signal.aborted) {
        reject(buildAbortError(request));
        return;
      }
      request.signal.addEventListener('abort', () => xhr.abort());
    }

    // No undefined/null check needed: the plugin already passes through requests with no data
    // (see upload-progress-plugin.ts), and assertSupportedBody rejects an explicit null/undefined
    // before this function is ever called - so `data` is always a real, supported body here.
    xhr.send(data as XMLHttpRequestBodyInit);
  });
}
