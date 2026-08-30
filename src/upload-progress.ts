/**
 * Real (non-simulated) upload progress for HttpClient - a separate, opt-in entry point.
 *
 * Native fetch() cannot report real upload progress in either the browser or Node, so this
 * bypasses fetch (and xior) entirely for requests that opt in via `realUploadProgress`, using
 * XMLHttpRequest in the browser and Node's http/https modules directly. It lives in its own
 * subpath specifically so consumers who never touch this feature never pull either transport
 * into their bundle - `HttpClient` and the main package entry point never import this module.
 *
 * Usage:
 *   import { HttpClient } from '@reggieofarrell/http-client';
 *   import { createUploadProgressPlugin } from '@reggieofarrell/http-client/upload-progress';
 *
 *   const client = new HttpClient({
 *     baseURL: 'https://api.example.com',
 *     uploadProgressPlugin: createUploadProgressPlugin(),
 *   });
 *
 *   await client.post('/upload', fileBuffer, {
 *     headers: { 'Content-Type': 'application/octet-stream' },
 *     realUploadProgress: (event) => console.log(`${event.progress}%`),
 *   });
 *
 * See the README's "Upload Progress" section for the full documented contract and limitations.
 *
 * This file is the universal variant (both transports, runtime-detected) - resolved for plain
 * Node/unbundled usage, or any bundler that doesn't apply package.json's `"browser"` export
 * condition. A browser bundler that does apply it (Webpack 5, Vite/Rollup, esbuild, Parcel all do
 * by default) resolves this same import specifier to `upload-progress.browser.ts` instead, which
 * never statically imports the Node transport at all - see that file's module doc for why this
 * split exists (a real, confirmed bug: bundling this universal file for a browser target fails
 * outright with unresolvable `node:*` import errors).
 */
export { createUploadProgressPlugin } from './transports/upload-progress-plugin.js';
export type { UploadProgressEvent } from './transports/upload-progress-plugin.js';
