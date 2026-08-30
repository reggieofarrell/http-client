#!/usr/bin/env sh
#
# Verify Node.js major version matches .nvmrc (used by Husky hooks).
#
# Intended to be *sourced* from hooks so that `nvm use` updates PATH in the
# same shell that later runs `npm`/`npx`. Executing as a subprocess would check
# the version but would not leave the correct Node on PATH for the rest of the hook.
#
# Husky 9 runs hooks with `sh -e`, so this file stays POSIX sh (no bash-only
# features). Callers should set REPO_ROOT before sourcing; when unset we fall
# back to resolving from $0 (works for both "sourced from .husky/*" and
# "executed as scripts/check-node-version.sh").

if [ -z "${REPO_ROOT:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
export REPO_ROOT

echo "Checking Node.js version..."

REQUIRED_NODE_VERSION=""

# Primary pin: .nvmrc (same file CI uses via node-version-file).
if [ -f "$REPO_ROOT/.nvmrc" ]; then
  REQUIRED_NODE_VERSION=$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc" | cut -d'.' -f1)
fi

if [ -z "$REQUIRED_NODE_VERSION" ]; then
  echo "Error: Could not determine required Node.js version from .nvmrc."
  exit 1
fi

# Load nvm in this shell when present so GUI/git clients and non-login shells
# still resolve the repo's Node before npm/npx run. Must be sourced (not
# executed) for the PATH change to persist for the rest of the hook.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  if command -v nvm >/dev/null 2>&1 || type nvm >/dev/null 2>&1; then
    NVMRC_VERSION=$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc" 2>/dev/null || true)
    if [ -n "$NVMRC_VERSION" ]; then
      nvm use "$NVMRC_VERSION" >/dev/null 2>&1 || nvm use "$REQUIRED_NODE_VERSION" >/dev/null 2>&1
    else
      nvm use "$REQUIRED_NODE_VERSION" >/dev/null 2>&1
    fi
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not available on PATH after version setup."
  echo "  Install Node v$REQUIRED_NODE_VERSION.x (see .nvmrc) or ensure nvm is installed."
  exit 1
fi

CURRENT_NODE_VERSION=$(node -v | sed 's/v//' | cut -d'.' -f1)
CURRENT_NODE_FULL=$(node -v)

if [ "$CURRENT_NODE_VERSION" -ne "$REQUIRED_NODE_VERSION" ]; then
  echo "Error: Node.js version mismatch."
  echo "  Required: v$REQUIRED_NODE_VERSION.x"
  echo "  Current:  $CURRENT_NODE_FULL"
  exit 1
fi

echo "Node.js version check passed: $CURRENT_NODE_FULL (required: v$REQUIRED_NODE_VERSION.x)"

# `.npmrc` `min-release-age` is silently ignored on npm < 11.10 (no error, no
# cooldown). Fail here if PATH has an older client so a hook cannot resolve a
# package version that CI would have blocked.
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not available on PATH after Node version setup."
  exit 1
fi

NPM_VERSION=$(npm -v)
NPM_MAJOR=$(echo "$NPM_VERSION" | cut -d. -f1)
NPM_MINOR=$(echo "$NPM_VERSION" | cut -d. -f2)

if [ "$NPM_MAJOR" -lt 11 ] || { [ "$NPM_MAJOR" -eq 11 ] && [ "$NPM_MINOR" -lt 10 ]; }; then
  echo "Error: npm $NPM_VERSION is too old for .npmrc min-release-age (needs >= 11.10.0)."
  echo "  Use the Node toolchain pinned in .nvmrc so installs honor the publish cooldown."
  exit 1
fi

echo "npm version check passed: $NPM_VERSION (min-release-age requires >= 11.10.0)"
