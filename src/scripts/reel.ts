import { Follower } from "./follower";
import { onTuning, tuning, type Tuning } from "./reel-tuning";

/**
 * The reel's scroll driver.
 *
 * The document still scrolls natively, and that is the whole trick: the long,
 * naturally decaying run you get from a trackpad flick is the operating
 * system's momentum curve, and the only way to keep it is to not take the
 * wheel away. So this file does two things and no more.
 *
 * It sets the gearing — `travel`, the px of scroll that buy one issue. That is
 * what decides the feel, and a full swipe of a trackpad is about 780px of it:
 * at a viewport per issue that swipe bought three titles and a flick died
 * after two. At 120px it buys six or seven, the reel travels exactly as far
 * as your fingers do, and a flick still has room to decay on its own.
 *
 * And it smooths the result: nothing paints straight off `scrollY`, the
 * position goes through two springs (see follower.ts), the type leading and
 * the photograph trailing. The springs are polish on top of the gearing, not a
 * substitute for it — no amount of them fixes a reel geared too long.
 */
export function mountReel(reel: HTMLElement) {
  const bgs = [...reel.querySelectorAll<HTMLElement>("[data-bg]")];
  // The photographs and the black stand-ins, looked up once: the frame loop
  // asks after every one of them on every frame.
  const covers = bgs.map((bg) => bg.querySelector("img"));
  const blank = bgs.map((bg) => bg.dataset.nocover !== undefined);
  const rows = [...reel.querySelectorAll<HTMLElement>("[data-row]")];
  const last = rows.length - 1;
  if (last < 0) return;

  /*
    The strip behind the status bar.

    It is the one part of a full-bleed phone layout the page does not draw:
    iOS Safari paints it itself, tinting it from <meta name="theme-color"> and
    falling back to the page background — black — when there is none. That is
    what read as a band above the photograph no matter how far the cover was
    made to overhang the viewport. The cover cannot reach up there, but the
    strip can be handed the colour of the cover's top edge, and then the two
    stop looking like two things. Colours ride in on data-tint; see
    scripts/cover-colors.mjs.
  */
  const tints = bgs.map((bg) => bg.dataset.tint || "#000000");
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  let tintWas = -1;

  const root = document.documentElement;

  function tint(i: number) {
    if (i === tintWas) return;
    tintWas = i;
    // The canvas: what actually paints the strips the cover cannot reach.
    root.style.backgroundColor = tints[i];
    // And the browser's own furniture, which takes its colour from here.
    if (themeMeta) themeMeta.content = tints[i];
  }

  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const clampIndex = (n: number) => Math.min(last, Math.max(0, n));

  const calm = matchMedia("(prefers-reduced-motion: reduce)");

  let t: Tuning = tuning();

  /** px of document scroll per issue — the gearing. */
  const step = () => Math.max(1, t.travel);

  /** Scroll position in issues: 0 = 029 snapped, 1 = 028, 2 = 027. */
  const targetP = () => clampIndex(scrollY / step());

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

  /*
    Everything the frame loop writes, remembered.

    Thirty issues is thirty rows and thirty covers, and on any given frame the
    overwhelming majority of them are pinned at zero and staying there. Writing
    a value a layer already holds still invalidates it, and these are blended
    layers over a full-screen photograph — the invalidation is the expensive
    part, not the arithmetic. So nothing is written twice.
  */
  const liveWas = rows.map(() => "");
  const idleWas = rows.map(() => "");
  const ghostWas = rows.map(() => false);
  const bgWas = bgs.map(() => "");
  const bgHidWas = bgs.map(() => false);
  let pWas = "";

  /** Does this cover actually paint something opaque, or is it still a hole? */
  const opaque = (i: number) => {
    const img = covers[i];
    return blank[i] || (!!img && img.complete && img.naturalWidth > 0);
  };

  function paint(pType: number, pCover: number) {
    const p = pType.toFixed(4);
    if (p !== pWas) {
      reel.style.setProperty("--p", p);
      pWas = p;
    }

    rows.forEach((row, i) => {
      const distance = Math.abs(pType - i);
      const live = clamp01(1 - distance);
      // Rows more than one step away drop by dimStep, then keep fading out
      // over dimReach. The canvases stacked three issues on a 45% floor;
      // across thirty that floor is a wall of type, so the default falls much
      // further than they did — a neighbour reads as a ghost, not a headline.
      const falloff =
        (1 - t.dimStep * clamp01(distance - 1)) * (1 - clamp01((distance - 2) / t.dimReach));
      const idle = (1 - live) * falloff;

      const liveStr = live.toFixed(4);
      if (liveStr !== liveWas[i]) {
        row.style.setProperty("--live", liveStr);
        liveWas[i] = liveStr;
      }

      const idleStr = idle.toFixed(4);
      if (idleStr !== idleWas[i]) {
        row.style.setProperty("--idle", idleStr);
        idleWas[i] = idleStr;
      }

      // Under 3% white the two blends are within five levels of each other on
      // the darkest cover in the archive, and closer than that on every other
      // — but soft-light still costs a read of the photograph behind it. Take
      // it off the rows that have faded past the point of telling. See the
      // [data-ghost] rule in IssueScroller.astro.
      const ghost = idle < 0.03;
      if (ghost !== ghostWas[i]) {
        row.toggleAttribute("data-ghost", ghost);
        ghostWas[i] = ghost;
      }
    });

    // Each cover fades in *over* the previous one, which stays opaque underneath
    // — a straight two-way crossfade washes out at the midpoint. Which also
    // means every cover under the topmost opaque one is drawing a full screen
    // of photograph that nobody will ever see; walking the stack from the top
    // finds the first one that closes it and takes the rest out of the frame.
    let covered = false;
    for (let i = last; i >= 0; i--) {
      const bg = bgs[i];

      if (covered !== bgHidWas[i]) {
        bg.style.visibility = covered ? "hidden" : "";
        bgHidWas[i] = covered;
      }

      const o = i === 0 ? 1 : fade(clamp01(pCover - i + 1));
      if (!covered) {
        const oStr = o.toFixed(4);
        if (oStr !== bgWas[i]) {
          bg.style.opacity = oStr;
          bgWas[i] = oStr;
        }
      }

      if (o >= 1 && opaque(i)) covered = true;
    }

    // Whichever cover is doing most of the painting owns the strip. Safari
    // animates the change itself, so a hard switch at the halfway point reads
    // as a fade rather than a jump.
    tint(clampIndex(Math.round(pCover)));
  }

  /**
   * Give the browser the covers it is about to need — the current issue plus two
   * either side — and nothing else. Driven off the raw scroll rather than the
   * springs, so the fetch starts before the photograph is wanted.
   */
  function mountNear(p: number) {
    const centre = Math.round(p);
    for (let i = Math.max(0, centre - 2); i <= Math.min(last, centre + 2); i++) {
      const img = covers[i];
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

  const yFor = (i: number) => clampIndex(i) * step();

  /** Jump the document without animating it — the springs do the travelling. */
  let selfScroll = 0;
  function goto(i: number) {
    selfScroll = performance.now();
    scrollTo({ top: yFor(i), behavior: "instant" });
    kick();
  }

  let settleTimer = 0;

  /*
    A finger resting on the glass produces no scroll events, and settle() has
    no way to tell that from a flick that has finished — so it would land the
    reel on an issue mid-drag and the next millimetre of the drag would fight
    it. Nothing lands while the hand is still on the reel.
  */
  let touching = false;

  function onScroll() {
    kick();
    if (settleTimer) clearTimeout(settleTimer);
    // With no native magnet the reel has to find the nearest issue itself —
    // this is what catches a touch drag or a flick that ended between two.
    if (effectiveSnap() === "none" && !calm.matches && !touching) {
      settleTimer = window.setTimeout(settle, t.settleMs);
    }
  }

  function settle() {
    if (touching || performance.now() - selfScroll < 120) return;
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
    // Always ours, at any gearing. Native paging moves by a viewport, which
    // once an issue costs 120px means a PageDown skips seven of them — one
    // key, one issue is the only reading that survives the slider.
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

  /**
   * Under reduce there are no springs, so there is nothing to land the reel
   * between issues — settle() is skipped too. The browser's own magnet has to
   * take that job back, or a reduced-motion reader is left mid-issue.
   */
  const effectiveSnap = () =>
    calm.matches ? "proximity" : t.wheelLock ? "none" : t.snap;

  function apply(next: Tuning) {
    const wasAt = targetP();
    const wasTravel = t.travel;

    t = next;
    type.tune(t.typeFreq, t.typeZeta, t.typeResp);
    cover.tune(t.coverFreq, t.coverZeta, t.coverResp);

    // The spacers are sized off this, so the document's whole height changes
    // with it — see IssueScroller's .snap / .reel padding.
    reel.style.setProperty("--step", String(step()));
    document.documentElement.dataset.snap = effectiveSnap();

    // Re-measure against the new ruler, or dragging the gearing slider would
    // send the reel to a different issue on every input event.
    if (t.travel !== wasTravel) {
      // The spacers have to be their new height before scrollTo can be asked
      // for a position near the end of them, or it clamps against the old one.
      void reel.offsetHeight;
      selfScroll = performance.now();
      scrollTo({ top: yFor(wasAt), behavior: "instant" });
    }

    kick();
  }

  onTuning(apply);

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener(
    "touchstart",
    () => {
      touching = true;
      if (settleTimer) clearTimeout(settleTimer);
    },
    { passive: true },
  );
  // The lift is the earliest moment a landing can be honest about — and it is
  // also the start of the momentum, so onScroll takes it from here.
  const release = () => {
    touching = false;
    onScroll();
  };
  addEventListener("touchend", release, { passive: true });
  addEventListener("touchcancel", release, { passive: true });
  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("keydown", onKey);
  addEventListener("resize", () => {
    const p = targetP();
    type.reset(p);
    cover.reset(p);
    kick();
  });
  // Turning reduce on has to hand the magnet back, not just restart the loop.
  calm.addEventListener("change", () => apply(t));

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
