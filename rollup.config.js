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
];
