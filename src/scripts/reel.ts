import { Follower } from "./follower";
import { onTuning, tuning, type Tuning } from "./reel-tuning";

/**
 * The reel's scroll driver.
 *
 * The document still scrolls natively — that is what keeps the scrollbar, the
 * keyboard, the URL hash and the trackpad's own momentum honest. What changed is
 * that nothing paints straight off `scrollY` any more: the position is handed to
 * two springs (see follower.ts), and the type and the photographs are drawn from
 * those. The type leads, the photograph trails, and both keep moving for a beat
 * after the scroll has stopped.
 */
export function mountReel(reel: HTMLElement) {
  const bgs = [...reel.querySelectorAll<HTMLElement>("[data-bg]")];
  const rows = [...reel.querySelectorAll<HTMLElement>("[data-row]")];
  const last = rows.length - 1;
  if (last < 0) return;

  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const clampIndex = (n: number) => Math.min(last, Math.max(0, n));

  const calm = matchMedia("(prefers-reduced-motion: reduce)");

  let t: Tuning = tuning();

  /** Scroll position in issues: 0 = 029 snapped, 1 = 028, 2 = 027. */
  const targetP = () => clampIndex(scrollY / innerHeight);

  const type = new Follower(targetP(), t.typeFreq, t.typeZeta, t.typeResp);
  const cover = new Follower(targetP(), t.coverFreq, t.coverZeta, t.coverResp);

  /* ---------------------------------------------------------------- painting */

  /**
   * Holds the outgoing cover for the first third of the travel, then swaps over
   * quickly. A straight linear fade parks both photos at 50% across the middle
   * of the scroll and reads as a muddy double exposure.
   */
  function fade(x: number) {
    const s = clamp01((x - t.fadeHold) / Math.max(0.01, t.fadeWidth));
    return s * s * (3 - 2 * s);
  }

  function paint(pType: number, pCover: number) {
    reel.style.setProperty("--p", pType.toFixed(4));

    rows.forEach((row, i) => {
      const distance = Math.abs(pType - i);
      const live = clamp01(1 - distance);
      // Rows more than one step away dim to the 40% white of canvas 3, then keep
      // fading out. The canvases only ever stacked three issues; across thirty,
      // a floor of 45% turns the screen into a wall of type.
      const falloff =
        (1 - t.dimStep * clamp01(distance - 1)) * (1 - clamp01((distance - 2) / t.dimReach));

      row.style.setProperty("--live", live.toFixed(4));
      row.style.setProperty("--idle", ((1 - live) * falloff).toFixed(4));
    });

    // Each cover fades in *over* the previous one, which stays opaque underneath
    // — a straight two-way crossfade washes out at the midpoint.
    bgs.forEach((bg, i) => {
      bg.style.opacity = i === 0 ? "1" : fade(clamp01(pCover - i + 1)).toFixed(4);
    });
  }

  /**
   * Give the browser the covers it is about to need — the current issue plus two
   * either side — and nothing else. Driven off the raw scroll rather than the
   * springs, so the fetch starts before the photograph is wanted.
   */
  function mountNear(p: number) {
    const centre = Math.round(p);
    for (let i = Math.max(0, centre - 2); i <= Math.min(last, centre + 2); i++) {
      const img = bgs[i].querySelector("img");
      if (!img || img.src) continue;
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      img.src = img.dataset.src!;
    }
  }

  /* ------------------------------------------------------------------- loop */

  let raf = 0;
  let stamp = 0;

  function frame(now: number) {
    // First frame of a run has no previous timestamp; a backgrounded tab hands
    // back a gap of seconds, which no explicit integrator survives.
    const dt = stamp ? Math.min(0.05, (now - stamp) / 1000) : 1 / 60;
    stamp = now;

    const p = targetP();
    mountNear(p);

    if (calm.matches) {
      // Motion is the whole point of the springs, so under reduce there are none:
      // the reel tracks the scrollbar exactly, as it did before.
      type.reset(p);
      cover.reset(p);
      paint(p, p);
      raf = 0;
      return;
    }

    const pType = type.update(dt, p);
    const pCover = cover.update(dt, p);
    paint(pType, pCover);

    if (type.settled(p) && cover.settled(p)) {
      raf = 0;
      stamp = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf) {
      stamp = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  /* ------------------------------------------------------------ scroll input */

  const yFor = (i: number) => clampIndex(i) * innerHeight;

  /** Jump the document without animating it — the springs do the travelling. */
  let selfScroll = 0;
  function goto(i: number) {
    selfScroll = performance.now();
    scrollTo({ top: yFor(i), behavior: "instant" });
    kick();
  }

  let settleTimer = 0;

  function onScroll() {
    kick();
    if (settleTimer) clearTimeout(settleTimer);
    // With no native magnet the reel has to find the nearest issue itself —
    // this is what catches a touch drag or a flick that ended between two.
    if (effectiveSnap() === "none" && !calm.matches) {
      settleTimer = window.setTimeout(settle, t.settleMs);
    }
  }

  function settle() {
    if (performance.now() - selfScroll < 120) return;
    const i = Math.round(targetP());
    if (Math.abs(scrollY - yFor(i)) > 1) goto(i);
  }

  /* Wheel take-over: one notch of the wheel is one issue, and the spring — not
     the browser's momentum — carries the travel. Off by default; a trackpad
     already has momentum worth keeping. */
  let acc = 0;
  let gate = 0;

  function onWheel(e: WheelEvent) {
    if (!t.wheelLock || calm.matches) return;
    e.preventDefault();

    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    acc += px;

    const now = performance.now();
    // One step per half-period of the type spring: a faster spring accepts a
    // faster cadence, so the reel never queues up moves it cannot show.
    const cadence = Math.max(90, 500 / Math.max(0.5, t.typeFreq));
    if (now < gate) {
      acc = Math.sign(acc) * Math.min(Math.abs(acc), t.wheelStep);
      return;
    }

    if (Math.abs(acc) >= t.wheelStep) {
      const dir = Math.sign(acc);
      acc = 0;
      gate = now + cadence;
      goto(Math.round(targetP()) + dir);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Only worth intercepting when the native magnet is off; otherwise the
    // browser's own paging already lands on an issue.
    if (effectiveSnap() !== "none") return;

    const here = Math.round(targetP());
    const map: Record<string, number> = {
      ArrowDown: here + 1,
      PageDown: here + 1,
      " ": here + 1,
      ArrowUp: here - 1,
      PageUp: here - 1,
      Home: 0,
      End: last,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    goto(map[e.key]);
  }

  /* --------------------------------------------------------------- wiring up */

  const effectiveSnap = () => (t.wheelLock ? "none" : t.snap);

  function apply(next: Tuning) {
    t = next;
    type.tune(t.typeFreq, t.typeZeta, t.typeResp);
    cover.tune(t.coverFreq, t.coverZeta, t.coverResp);
    document.documentElement.dataset.snap = effectiveSnap();
    kick();
  }

  onTuning(apply);

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("keydown", onKey);
  addEventListener("resize", () => {
    const p = targetP();
    type.reset(p);
    cover.reset(p);
    kick();
  });
  calm.addEventListener("change", kick);

  // Deep link: /#028 opens with that issue already snapped.
  const target = rows.findIndex((row) => row.dataset.number === location.hash.slice(1));
  if (target > 0) {
    scrollTo({ top: yFor(target), behavior: "instant" });
    type.reset(target);
    cover.reset(target);
  }

  // Clicking a title snaps to it.
  rows.forEach((row, i) => row.addEventListener("click", () => goto(i)));

  kick();
}
