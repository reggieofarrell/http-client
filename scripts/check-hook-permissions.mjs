#!/usr/bin/env node

/**
 * Verifies that every local script a generated agent-hook config invokes by bare path (no
 * interpreter in front of it) is actually executable on disk.
 *
 * Checks the GENERATED hook configs (.claude/settings.json, .cursor/hooks.json,
 * .codex/hooks.json) rather than parsing the JSONC source (.rulesync/hooks.jsonc) directly -
 * `npm run rules:check` already guarantees these stay in sync with that source, so checking the
 * plain-JSON output is equivalent and needs no JSONC parser.
 *
 * This exists because the executable bit is invisible to almost every other safeguard: it never
 * shows up in a normal content diff, PR review rarely notices a mode-only change,
 * `git config core.fileMode false` (common on Windows and some CI images) stops tracking local
 * mode changes entirely, and a tool that recreates the file (an editor, a Write-style edit)
 * defaults to non-executable. A hook invoked this way can lose its executable bit and silently
 * stop running with no error visible anywhere but a debug log - see
 * scripts/agent-hooks/scan-edited-file.mjs's own history.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK_CONFIG_FILES = ['.claude/settings.json', '.cursor/hooks.json', '.codex/hooks.json'];

// Interpreter-invoked commands don't depend on the target file's own executable bit at all.
const INTERPRETERS = new Set(['node', 'bash', 'sh', 'zsh', 'python', 'python3']);

/**
 * Recursively collects every string value found under a "command" key, regardless of how deeply
 * nested it is in a given tool's hook config shape.
 *
 * @param {unknown} value Parsed hook config (or a fragment of one).
 * @param {string[]} [commands] Accumulator.
 * @returns {string[]} Every command string found.
 */
export function collectCommands(value, commands = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectCommands(item, commands);
  } else if (value && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      if (key === 'command' && typeof val === 'string') {
        commands.push(val);
      } else {
        collectCommands(val, commands);
      }
    }
  }
  return commands;
}

/**
 * Resolves a hook command to the repo-relative path of the local script it invokes by bare path,
 * or `null` if the command already names an interpreter (so the file's own permission bit is
 * irrelevant) or doesn't look like a local script reference at all.
 *
 * @param {string} command Raw `command` value from a generated hook config.
 * @returns {string | null} Repo-relative script path, or `null` if not applicable.
 */
export function resolveBarePathTarget(command) {
  const firstToken = command.trim().split(/\s+/)[0];
  if (INTERPRETERS.has(firstToken)) {
    return null;
  }

  // Strip a leading project-directory variable ("$CLAUDE_PROJECT_DIR"/... or
  // $CLAUDE_PROJECT_DIR/...) - it always resolves to the repo root, so the rest is already
  // repo-relative.
  const withoutVar = command.replace(/^"?\$[A-Z_]+"?\//, '');

  if (!withoutVar.startsWith('./') && !withoutVar.startsWith('scripts/')) {
    return null;
  }

  return withoutVar.replace(/^\.\//, '');
}

/**
 * Checks every bare-path hook command in the given generated configs for a missing executable
 * bit or a missing target file.
 *
 * @param {string} repoRoot Absolute path to the repository root.
 * @param {string[]} [configFiles] Repo-relative hook config paths to check.
 * @returns {string[]} Human-readable violation messages; empty if everything checks out.
 */
export function checkHookPermissions(repoRoot, configFiles = HOOK_CONFIG_FILES) {
  const violations = [];

  for (const configFile of configFiles) {
    const fullPath = join(repoRoot, configFile);
    if (!existsSync(fullPath)) continue;

    const config = JSON.parse(readFileSync(fullPath, 'utf8'));

    for (const command of collectCommands(config)) {
      const targetPath = resolveBarePathTarget(command);
      if (!targetPath) continue;

      const absoluteTargetPath = join(repoRoot, targetPath);
      if (!existsSync(absoluteTargetPath)) {
        violations.push(
          `${configFile}: "${command}" references a script that doesn't exist: ${targetPath}`
        );
        continue;
      }

      const isExecutable = (statSync(absoluteTargetPath).mode & 0o111) !== 0;
      if (!isExecutable) {
        violations.push(
          `${configFile}: "${targetPath}" is invoked directly by path (no interpreter) but is ` +
            `not executable. Run: chmod +x ${targetPath}`
        );
      }
    }
  }

  return violations;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const violations = checkHookPermissions(repoRoot);

  if (violations.length > 0) {
    console.error('❌ Hook permission check failed:');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    console.error(
      '\nA hook command invoked by bare path (no node/bash/python in front of it) silently fails ' +
        'with "Permission denied" if the target script loses its executable bit - and nothing ' +
        'else catches this, since it never shows up in a normal content diff. See ' +
        '.rulesync/hooks.jsonc.'
    );
    process.exit(1);
  }

  console.log('✅ Hook permission check passed');
}
