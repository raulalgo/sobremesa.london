/**
 * Scene Rig — the shared motion spine (see contexts/roadmap.md).
 *
 * Observes pointer / gyro / scroll, lerps them, and publishes normalized
 * CSS custom properties on :root. Every visual effect on the site is a
 * declarative consumer of these signals:
 *
 *   --pointer-x / --pointer-y            fast channel, -1..1  (wordmark)
 *   --pointer-drift-x / --pointer-drift-y slow channel, -1..1 (photo, glow)
 *   --scroll-progress                    0..1 over one viewport height
 *
 * The fast/slow speed mismatch between layers is what sells the depth.
 */

const FAST_LERP = 0.12;
const SLOW_LERP = 0.045;
const EPSILON = 0.0005;
const SWAY_AMPLITUDE = 0.15;
const SWAY_PERIOD_MS = 8000;

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) start();

function start() {
  const root = document.documentElement.style;

  const target = { x: 0, y: 0 };
  const fast = { x: 0, y: 0 };
  const slow = { x: 0, y: 0 };

  let hasInput = false;
  let running = false;
  let rafId = 0;

  const clamp = (v: number) => Math.min(1, Math.max(-1, v));

  const wake = () => {
    if (!running) {
      running = true;
      rafId = requestAnimationFrame(tick);
    }
  };

  window.addEventListener(
    "pointermove",
    (e) => {
      hasInput = true;
      target.x = clamp((e.clientX / innerWidth) * 2 - 1);
      target.y = clamp((e.clientY / innerHeight) * 2 - 1);
      wake();
    },
    { passive: true },
  );

  // Gyro stands in for the pointer on touch devices. The first orientation
  // reading becomes the baseline — tilt is measured from however the visitor
  // is actually holding the phone, so there is no jump on the first event.
  const wireGyro = () => {
    let baseBeta: number | null = null;
    let baseGamma = 0;
    window.addEventListener(
      "deviceorientation",
      (e) => {
        if (e.gamma === null || e.beta === null) return;
        if (baseBeta === null) {
          baseBeta = e.beta;
          baseGamma = e.gamma;
          return;
        }
        hasInput = true;
        target.x = clamp((e.gamma - baseGamma) / 20);
        target.y = clamp((e.beta - baseBeta) / 20);
        wake();
      },
      { passive: true },
    );
  };

  const doe = window.DeviceOrientationEvent as
    | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
    | undefined;
  if (doe && !doe.requestPermission) {
    // Android (and anywhere sensors are ungated): wire immediately.
    wireGyro();
  } else if (doe?.requestPermission) {
    // iOS: sensors are permission-gated and the request must come from a
    // user gesture, so we piggyback on the first tap. Denied → the idle
    // sway keeps the page alive.
    let asked = false;
    const askOnce = () => {
      if (asked) return;
      asked = true;
      doe
        .requestPermission!()
        .then((state) => {
          if (state === "granted") wireGyro();
        })
        .catch(() => {});
    };
    window.addEventListener("click", askOnce, { once: true, passive: true });
    window.addEventListener("touchend", askOnce, { once: true, passive: true });
  }

  const onScroll = () => {
    const progress = Math.min(1, Math.max(0, scrollY / innerHeight));
    root.setProperty("--scroll-progress", progress.toFixed(4));
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      running = false;
    } else {
      wake();
    }
  });

  function tick(now: number) {
    // Idle breath: until the first real input, the room sways on its own.
    if (!hasInput) {
      const t = (now / SWAY_PERIOD_MS) * Math.PI * 2;
      target.x = Math.sin(t) * SWAY_AMPLITUDE;
      target.y = Math.sin(t * 0.8 + 1) * SWAY_AMPLITUDE;
    }

    fast.x += (target.x - fast.x) * FAST_LERP;
    fast.y += (target.y - fast.y) * FAST_LERP;
    slow.x += (target.x - slow.x) * SLOW_LERP;
    slow.y += (target.y - slow.y) * SLOW_LERP;

    root.setProperty("--pointer-x", fast.x.toFixed(4));
    root.setProperty("--pointer-y", fast.y.toFixed(4));
    root.setProperty("--pointer-drift-x", slow.x.toFixed(4));
    root.setProperty("--pointer-drift-y", slow.y.toFixed(4));

    // Sleep once everything converges (the sway never converges by design).
    const settled =
      hasInput &&
      Math.abs(target.x - slow.x) < EPSILON &&
      Math.abs(target.y - slow.y) < EPSILON &&
      Math.abs(target.x - fast.x) < EPSILON &&
      Math.abs(target.y - fast.y) < EPSILON;

    if (settled) {
      running = false;
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  wake();
}
