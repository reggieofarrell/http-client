/**
 * Real (non-simulated) upload progress for HttpClient - browser-bundler variant.
 *
 * Resolved instead of `upload-progress.ts` when a bundler applies package.json's `"browser"`
 * export condition (Webpack 5, Vite/Rollup, esbuild, Parcel all do this by default for a browser
 * target) - see `src/transports/upload-progress-plugin.browser.ts`'s module doc for why this split
 * exists. Same usage and contract as the universal entry point; see the README's "Upload Progress"
 * section.
 */
export { createUploadProgressPlugin } from './transports/upload-progress-plugin.browser.js';
export type { UploadProgressEvent } from './transports/upload-progress-plugin.browser.js';
