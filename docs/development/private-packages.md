# Private Casadega package access

## Why authentication is required

The development toolchain consumes `@casadega-development/ts-repo-tooling` from GitHub Packages.
It centralizes SonarQube commands, ESLint and formatting composition, TypeScript safeguards,
package-policy checks, and shared RuleSync rules and skills. The published
`@reggieofarrell/http-client` package does not include or require this private package at runtime.

The committed `.npmrc` maps the Casadega scope to GitHub Packages without storing a credential.
Local credentials belong in a developer-controlled store; CI credentials belong in GitHub Actions
secrets.

## Token requirements

Use a classic GitHub personal access token with `read:packages`. The GitHub identity that owns the
token must be able to access the private package. Authorize the token for Casadega Development if
the organization requires SAML single sign-on.

Never commit a package token, put it in an environment file, pass it as a command-line argument, or
print it in a build log. Do not reuse npm-publishing, SonarQube, or application credentials.

## User-level npm configuration

The simplest setup stores the host-scoped GitHub token in `~/.npmrc`. Authenticate interactively so
the token does not enter shell history:

```bash
npm login \
  --scope=@casadega-development \
  --auth-type=legacy \
  --registry=https://npm.pkg.github.com
chmod 600 ~/.npmrc
```

Use the GitHub username as the username and the classic token as the password. Ordinary dependency
installation can then read the user-level credential:

```bash
npm install
```

RuleSync's npm-source transport deliberately requires an explicit environment value. Read the same
token interactively for the one command and remove it immediately afterward:

```bash
read -rs NODE_AUTH_TOKEN
export NODE_AUTH_TOKEN
printf '\n'
npm run rules:sync
unset NODE_AUTH_TOKEN
```

## macOS Keychain wrapper

The preferred macOS option stores the token in the login Keychain and injects it only into npm child
processes. Add or update the item; the final value-less `-w` prompts securely:

```bash
security add-generic-password \
  -U \
  -a "YOUR_GITHUB_USERNAME" \
  -s "casadega-github-packages" \
  -l "Casadega GitHub Packages read token" \
  -w
```

Add this convenience function to `~/.zshrc`, not `.zshenv`:

```bash
casadega-npm() {
  local package_token

  package_token="$(
    security find-generic-password \
      -s "casadega-github-packages" \
      -w
  )" || return 1

  NODE_AUTH_TOKEN="${package_token}" npm "$@"
}
```

Use the wrapper for dependency and shared-policy operations:

```bash
casadega-npm install
casadega-npm run rules:install
casadega-npm run rules:sync
```

The function-local value disappears after npm exits and is not inherited by unrelated programs.

## GitHub Actions

This personal repository is outside `Casadega-Development`, so define a repository Actions secret
named `CASADEGA_PACKAGES_TOKEN`. Store a read-only classic token whose GitHub identity can access
the package. Workflows map that purpose-specific secret to npm's conventional `NODE_AUTH_TOKEN`
only during dependency installation, RuleSync restoration, and shared reusable-workflow calls.

The private development dependency means untrusted fork CI cannot install the complete toolchain;
supporting external contributors is intentionally outside this repository's requirements.

## Updating shared tooling

Keep these identities synchronized in one reviewed change:

1. the exact `devDependency` and `package-lock.json` version;
2. the exact `ref` in `rulesync.jsonc`;
3. `rulesync-npm.lock.json` and generated agent configuration.

Run `npm run rules:sync` with package credentials after updating the release, then run
`npm run release:verify`. Never edit `.rulesync/**/.curated/` or generated agent files.
