/**
 * A second-order follower — the thing that stands between the scrollbar and
 * what you see.
 *
 * Raw `scrollY` is whatever the trackpad, the wheel or the browser's own snap
 * animation says it is: it arrives in steps, and it stops dead. Running it
 * through a damped spring gives the reel weight — the type keeps travelling for
 * a beat after your fingers leave the glass, and settles instead of stopping.
 *
 * Parameterised the way an animator would want it rather than the way the maths
 * falls out:
 *   f  frequency, in Hz — how fast it gets there.
 *   z  damping — 1 lands clean, below 1 overshoots and comes back, above 1 crawls in.
 *   r  response — 0 eases away from rest, >0 leaves immediately (and overshoots
 *      the far end), <0 winds up before moving.
 *
 * Integration is the semi-implicit form with a stability clamp, so a dropped
 * frame or a backgrounded tab cannot blow the spring up.
 */
export class Follower {
  private y: number;
  private yd = 0;
  private xp: number;
  private w = 1;
  private z = 1;
  private d = 0;
  private k1 = 1;
  private k2 = 1;
  private k3 = 0;

  constructor(x0: number, f: number, z: number, r: number) {
    this.y = x0;
    this.xp = x0;
    this.tune(f, z, r);
  }

  tune(f: number, z: number, r: number) {
    this.w = 2 * Math.PI * Math.max(0.01, f);
    this.z = z;
    this.d = this.w * Math.sqrt(Math.abs(z * z - 1));
    this.k1 = z / (Math.PI * Math.max(0.01, f));
    this.k2 = 1 / (this.w * this.w);
    this.k3 = (r * z) / this.w;
  }

  /** Drop the spring onto a value with no velocity — deep links, resize. */
  reset(x: number) {
    this.y = x;
    this.xp = x;
    this.yd = 0;
  }

  get value() {
    return this.y;
  }

  get velocity() {
    return this.yd;
  }

  /**
   * True once the spring has effectively arrived and the loop can stop.
   *
   * The units here are issues, and an issue is ~115px tall: the thresholds are
   * 0.06px of travel and 0.6px per second of drift. Tighter than that and a
   * critically damped follower keeps the rAF loop alive for another half second
   * after the last visible movement.
   */
  settled(x: number) {
    return Math.abs(x - this.y) < 5e-4 && Math.abs(this.yd) < 5e-3;
  }

  update(dt: number, x: number) {
    const xd = (x - this.xp) / dt;
    this.xp = x;

    let k1 = this.k1;
    let k2 = this.k2;

    if (this.w * dt < this.z) {
      // Comfortably inside the stable region: clamp k2 so the explicit step
      // cannot overshoot into oscillation on a long frame.
      k2 = Math.max(k2, (dt * dt) / 2 + (dt * k1) / 2, dt * k1);
    } else {
      // Fast spring or slow frame — match the discrete poles to the continuous
      // ones instead, which stays accurate where the clamp would drag.
      const t1 = Math.exp(-this.z * this.w * dt);
      const alpha = 2 * t1 * (this.z <= 1 ? Math.cos(dt * this.d) : Math.cosh(dt * this.d));
      const beta = t1 * t1;
      const t2 = dt / (1 + beta - alpha);
      k1 = (1 - beta) * t2;
      k2 = dt * t2;
    }

    this.y += dt * this.yd;
    this.yd += (dt * (x + this.k3 * xd - this.y - k1 * this.yd)) / k2;
    return this.y;
  }
}
