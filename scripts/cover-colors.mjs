/**
 * Reads the top edge of every cover and writes src/data/cover-colors.json.
 *
 * Why the site needs this: iOS Safari does not let a page paint into the strip
 * behind the status bar, nor behind its own toolbar. It *tints* those strips —
 * from <meta name="theme-color">, or, failing that, from the page background,
 * which here is #000. That is the black band. The photograph can never reach
 * up there, but the strip can be told to take the photograph's colour, and
 * then it stops reading as a band and starts reading as the top of the image.
 *
 * Only the top edge is sampled. Safari uses one theme-color for both strips
 * and the top one is the constant: the bottom toolbar collapses on the first
 * scroll and the cover reclaims most of that space anyway.
 *
 * The centre 60% of the width is what gets sampled, not the whole row. A 16:9
 * cover in a portrait phone is scaled to fill the height by object-fit, so the
 * left and right thirds of the original are cropped away and never seen — an
 * average across the full row would be weighted by pixels nobody looks at.
 *
 * Run after adding a cover:  node scripts/cover-colors.mjs
 */
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const COVERS = new URL("../src/assets/covers/", import.meta.url);
const OUT = new URL("../src/data/cover-colors.json", import.meta.url);

/** 002 and 003 never got their own photograph — the newsletter reused 001's. */
const ALIASES = { "002": "001", "003": "001" };

const hex = (n) => Math.round(n).toString(16).padStart(2, "0");

async function topEdge(file) {
  const W = 64;
  // Three rows is enough for an average and cheap to decode; any more just
  // drags the sky down into the roofline on the architectural covers.
  const H = 3;
  const img = sharp(file).resize({ width: W, position: "top" });
  const meta = await img.metadata();
  const { data, info } = await img
    .extract({ left: 0, top: 0, width: W, height: Math.min(H, meta.height ?? H) })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const x0 = Math.floor(info.width * 0.2);
  const x1 = Math.ceil(info.width * 0.8);

  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * info.width + x) * ch;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return `#${hex(r / n)}${hex(g / n)}${hex(b / n)}`;
}

const dir = fileURLToPath(COVERS);
const files = (await readdir(dir)).filter((f) => /\.(png|jpe?g)$/i.test(f));
const byNumber = {};
for (const f of files) {
  const num = f.match(/(\d{3})\.\w+$/)?.[1];
  if (num) byNumber[num] = await topEdge(path.join(dir, f));
}
for (const [issue, source] of Object.entries(ALIASES)) {
  if (byNumber[source]) byNumber[issue] = byNumber[source];
}

const sorted = Object.fromEntries(Object.entries(byNumber).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUT, JSON.stringify(sorted, null, 2) + "\n");
console.log(`wrote ${Object.keys(sorted).length} colours`);
for (const [k, v] of Object.entries(sorted)) console.log(`  ${k}  ${v}`);
