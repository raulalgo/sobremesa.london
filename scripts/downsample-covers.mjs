/**
 * Normalises src/assets/covers/* into web-sized JPEGs.
 *
 *   node scripts/downsample-covers.mjs [--max=2560] [--quality=90]
 *
 * The covers arrive as whatever Substack/Midjourney handed over — mostly
 * full-res PNG, which is a lossless container holding a photograph, plus one
 * 5184x3888 camera JPEG. That set weighs 136 MB across 27 files, and git keeps
 * every byte of it forever.
 *
 * None of that weight reaches a reader. IssueScroller asks Astro for webp at
 * widths [1280, 1920, 2560] (quality 78), so any pixel past 2560 wide is
 * resolution the build resamples away, and the PNG container is pure overhead
 * for photographic content. Capping the long edge at 2560 and re-encoding to
 * q90 mozjpeg is therefore invisible in the delivered webp while cutting the
 * committed set by ~95%.
 *
 * Originals are moved to covers-original/ (gitignored) rather than deleted, so
 * re-running against a higher --max is always possible. Re-running is safe: the
 * script prefers covers-original/ as its source once that directory exists.
 */
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIVE = join(ROOT, "src/assets/covers");
const ORIGINALS = join(ROOT, "covers-original");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};

const MAX_EDGE = arg("max", 2560);
const QUALITY = arg("quality", 90);

const exists = async (p) => !!(await stat(p).catch(() => null));

// First run moves the originals aside; later runs re-encode from that copy so
// repeated invocations never stack generational JPEG loss.
if (await exists(ORIGINALS)) {
  await rm(LIVE, { recursive: true, force: true });
} else {
  await rename(LIVE, ORIGINALS);
}
await mkdir(LIVE, { recursive: true });

const files = (await readdir(ORIGINALS)).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();

let before = 0;
let after = 0;

for (const file of files) {
  const source = join(ORIGINALS, file);
  const input = sharp(source);
  const { width, height } = await input.metadata();
  // metadata().size is only populated for buffer input, so measure on disk.
  const { size } = await stat(source);

  const info = await input
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toFile(join(LIVE, `${parse(file).name}.jpg`));

  before += size;
  after += info.size;

  console.log(
    `${file.padEnd(9)} ${String(width).padStart(4)}x${String(height).padEnd(4)} ` +
      `${(size / 1e6).toFixed(1).padStart(5)} MB  ->  ` +
      `${String(info.width).padStart(4)}x${String(info.height).padEnd(4)} ` +
      `${(info.size / 1e6).toFixed(2).padStart(5)} MB  (-${((1 - info.size / size) * 100).toFixed(0)}%)`,
  );
}

console.log(
  `\n${files.length} covers: ${(before / 1e6).toFixed(0)} MB -> ${(after / 1e6).toFixed(1)} MB ` +
    `(-${((1 - after / before) * 100).toFixed(1)}%)`,
);
