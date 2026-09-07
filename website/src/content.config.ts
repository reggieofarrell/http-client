/**
 * Astro content collections for the Starlight docs site.
 *
 * - `docs`: Starlight pages under src/content/docs (current docs stream).
 */
import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema(),
  }),
};
