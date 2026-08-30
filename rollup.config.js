const dts = require('rollup-plugin-dts').default;

module.exports = [
  // Main bundle
  {
    input: './dist/esm/index.d.ts',
    output: {
      file: './dist/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
    external: ['xior'], // Mark xior as external for better tree-shaking
  },
  // Upload-progress subpath bundle (@reggieofarrell/http-client/upload-progress) - a separate
  // opt-in entry point so its transport code never ends up in a consumer's bundle unless they
  // explicitly import it. See src/upload-progress.ts.
  {
    input: './dist/esm/upload-progress.d.ts',
    output: {
      file: './dist/upload-progress.d.ts',
      format: 'es',
    },
    plugins: [dts()],
    external: ['xior'],
  },
  // Browser-bundler variant of the upload-progress subpath, resolved instead of the above via
  // package.json's "browser" export condition - see src/upload-progress.browser.ts.
  {
    input: './dist/esm/upload-progress.browser.d.ts',
    output: {
      file: './dist/upload-progress.browser.d.ts',
      format: 'es',
    },
    plugins: [dts()],
    external: ['xior'],
  },
];
