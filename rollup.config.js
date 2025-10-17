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
  // Codegen bundle
  {
    input: './dist/esm/codegen/index.d.ts',
    output: {
      file: './dist/codegen/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
    external: ['openapi-typescript', 'openapi-types'], // Mark codegen deps as external
  },
];
