/**
 * Per-issue cover treatment, read straight off the Figma cover board
 * (file OHAH6hHbqPC4Bz25ufZShU, node 1554:16) — the fill and blend mode of each
 * "NNN" text layer.
 *
 * Deliberately NOT stored in the issue markdown: that file is a mirror of what
 * Substack published, and re-running scripts/scrape-substack.mjs --force
 * rewrites its frontmatter wholesale. These are the site's own choices.
 *
 * Two things the board settles that the JSON in src/data/*.json got wrong:
 *
 *  - Hexes are per-issue, not four tokens. The aqua drifted across the archive
 *    (#00ffd4 → #00ffd9 → #89ffe4) before it settled, so each issue carries its
 *    own value rather than snapping to a token.
 *  - 027/028/029 are pink/sea/fire, matching the reel canvases. issues.json and
 *    all-issues.json disagree; the board wins.
 *
 * 000 is not on the board — it shipped without a cover — so it gets no blend.
 */

/** Figma blend mode → CSS mix-blend-mode. LINEAR_DODGE is "add", i.e. plus-lighter. */
export type Blend = "multiply" | "screen" | "plus-lighter" | "hard-light" | "lighten" | "normal";

/**
 * Display faces used on two covers instead of Geist. `vitor` is the Visigothic
 * face on 010 (Salamanca's Plaza Mayor, "Quod natura non dat"); `blackletter`
 * is UnifrakturCook on 018 (the Bavarian beer table). Everything else is Geist.
 * See the @font-face rules in src/styles/global.css.
 */
export type Face = "vitor" | "blackletter";

type Binding = {
  accent: string;
  blend: Blend;
  /** Layer opacity, where the board sets it below 1. */
  opacity?: number;
  face?: Face;
};

const BINDINGS: Record<string, Binding> = {
  // 000 predates the cover board.
  "000": { accent: "#ff8000", blend: "normal" },
  "001": { accent: "#ff006f", blend: "multiply" },
  "002": { accent: "#ff006f", blend: "multiply" },
  "003": { accent: "#ff006f", blend: "multiply" },
  "004": { accent: "#00ffd4", blend: "screen" },
  "005": { accent: "#ff8000", blend: "plus-lighter" },
  "006": { accent: "#0051ff", blend: "hard-light" },
  "007": { accent: "#00ffd9", blend: "lighten" },
  "008": { accent: "#ff8000", blend: "plus-lighter" },
  "009": { accent: "#ff8000", blend: "plus-lighter" },
  "010": { accent: "#ff006f", blend: "hard-light", face: "vitor" },
  "011": { accent: "#00ffd9", blend: "lighten" },
  "012": { accent: "#00ffd4", blend: "plus-lighter" },
  "013": { accent: "#ff8000", blend: "plus-lighter" },
  "014": { accent: "#ff006f", blend: "hard-light" },
  "015": { accent: "#ff8000", blend: "plus-lighter" },
  "016": { accent: "#89ffe4", blend: "lighten" },
  "017": { accent: "#ff006f", blend: "hard-light" },
  "018": { accent: "#89ffe4", blend: "lighten", face: "blackletter" },
  "019": { accent: "#ff8000", blend: "plus-lighter" },
  "020": { accent: "#ff006f", blend: "plus-lighter" },
  "021": { accent: "#0051ff", blend: "hard-light" },
  "022": { accent: "#ff8000", blend: "hard-light" },
  "023": { accent: "#89ffe4", blend: "hard-light" },
  "024": { accent: "#ff006f", blend: "hard-light", opacity: 0.7 },
  "025": { accent: "#89ffe4", blend: "hard-light" },
  "026": { accent: "#ff8000", blend: "plus-lighter" },
  "027": { accent: "#ff006f", blend: "plus-lighter" },
  "028": { accent: "#0051ff", blend: "hard-light" },
  "029": { accent: "#ff8000", blend: "hard-light" },
};

export function bindingFor(number: string): Binding {
  return BINDINGS[number] ?? { accent: "#ff006f", blend: "hard-light" };
}
