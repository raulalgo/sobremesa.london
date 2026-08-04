/**
 * Mirrors the Design Sobremesa Substack archive into src/content/issues/*.md.
 *
 *   node scripts/scrape-substack.mjs [--force] [--only=029,028]
 *
 * Substack has no public "give me every post with its body" endpoint:
 *   - /api/v1/archive returns metadata only (body_html is null), and on this
 *     publication it silently stops at issue 007 — the first seven issues are
 *     missing from it entirely.
 *   - /api/v1/posts/by-slug/<slug> 302s to the human page.
 * The sitemap, however, lists all 30 issues, and every post page ships the full
 * post record (body_html included) in a `window._preloads = JSON.parse("…")`
 * blob. So: sitemap for the index, page scrape for the body.
 *
 * Existing files are left alone unless --force is passed, so hand-edits to the
 * markdown survive a re-run.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TurndownService from "turndown";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUT_DIR = path.join(ROOT, "src/content/issues");
const PUBLICATION = "https://designsobremesa.substack.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) sobremesa.london archive mirror";

const force = process.argv.includes("--force");
const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* ------------------------------------------------------------------ fetch */

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.text();
      // 429s are the only failure worth waiting on; the rest are terminal.
      if (res.status !== 429) throw new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      if (attempt === 3) throw err;
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

/** Every /p/ URL in the sitemap, in publication order. */
async function listSlugs() {
  const xml = await get(`${PUBLICATION}/sitemap.xml`);
  const slugs = [...xml.matchAll(/<loc>https:\/\/[^<]*\/p\/([^<]+)<\/loc>/g)].map((m) => m[1]);
  return [...new Set(slugs)];
}

/**
 * The post record embedded in the page. `window._preloads` is a JSON *string*
 * literal fed to JSON.parse, so it is double-encoded: parsing the literal
 * yields the JSON text, parsing that yields the object.
 */
function extractPost(html) {
  const start = html.indexOf("window._preloads");
  if (start === -1) throw new Error("no window._preloads on page");
  const open = html.indexOf('"', start);
  if (open === -1) throw new Error("malformed _preloads");

  let i = open + 1;
  for (; i < html.length; i++) {
    if (html[i] === "\\") i++;
    else if (html[i] === '"') break;
  }
  const preloads = JSON.parse(JSON.parse(html.slice(open, i + 1)));
  const post = preloads.post ?? preloads.pub?.post;
  if (!post?.body_html) throw new Error("no body_html in _preloads");
  return post;
}

/* --------------------------------------------------------------- markdown */

/**
 * An @mention is an *empty* <span class="mention-wrap"> whose only content is
 * the person's name, HTML-escaped inside a data-attrs JSON blob. Left alone the
 * sentence loses its subject ("I related a lot to 's substack"), so pull the
 * name back out.
 */
function mentionName(node) {
  if (!(node.getAttribute?.("class") ?? "").includes("mention-wrap")) return null;
  try {
    const attrs = JSON.parse(node.getAttribute("data-attrs"));
    if (!attrs?.name) return null;
    return attrs.url ? `[${attrs.name}](${attrs.url})` : attrs.name;
  } catch {
    return null;
  }
}

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",

  // Mention spans hold their text in an attribute, so turndown sees them as
  // blank and hands them to this rule *before* any custom rule can match.
  // Everything else keeps turndown's stock blank behaviour.
  blankReplacement: (_content, node) =>
    mentionName(node) ?? (node.isBlock ? "\n\n" : ""),
});

// Subscribe boxes, share buttons, paywall stubs and the like are page
// furniture, not writing — they must not end up in the archive.
turndown.remove([
  "style",
  "script",
  "form",
  "button",
]);
turndown.addRule("substackFurniture", {
  filter: (node) =>
    /subscription-widget|button-wrapper|paywall|poll-embed|footer|digest-post-embed|native-video|subscribe-widget|captioned-button/.test(
      node.getAttribute?.("class") ?? "",
    ),
  replacement: () => "",
});

// Mentions that *do* carry visible text never reach blankReplacement.
turndown.addRule("substackMention", {
  filter: (node) => mentionName(node) !== null,
  replacement: (_content, node) => mentionName(node),
});

/**
 * Substack wraps every image in <a href="…cdn…"><img …></a> inside a
 * <figure>. Flatten it to a plain image (plus caption as an emphasised line)
 * so the markdown does not carry a link to the CDN on every picture.
 */
