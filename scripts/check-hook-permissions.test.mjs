import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  collectCommands,
  resolveBarePathTarget,
  checkHookPermissions,
} from './check-hook-permissions.mjs';

test('resolveBarePathTarget strips a plain relative path', () => {
  assert.equal(
    resolveBarePathTarget('./scripts/agent-hooks/scan-edited-file.mjs'),
    'scripts/agent-hooks/scan-edited-file.mjs'
  );
});

test('resolveBarePathTarget strips a quoted project-directory variable', () => {
  assert.equal(
    resolveBarePathTarget('"$CLAUDE_PROJECT_DIR"/scripts/agent-hooks/scan-edited-file.mjs'),
    'scripts/agent-hooks/scan-edited-file.mjs'
  );
});

test('resolveBarePathTarget strips an unquoted project-directory variable', () => {
  assert.equal(
    resolveBarePathTarget('$CLAUDE_PROJECT_DIR/scripts/agent-hooks/scan-edited-file.mjs'),
    'scripts/agent-hooks/scan-edited-file.mjs'
  );
});

test('resolveBarePathTarget returns null for an interpreter-prefixed command', () => {
  assert.equal(resolveBarePathTarget('node ./scripts/agent-hooks/scan-edited-file.mjs'), null);
  assert.equal(
    resolveBarePathTarget('node "$CLAUDE_PROJECT_DIR"/scripts/agent-hooks/scan-edited-file.mjs'),
    null
  );
});

test('resolveBarePathTarget returns null for a command that is not a local script reference', () => {
  assert.equal(resolveBarePathTarget('npx eslint --fix'), null);
});

test('collectCommands finds every "command" key at any depth', () => {
  const config = {
    hooks: {
      PostToolUse: [
        { hooks: [{ type: 'command', command: './a.mjs' }] },
        { hooks: [{ type: 'command', command: 'node ./b.mjs' }] },
      ],
    },
  };
  assert.deepEqual(collectCommands(config), ['./a.mjs', 'node ./b.mjs']);
});

test('collectCommands returns an empty array for a config with no commands', () => {
  assert.deepEqual(collectCommands({ hooks: {} }), []);
});

test('checkHookPermissions reports a bare-path script that lost its executable bit', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'hook-permissions-'));
  try {
    writeFileSync(join(repoRoot, 'script.mjs'), '#!/usr/bin/env node\n');
    chmodSync(join(repoRoot, 'script.mjs'), 0o644);
    writeFileSync(
      join(repoRoot, 'settings.json'),
      JSON.stringify({ hooks: { PostToolUse: [{ command: './script.mjs' }] } })
    );

    const violations = checkHookPermissions(repoRoot, ['settings.json']);

    assert.equal(violations.length, 1);
    assert.match(violations[0], /script\.mjs.*not executable/);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('checkHookPermissions passes a bare-path script that is executable', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'hook-permissions-'));
  try {
    writeFileSync(join(repoRoot, 'script.mjs'), '#!/usr/bin/env node\n');
    chmodSync(join(repoRoot, 'script.mjs'), 0o755);
    writeFileSync(
      join(repoRoot, 'settings.json'),
      JSON.stringify({ hooks: { PostToolUse: [{ command: './script.mjs' }] } })
    );

    assert.deepEqual(checkHookPermissions(repoRoot, ['settings.json']), []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('checkHookPermissions ignores an interpreter-prefixed command regardless of its own bit', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'hook-permissions-'));
  try {
    writeFileSync(join(repoRoot, 'script.mjs'), '#!/usr/bin/env node\n');
    chmodSync(join(repoRoot, 'script.mjs'), 0o644);
    writeFileSync(
      join(repoRoot, 'settings.json'),
      JSON.stringify({ hooks: { PostToolUse: [{ command: 'node ./script.mjs' }] } })
    );

    assert.deepEqual(checkHookPermissions(repoRoot, ['settings.json']), []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('checkHookPermissions reports a bare-path command whose target does not exist', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'hook-permissions-'));
  try {
    writeFileSync(
      join(repoRoot, 'settings.json'),
      JSON.stringify({ hooks: { PostToolUse: [{ command: './missing.mjs' }] } })
    );

    const violations = checkHookPermissions(repoRoot, ['settings.json']);

    assert.equal(violations.length, 1);
    assert.match(violations[0], /doesn't exist/);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('checkHookPermissions skips a config file that does not exist', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'hook-permissions-'));
  try {
    assert.deepEqual(checkHookPermissions(repoRoot, ['nonexistent.json']), []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
