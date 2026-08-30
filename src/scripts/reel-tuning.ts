/**
 * The reel's motion parameters, in one place.
 *
 * The scroller reads these; the tuner panel (?tune) writes them. Values live in
 * localStorage so a session of fiddling survives a reload — "Copy" in the panel
 * prints a DEFAULTS block to paste back over the one below.
 */

export type SnapMode = "mandatory" | "proximity" | "none";

export interface Tuning {
  /** Title follower: speed in Hz. Higher = arrives sooner. */
  typeFreq: number;
  /** Title follower: damping. 1 = no overshoot, <1 = settles with a bounce. */
  typeZeta: number;
  /** Title follower: response. >0 reacts to the flick immediately, <0 eases in. */
  typeResp: number;
  /** Cover follower: same three, run slower so the photo trails the type. */
  coverFreq: number;
  coverZeta: number;
  coverResp: number;
  /** Cover crossfade: fraction of the travel the outgoing photo is held for. */
  fadeHold: number;
  /** Cover crossfade: fraction of the travel the swap itself takes. */
  fadeWidth: number;
  /** Rows one step out drop to (1 - dimStep) white. */
  dimStep: number;
  /** …and reach zero this many issues later. */
  dimReach: number;
  /**
   * The gearing: px of document scroll that buys one issue.
   *
   * The single number that decides how the reel feels, and the honest unit for
   * it is the trackpad: one full swipe of the glass is roughly 780px of wheel,
   * so this is that 780 divided by however many issues a swipe should cover.
   * It used to be the viewport height — a whole screen per 115px row, about
   * 9:1, three issues a swipe — which is what made a flick die after two of
   * them and a slow scroll feel like winching.
   */
  travel: number;
  /** Which native snap the document uses. Forced to "none" under wheelLock. */
  snap: SnapMode;
  /** Take over the wheel: one notch = one issue, spring does the travel. */
  wheelLock: boolean;
  /** Wheel distance (px) that counts as one issue when wheelLock is on. */
  wheelStep: number;
  /** With no native snap, settle to the nearest issue this long after scrolling stops. */
  settleMs: number;
}

export const DEFAULTS: Tuning = {
  // Tuned on the glass, not derived — these came off the panel. What they do,
  // measured against the 2.6 Hz first pass: on a trackpad flick the type now
  // runs 24px behind the scrollbar instead of 54, and has stopped moving
  // 250ms after you have instead of 480ms. Damped hard enough that nothing
  // overshoots any more. Whatever reads as weight now is the gearing below;
  // none of it is left in the spring.
  typeFreq: 5,
  typeZeta: 0.7,
  typeResp: 0.3,
  // The photograph still trails the type — that gap is the depth — but by a
  // beat rather than a breath: the swap is finished 167ms into a flick where
  // the first pass took 317ms.
  coverFreq: 3.4,
  coverZeta: 1,
  coverResp: 0.2,
  // Almost no hold. At 120px an issue the travel is over quickly, and any
  // real hold leaves the outgoing photograph on screen under the incoming
  // title — the cover has to commit as soon as the move starts.
  fadeHold: 0.08,
  fadeWidth: 0.42,
  // Near-total falloff: a row one step out is 3% white, not the 45% the
  // canvases used. Those only ever stacked three issues; across thirty that
  // floor is a wall of type, and the neighbours want to be a ghost of one.
  dimStep: 0.97,
  dimReach: 4,
  // One row of scroll per row of movement — the reel travels exactly as far
  // as your fingers do, and no faster. A full swipe of a trackpad is roughly
  // 780px of wheel, so that is six or seven issues a swipe, and it is the
  // last gearing at which a flick's momentum (~2400px, twenty issues) still
  // decays inside a thirty-issue archive instead of slamming into the end.
  travel: 120,
  // Any magnet at all is the enemy of a long flick: proximity grabs the
  // momentum the moment it slows near an issue, which is exactly when the
  // travel should still be running. Nothing native — settle() lands it.
  snap: "none",
  wheelLock: false,
  wheelStep: 120,
  // Long enough to be sure the trackpad's momentum has genuinely finished
  // rather than paused, short enough that the landing still feels attached
  // to the flick that caused it.
  settleMs: 110,
};

