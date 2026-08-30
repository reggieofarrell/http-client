/**
 * Finalizes the ESM half of the dual ESM/CJS build.
 *
 * The package root has no `"type"` field, so Node defaults to CommonJS. `dist/esm/*.js` contains
 * native `export {...} from '...'` syntax, so without a marker Node prints a
 * `MODULE_TYPELESS_PACKAGE_JSON` warning (and pays a reparse cost) for every ESM consumer. Drop a
 * `{ "type": "module" }` marker into dist/esm/ so those files load as ESM regardless of the root's
 * default. (Mirrors the same problem in reverse: a project whose root is `"type": "module"` needs
 * the opposite marker in its CJS output directory.)
 */
import { writeFileSync } from 'node:fs';

const marker = JSON.stringify({ type: 'module' }, null, 2) + '\n';
writeFileSync(new URL('../dist/esm/package.json', import.meta.url), marker);

console.log('finalize-esm-build: wrote dist/esm/package.json ({ "type": "module" })');
