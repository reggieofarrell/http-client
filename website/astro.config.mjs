// @ts-check
/**
 * Astro + Starlight config for the HTTP client usage docs site.
 *
 * Deployed to GitHub Pages at https://reggieofarrell.github.io/http-client/
 */
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeNova from 'starlight-theme-nova';

export default defineConfig({
  // GitHub Pages project sites are served from the repository slug.
  site: 'https://reggieofarrell.github.io',
  base: '/http-client',
  integrations: [
    starlight({
      title: 'HTTP Client',
      description:
        'A lightweight fetch-based HTTP client for Node and browser with retry, idempotency, and extensible hooks.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/reggieofarrell/http-client',
        },
      ],
      components: {
        // Keep Nova's documentation palette fixed to dark and omit its theme toggle.
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/NoThemeSelect.astro',
      },
      plugins: [starlightThemeNova()],
      sidebar: [
        {
          label: 'Getting started',
          items: [{ label: 'Getting started', slug: 'getting-started' }],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Documentation overview', slug: 'overview' },
            { label: 'Configuration', slug: 'usage/configuration' },
            { label: 'Request methods', slug: 'usage/request-methods' },
            { label: 'Timeouts', slug: 'usage/timeouts' },
            { label: 'Retries', slug: 'usage/retries' },
            { label: 'Idempotency', slug: 'usage/idempotency' },
            { label: 'Upload progress', slug: 'usage/upload-progress' },
            { label: 'Plugins and Xior integration', slug: 'usage/plugins' },
            { label: 'Middleware hooks', slug: 'usage/middleware' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Error handling', slug: 'reference/error-handling' },
            { label: 'Breaking changes', slug: 'reference/breaking-changes' },
            { label: 'License', slug: 'reference/license' },
          ],
        },
      ],
    }),
  ],
});