/**
 * The phone's gearing.
 *
 * Same media query as the narrow-viewport block in IssueScroller.astro, and
 * that is not a coincidence: the gearing is only meaningful against the row it
 * moves. There the row becomes 7svh (~57px on a 375×812 screen) instead of the
 * 22px the width-bound scale was handing it, so the travel comes down with it.
 *
 * 80px an issue is a shade heavier than the desktop's 1:1 — the reel moves
 * about seven tenths of the distance the thumb does. Dead-on 1:1 is the
 * honest touch answer, but a thumb flick on glass carries far more momentum
 * than a trackpad's, and at 1:1 a single one crosses the whole archive.
 */
export const MOBILE: Partial<Tuning> = {
  travel: 80,
  // Touch has its own inertia to trail; the springs only have to take the
  // steps out of it, so they run a little faster and land a little harder.
  typeFreq: 6,
  typeZeta: 0.8,
  typeResp: 0.25,
  coverFreq: 4,
  coverResp: 0.15,
  // iOS momentum arrives in bursts with gaps between them. At 110ms settle()
  // fired into one of those gaps and scrollTo() killed the flick outright —
  // a hard stop mid-travel, which is exactly what reads as a dropped frame.
  settleMs: 220,
};

/** The viewport the MOBILE block is written for. Kept in step with the
 *  `max-width: 48rem` block in IssueScroller.astro. */
export const NARROW = "(max-width: 48rem)";

/** DEFAULTS, with the phone's overrides folded in when we are on one. */
export const base = (): Tuning =>
  typeof matchMedia !== "undefined" && matchMedia(NARROW).matches
    ? { ...DEFAULTS, ...MOBILE }
    : { ...DEFAULTS };

/**
 * A few starting points, so the panel is a comparison and not a blank slate.
 *
 * `travel` is the one that actually changes the feel — the springs only smooth
 * whatever gearing hands them — so every preset sets it.
 */
export const PRESETS: Record<string, Partial<Tuning>> = {
  // As close as the sliders go to what shipped first: a screen of scroll per
  // issue, a mandatory magnet, and a follower fast enough (~100ms) to read as
  // no follower at all. Here to A/B against.
  Original: {
    travel: 900,
    typeFreq: 12,
    typeZeta: 1,
    typeResp: 0,
    coverFreq: 12,
    coverZeta: 1,
    coverResp: 0,
    // The falloff the three canvases were drawn with, restored along with the
    // rest of it — a preset that claims to be the old feel has to look like it
    // as well as move like it.
    fadeHold: 0.32,
    fadeWidth: 0.42,
    dimStep: 0.55,
    dimReach: 4,
    snap: "mandatory",
    wheelLock: false,
  },
  // The first pass at weight: springs added, gearing untouched. Kept because
  // it is the clearest demonstration that smoothing alone cannot fix reach —
  // it is the heavy feel, and no slider in the Título group escapes it.
  Silk: {
    travel: 900,
    typeFreq: 2.6,
    typeZeta: 0.65,
    typeResp: 0,
    coverFreq: 1.7,
    coverZeta: 1,
    coverResp: 0,
    fadeHold: 0.32,
    fadeWidth: 0.42,
    dimStep: 0.55,
    dimReach: 4,
    snap: "proximity",
    wheelLock: false,
  },
  // Faster than the default and geared for the hand rather than the flick: a
  // full swipe of the trackpad covers about a dozen issues, and momentum will
  // happily carry one clean past the end of the archive.
  Momentum: {
    travel: 65,
    typeFreq: 3.8,
    typeZeta: 0.6,
    typeResp: 0.2,
    coverFreq: 2.6,
    coverZeta: 1,
    coverResp: 0.15,
    snap: "none",
    wheelLock: false,
    settleMs: 140,
  },
  // The default, kept here so the other presets have something to come back
  // to. See DEFAULTS for what the numbers are doing.
  Precise: {
    travel: 120,
    typeFreq: 5,
    typeZeta: 0.7,
    typeResp: 0.3,
    coverFreq: 3.4,
    coverZeta: 1,
    coverResp: 0.2,
    // The crossfade and the falloff belong to this one too — a preset that
    // claims to be the default has to put every slider back, not most of them.
    fadeHold: 0.08,
    fadeWidth: 0.42,
    dimStep: 0.97,
    dimReach: 4,
    snap: "none",
    wheelLock: false,
    settleMs: 110,
  },
  // Long and slow: a lot of travel per issue and a photograph well behind.
  Cinema: {
    travel: 520,
    typeFreq: 1.5,
    typeZeta: 1,
    typeResp: 0.4,
    coverFreq: 0.9,
    coverZeta: 1,
    coverResp: 0,
    snap: "none",
    wheelLock: false,
    settleMs: 200,
  },
};

