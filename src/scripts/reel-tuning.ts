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
  // 2.6 Hz / 0.65 puts the title's overshoot at about 4px on a 115px row and
  // 230ms past the snap — enough to read as weight, not as a wobble.
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
  wheelStep: 120,
  settleMs: 90,
};

/** A few starting points, so the panel is a comparison and not a blank slate. */
export const PRESETS: Record<string, Partial<Tuning>> = {
  // As close as the sliders go to what shipped: mandatory snap and a follower
  // fast enough (~100ms) to read as no follower at all. Here to A/B against.
  Original: {
    typeFreq: 12,
    typeZeta: 1,
    typeResp: 0,
    coverFreq: 12,
    coverZeta: 1,
    coverResp: 0,
    snap: "mandatory",
    wheelLock: false,
  },
  // Type lands with a touch of overshoot, photo drifts in behind it.
  Silk: {
    typeFreq: 2.6,
    typeZeta: 0.65,
    typeResp: 0,
    coverFreq: 1.7,
    coverZeta: 1,
    coverResp: 0,
    snap: "proximity",
    wheelLock: false,
  },
  // Heavier: long travel, no bounce, photo a long way behind.
  Cinema: {
    typeFreq: 1.5,
    typeZeta: 1,
    typeResp: 0.4,
    coverFreq: 0.9,
    coverZeta: 1,
    coverResp: 0,
    snap: "none",
    wheelLock: true,
  },
  // Tight and quick, still smoothed. Closest to the old feel without the snap.
  Snappy: {
    typeFreq: 5,
    typeZeta: 0.85,
    typeResp: 0.2,
    coverFreq: 3.4,
    coverZeta: 1,
    coverResp: 0,
    snap: "mandatory",
    wheelLock: false,
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
  const out = { ...DEFAULTS };
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
    return raw ? sanitise(JSON.parse(raw)) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
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
  current = { ...DEFAULTS };
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