turndown.addRule("captionedImage", {
  filter: (node) => node.nodeName === "FIGURE",
  replacement: (_content, node) => {
    const img = node.querySelector?.("img");
    const src = img?.getAttribute("src") ?? node.querySelector?.("a")?.getAttribute("href");
    if (!src) return "";
    const alt = (img?.getAttribute("alt") ?? "").replace(/\n/g, " ").trim();
    const caption = node.querySelector?.("figcaption")?.textContent?.trim() ?? "";
    return `\n\n![${alt}](${src})${caption ? `\n_${caption}_` : ""}\n\n`;
  },
});

/* ----------------------------------------------------------------- output */

/** "029 — Summer letters" / "Design Sobremesa #0 — New Year, New Life" → parts. */
function splitTitle(rawTitle, slug) {
  const title = rawTitle.replace(/\s+/g, " ").trim();

  // Normal form: a three-digit number, then any dash, then the real title.
  const numbered = title.match(/^(\d{1,3})\s*[-–—:.]\s*(.+)$/);
  if (numbered) return { number: numbered[1].padStart(3, "0"), title: numbered[2].trim() };

  // Issue 000 shipped before the numbering convention settled.
  const hashed = title.match(/#(\d+)\s*[-–—:.]\s*(.+)$/);
  if (hashed) return { number: hashed[1].padStart(3, "0"), title: hashed[2].trim() };

  // Fall back to the slug ("002" is only inferable from the archive index).
  const fromSlug = slug.match(/^(\d{3})-/);
  return { number: fromSlug ? fromSlug[1] : null, title };
}

/**
 * The underlying S3 filename of a Substack CDN URL. The cover and the copy of
 * it at the top of the body go through different transforms, so only the tail
 * of the encoded origin URL is comparable between the two.
 */
function coverKey(url) {
  return url?.match(/images%2F([\w-]+)/)?.[1] ?? null;
}

const yaml = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function frontmatter(fields) {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "number" ? v : yaml(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

/* ------------------------------------------------------------------- main */

// Slugs the sitemap lists that are not issues.
const SKIP = new Set(["coming-soon"]);

// 002 predates the numbered-slug convention and its title carries no number.
const NUMBER_OVERRIDES = {
  "designing-from-the-plateau": "002",
  "design-sobremesa-0-new-year-new-life": "000",
};

await mkdir(OUT_DIR, { recursive: true });

const slugs = (await listSlugs()).filter((s) => !SKIP.has(s));
const existing = new Set(existsSync(OUT_DIR) ? await readdir(OUT_DIR) : []);

const written = [];
const skipped = [];
const failed = [];

for (const slug of slugs) {
  if (only && !only.some((o) => slug.includes(o))) continue;

  try {
    const html = await get(`${PUBLICATION}/p/${slug}`);
    const post = extractPost(html);

    const { number, title } = splitTitle(post.title, slug);
    const issue = NUMBER_OVERRIDES[slug] ?? number;
    if (!issue) throw new Error(`could not determine issue number from "${post.title}"`);

    const file = `${issue}-${slug.replace(/^\d{3}-/, "")}.md`;
    if (existing.has(file) && !force) {
      skipped.push(file);
      continue;
    }

    const body = turndown
      .turndown(post.body_html)
      .replace(/\n{3,}/g, "\n\n")
      // Substack repeats the cover as the first image of the body. The site
      // renders covers from src/assets/covers/, so the CDN copy is dropped.
      .replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*/, (m) =>
        coverKey(post.cover_image) && m.includes(coverKey(post.cover_image)) ? "" : m,
      )
      .trim();

    const md =
      frontmatter({
        number: issue,
        title,
        subtitle: (post.subtitle ?? "").replace(/\s+/g, " ").trim(),
        date: post.post_date.slice(0, 10),
        slug,
        url: post.canonical_url ?? `${PUBLICATION}/p/${slug}`,
        wordcount: post.wordcount ?? 0,
      }) + `\n${body}\n`;

    await writeFile(path.join(OUT_DIR, file), md, "utf8");
    written.push(file);
    process.stdout.write(`✓ ${file}\n`);
  } catch (err) {
    failed.push(`${slug}: ${err.message}`);
    process.stdout.write(`✗ ${slug} — ${err.message}\n`);
  }

  await new Promise((r) => setTimeout(r, 400)); // be polite
}

console.log(
  `\n${written.length} written, ${skipped.length} kept (already present), ${failed.length} failed`,
);
if (failed.length) {
  console.log(failed.map((f) => `  ${f}`).join("\n"));
  process.exitCode = 1;
}