type Spec =
  | { key: keyof Tuning; label: string; group: string; kind: "range"; min: number; max: number; step: number; hint?: string }
  | { key: keyof Tuning; label: string; group: string; kind: "select"; options: string[]; hint?: string }
  | { key: keyof Tuning; label: string; group: string; kind: "toggle"; hint?: string };

export const SPECS: Spec[] = [
  { group: "Título", key: "typeFreq", label: "Velocidad", kind: "range", min: 0.4, max: 12, step: 0.05, hint: "Hz — cuánto tarda en llegar" },
  { group: "Título", key: "typeZeta", label: "Amortiguación", kind: "range", min: 0.3, max: 1.4, step: 0.01, hint: "1 = sin rebote, <1 = rebota" },
  { group: "Título", key: "typeResp", label: "Respuesta", kind: "range", min: -1, max: 2, step: 0.05, hint: ">0 arranca de golpe, <0 arranca lento" },

  { group: "Portada", key: "coverFreq", label: "Velocidad", kind: "range", min: 0.3, max: 12, step: 0.05, hint: "más lenta que el título = profundidad" },
  { group: "Portada", key: "coverZeta", label: "Amortiguación", kind: "range", min: 0.3, max: 1.4, step: 0.01 },
  { group: "Portada", key: "coverResp", label: "Respuesta", kind: "range", min: -1, max: 2, step: 0.05 },
  { group: "Portada", key: "fadeHold", label: "Retención", kind: "range", min: 0, max: 0.8, step: 0.01, hint: "cuánto aguanta la foto saliente" },
  { group: "Portada", key: "fadeWidth", label: "Cruce", kind: "range", min: 0.05, max: 1, step: 0.01, hint: "duración del relevo" },

  { group: "Archivo", key: "dimStep", label: "Caída", kind: "range", min: 0, max: 1, step: 0.01, hint: "cuánto baja el vecino" },
  { group: "Archivo", key: "dimReach", label: "Alcance", kind: "range", min: 1, max: 10, step: 0.5, hint: "números hasta desaparecer" },

  { group: "Scroll", key: "travel", label: "Recorrido", kind: "range", min: 30, max: 1000, step: 5, hint: "px por número — 780 ÷ esto = números por pasada de trackpad" },
  { group: "Scroll", key: "snap", label: "Imán", kind: "select", options: ["mandatory", "proximity", "none"] },
  { group: "Scroll", key: "wheelLock", label: "Rueda paso a paso", kind: "toggle", hint: "una muesca = un número (desactiva el imán nativo)" },
  { group: "Scroll", key: "wheelStep", label: "Umbral rueda", kind: "range", min: 20, max: 400, step: 5, hint: "px de rueda por número" },
  { group: "Scroll", key: "settleMs", label: "Reposo", kind: "range", min: 0, max: 600, step: 10, hint: "ms sin scroll antes de encajar" },
];

const KEY = "sobremesa.reel.tuning";

/**
 * Anything that reaches the store has to be something a control can also show —
 * a number outside its slider's range, or a snap mode that is not on the menu,
 * would leave the panel reading one value while the reel ran another.
 */
function sanitise(raw: unknown): Tuning {
  const out = base();
  if (!raw || typeof raw !== "object") return out;

  for (const k of Object.keys(DEFAULTS) as (keyof Tuning)[]) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v !== typeof DEFAULTS[k]) continue;

    const spec = SPECS.find((s) => s.key === k);
    if (spec?.kind === "range" && typeof v === "number") {
      if (!Number.isFinite(v)) continue;
      (out as Record<string, unknown>)[k] = Math.min(spec.max, Math.max(spec.min, v));
    } else if (spec?.kind === "select") {
      if (spec.options.includes(v as string)) (out as Record<string, unknown>)[k] = v;
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

function read(): Tuning {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitise(JSON.parse(raw)) : base();
  } catch {
    return base();
  }
}

let current: Tuning = typeof localStorage === "undefined" ? { ...DEFAULTS } : read();

const listeners = new Set<(t: Tuning) => void>();

export const tuning = () => current;

export function setTuning(patch: Partial<Tuning>) {
  current = sanitise({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode — the session still tunes, it just will not persist */
  }
  listeners.forEach((fn) => fn(current));
}

export function resetTuning() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* see above */
  }
  current = base();
  listeners.forEach((fn) => fn(current));
}

export function onTuning(fn: (t: Tuning) => void) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

/** The panel only mounts when asked for: /?tune */
export const tunerRequested = () =>
  typeof location !== "undefined" && new URLSearchParams(location.search).has("tune");
