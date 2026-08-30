import type { XiorPlugin, XiorRequestConfig } from 'xior';
import { shouldHandleProgressRequest } from './shared.js';
import { performBrowserUploadRequest } from './browser-transport.js';

export type { UploadProgressEvent } from './shared.js';

/**
 * Browser-only variant of the upload-progress plugin factory - statically imports **only**
 * `browser-transport.ts`, never `node-transport.ts`, so a browser bundler that resolves this file
 * (via the `"browser"` condition in `package.json`'s `exports` map, which every major bundler -
 * Webpack 5, Vite/Rollup, esbuild, Parcel - applies by default for a browser target) never has to
 * resolve `node:http`/`node:https`/`node:stream` at all.
 *
 * This is the fix for a real, confirmed bug in the original design: `upload-progress-plugin.ts`
 * (the universal, runtime-detecting variant used for plain Node/unbundled consumers) statically
 * imports both transports, and bundling *that* file for a browser target fails outright - verified
 * directly with a real esbuild `--platform=browser` bundle, which produced four unresolvable
 * `node:*` import errors. A separate export condition is what actually solves this: a runtime
 * `typeof XMLHttpRequest` check inside a single shared file does not, since a bundler must still be
 * able to resolve every static import in a file regardless of which runtime branch actually runs.
 *
 * No Node-runtime fallback exists here on purpose - a consumer whose bundler picked this file has
 * already committed to a browser target, so there's no legitimate case where the Node transport
 * would be reachable anyway.
 */
export function createUploadProgressPlugin(): XiorPlugin {
  return adapter => (request: XiorRequestConfig) => {
    if (!shouldHandleProgressRequest(request)) {
      // Not covered by a test in this repo's jsdom environment: this falls through to xior's
      // real fetch-based adapter, and undici's fetch doesn't work inside this bundled jsdom's
      // sandbox regardless of HTTP method (confirmed directly - see the test file's module doc).
      // `shouldHandleProgressRequest()` itself is shared, untouched code already exercised by the
      // universal variant's own passthrough test (Node integration test file), so this specific
      // line is the only thing left uncovered here, not the logic it guards.
      /* istanbul ignore next */
      return adapter(request);
    }

    return performBrowserUploadRequest(request);
  };
}
