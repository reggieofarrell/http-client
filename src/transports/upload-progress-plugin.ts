import type { XiorPlugin, XiorRequestConfig } from 'xior';
import { shouldHandleProgressRequest } from './shared.js';
import { performNodeUploadRequest } from './node-transport.js';
import { performBrowserUploadRequest } from './browser-transport.js';

export type { UploadProgressEvent } from './shared.js';

function hasNodeRuntime(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node;
}

function hasBrowserRuntime(): boolean {
  return typeof XMLHttpRequest !== 'undefined';
}

/**
 * Creates the internal xior plugin that powers real (non-simulated) upload progress, for
 * consumers whose bundler/runtime resolution doesn't distinguish browser vs. Node (plain Node,
 * unbundled usage, or a bundler that doesn't apply the `"browser"` package.json export
 * condition). Statically imports **both** transports and picks one at runtime.
 *
 * A browser bundler that *does* apply the `"browser"` condition resolves
 * `@reggieofarrell/http-client/upload-progress` to `upload-progress.browser.ts` instead (see its
 * module doc) specifically so it never has to resolve this file's Node-only imports
 * (`node:http`/`node:https`/`node:stream`) at all - confirmed empirically that a browser bundle of
 * *this* file fails outright otherwise (4 unresolvable `node:*` import errors), which is exactly
 * why the split exists.
 *
 * Only ever registered by `HttpClient`'s own constructor when a consumer explicitly supplies it
 * via `HttpClientOptions.uploadProgressPlugin` - registered before the conditional retry plugin so
 * `retryConfig` composes correctly with progress-tracked uploads (each retry attempt re-invokes
 * this plugin, and therefore the real transport, from scratch).
 *
 * For any request that doesn't set `realUploadProgress` (or has no body to track), this is a
 * pure passthrough - one property check plus one function call.
 */
export function createUploadProgressPlugin(): XiorPlugin {
  return adapter => (request: XiorRequestConfig) => {
    if (!shouldHandleProgressRequest(request)) {
      return adapter(request);
    }

    if (hasBrowserRuntime()) {
      return performBrowserUploadRequest(request);
    }

    if (hasNodeRuntime()) {
      return performNodeUploadRequest(request);
    }

    // Neither runtime detected (an exotic environment) - fail open rather than break the
    // request just because real progress can't be measured here. Not realistically coverable by
    // a test: every real Jest environment this project tests against has either `XMLHttpRequest`
    // (jsdom) or `process.versions.node` (node) - hitting this would require faking the absence
    // of both, which isn't a real condition worth mocking around.
    /* istanbul ignore next */
    return adapter(request);
  };
}
