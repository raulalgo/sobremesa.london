import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * The issue archive, mirrored from designsobremesa.substack.com by
 * `scripts/scrape-substack.mjs`. Everything here is *what Substack published* —
 * the site's own presentation choices (binding colour, blend mode, display
 * face) live in src/data/bindings.ts, keyed by issue number, so a re-scrape
 * can never clobber them. Covers are local files in src/assets/covers/, not
 * the Substack CDN, so no cover URL is stored here.
 */
const issues = defineCollection({
  loader: glob({ base: "./src/content/issues", pattern: "**/*.md" }),
  schema: z.object({
    /** Zero-padded, so "007" sorts next to "029". Also the display number. */
    number: z.string().regex(/^\d{3}$/),
    title: z.string(),
    subtitle: z.string().optional(),
    date: z.string(),
    /** Substack slug — the id under /p/ on the newsletter. */
    slug: z.string(),
    url: z.string().url(),
    wordcount: z.number().optional(),
  }),
});

export const collections = { issues };
