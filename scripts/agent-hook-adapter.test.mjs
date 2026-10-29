import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

/**
 * Run the consumer entry point from another directory with an explicit stdin event.
 * @param {object|string} input Native hook event or deliberately malformed JSON.
 * @returns {import("node:child_process").SpawnSyncReturns<string>} Actual process evidence.
 */
function runHook(input) {
  return spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, 'agent-hooks/scan-edited-file.mjs')],
    {
      cwd: tmpdir(),
      input: typeof input === 'string' ? input : JSON.stringify(input),
      encoding: 'utf8',
    }
  );
}

/** Preserve advisory diagnostics instead of failing every subsequent host edit. */
test('handles malformed input and read-only events through the installed CLI', () => {
  const malformed = runHook('{broken');
  assert.equal(malformed.status, 0);
  assert.match(malformed.stdout, /unavailable \(advisory\)/);
  const read = runHook({
    tool_name: 'Read',
    tool_input: { file_path: 'package.json' },
  });
  assert.equal(read.status, 0);
  assert.match(read.stdout, /no-files \(advisory\)/);
});

/** Exercise actual local Prettier resolution and project-root ownership. */
test('formats only an actual edit when invoked outside the repository', () => {
  const directory = mkdtempSync(resolve(import.meta.dirname, '../.agent-hook-fixture-'));
  const file = join(directory, 'example.mjs');
  try {
    const unformatted = "export const value={message:'example'};\n";
    writeFileSync(file, unformatted);
    assert.equal(runHook({ tool_name: 'Read', tool_input: { path: file } }).status, 0);
    assert.equal(readFileSync(file, 'utf8'), unformatted);
    const result = runHook({
      tool_name: 'Write',
      tool_input: { file_path: file },
    });
    assert.equal(result.status, 0);
    assert.equal(readFileSync(file, 'utf8'), "export const value = { message: 'example' };\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
