/**
 * Two-liquid mixing simulation — the /mix background.
 *
 * A GPU Navier–Stokes solver (Stam's "Stable Fluids": advect → curl/vorticity →
 * divergence → Jacobi pressure → project) carrying a single scalar
 * *concentration* field c ∈ [0,1] instead of an RGB dye. 0 is liquid A, 1 is
 * liquid B, and everything between is the blend — so the two colours marble
 * into each other the way coffee marbles into milk rather than muddying
 * through RGB space.
 *
 * The look comes from three things the reference video does:
 *   · buoyancy — the darker liquid is denser, so it sinks in plumes
 *   · vorticity confinement — puts the small curls back that the grid eats
 *   · relief shading off ∇c — makes the interfaces read as volume, not paint
 */

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type MixParams = {
  colorA: string;
  colorB: string;
  level: number;
  speed: number;
  viscosity: number;
  diffusion: number;
  vorticity: number;
  buoyancy: number;
  stir: number;
  stirSpeed: number;
  pour: number;
  contrast: number;
  relief: number;
  grain: number;
  vignette: number;
  halo: number;
  simRes: number;
  dyeRes: number;
  iterations: number;
};

const DEFAULTS: MixParams = {
  colorA: "#F0E2CE", // milk
  colorB: "#7C4A26", // coffee
  level: 0.62,
  speed: 1,
  viscosity: 0.18,
  diffusion: 0.045,
  vorticity: 24,
  buoyancy: 42,
  stir: 0.7,
  stirSpeed: 0.6,
  pour: 0.3,
  contrast: 0.2,
  relief: 0.45,
  grain: 0.05,
  vignette: 0.18,
  halo: 0.7,
  simRes: 128,
  dyeRes: 512,
  iterations: 20,
};

const STORAGE_KEY = "sobremesa-mix-params";

const PRESETS: Record<string, Partial<MixParams>> = {
  "cafe-con-leche": { colorA: "#F0E2CE", colorB: "#7C4A26" },
  "pink-aqua": { colorA: "#89FFE4", colorB: "#FF006F" },
  "fire-sea": { colorA: "#FF8000", colorB: "#0051FF" },
  "sea-aqua": { colorA: "#89FFE4", colorB: "#0051FF" },
  "pink-fire": { colorA: "#FF8000", colorB: "#FF006F" },
  "noche-pink": { colorA: "#0B0B0B", colorB: "#FF006F" },
};

const params: MixParams = { ...DEFAULTS };
let paused = false;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function start(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });

  if (!gl) {
    fail("This browser has no WebGL2 — the simulation can't run here.");
    return;
  }

  const canRenderFloat =
    gl.getExtension("EXT_color_buffer_float") ||
    gl.getExtension("EXT_color_buffer_half_float");

  if (!canRenderFloat) {
    fail("This GPU can't render to float textures, which the solver needs.");
    return;
  }

  loadParams();
  runSimulation(gl, canvas);
}

function fail(message: string) {
  const note = document.getElementById("mix-fallback");
  if (note) {
    note.textContent = message;
    note.classList.remove("hidden");
  }
  document.getElementById("mix-canvas")?.classList.add("mix-canvas--dead");
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;

/*
 * Hard ceiling on velocity, in velocity-grid texels per second. Vorticity
 * confinement injects energy proportional to the local curl, so without a
 * bound a lively "Swirl" setting can run away in a handful of frames — and a
 * blown-up velocity field makes every advection backtrace land outside the
 * domain, which clamps the whole canvas to one edge colour. This keeps the
 * extreme end of the sliders playable instead of self-destructive.
 */
const float MAX_SPEED = 420.0;
`;

const VERT = `
in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 uTexel;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0);
  vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y);
  vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const COPY = `
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;
void main () { fragColor = texture(uTexture, vUv); }`;

const CLEAR = `
in vec2 vUv;
uniform sampler2D uTexture;
uniform float uValue;
out vec4 fragColor;
void main () { fragColor = texture(uTexture, vUv) * uValue; }`;

/**
 * Semi-Lagrangian advection. The same shader moves velocity and concentration.
 *
 * `uVelTexel` is always the *velocity* grid's texel size, even when advecting
 * the higher-resolution dye: velocity is stored in velocity-grid texels per
 * second, so that's the scale that converts it to UV displacement.
 */
const ADVECT = `
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uVelTexel;
uniform float uDt;
uniform float uDissipation;
out vec4 fragColor;

/*
 * Zero-flux walls. Backtracing past an edge and sampling with CLAMP_TO_EDGE
 * would *invent* material from the border texel — over a minute that quietly
 * drains liquid B out of a closed container and leaves a canvas of pure A.
 * Reflecting the coordinate instead means nothing enters or leaves.
 */
vec2 reflectEdges (vec2 c) {
  c = abs(c);
  return 1.0 - abs(1.0 - c);
}

void main () {
  vec2 coord = reflectEdges(vUv - uDt * texture(uVelocity, vUv).xy * uVelTexel);
  fragColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
}`;

const DIVERGENCE = `
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  // Reflect at the walls so the liquid stays in the glass.
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const CURL = `
in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

/** Vorticity confinement — puts back the curl numerical diffusion eats. */
const VORTICITY = `
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
out vec4 fragColor;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  fragColor = vec4(clamp(vel, -MAX_SPEED, MAX_SPEED), 0.0, 1.0);
}`;

const PRESSURE = `
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
out vec4 fragColor;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  fragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SUBTRACT = `
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
out vec4 fragColor;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  velocity = clamp(velocity, -MAX_SPEED, MAX_SPEED);
  // No flow through the walls of the glass.
  if (vUv.x < uTexel.x * 1.5 || vUv.x > 1.0 - uTexel.x * 1.5) velocity.x = 0.0;
  if (vUv.y < uTexel.y * 1.5 || vUv.y > 1.0 - uTexel.y * 1.5) velocity.y = 0.0;
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

/** Density difference between the two liquids: heavy sinks, light rises. */
const BUOYANCY = `
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform float uStrength;
uniform float uDt;
out vec4 fragColor;
void main () {
  vec2 v = texture(uVelocity, vUv).xy;
  float c = texture(uDye, vUv).x;
  v.y -= (c - 0.5) * uStrength * uDt;
  fragColor = vec4(v, 0.0, 1.0);
}`;

/** Molecular diffusion across the interface — the feathered edge. */
const DIFFUSE = `
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
uniform sampler2D uTexture;
uniform float uAmount;
out vec4 fragColor;
void main () {
  float c = texture(uTexture, vUv).x;
  float n = 0.25 * (texture(uTexture, vL).x + texture(uTexture, vR).x +
                    texture(uTexture, vT).x + texture(uTexture, vB).x);
  fragColor = vec4(mix(c, n, uAmount), 0.0, 0.0, 1.0);
}`;

/**
 * Keeps the glass closed.
 *
 * Semi-Lagrangian advection is not conservative, and with a finite pressure
 * solve the residual divergence slowly eats concentration — left alone the mix
 * settles to a paler shade than the average of what was poured. The top mip
 * level of the dye texture *is* the mean of the whole field, so one textureLod
 * gives the drift for free (no readback, no pipeline stall) and it is pushed
 * back out uniformly.
 *
 * Pouring therefore injects concentrated liquid without inflating the total:
 * fresh streaks keep arriving, but the glass never fills up with one colour.
 */
const CONSERVE = `
in vec2 vUv;
uniform sampler2D uDye;
uniform float uTarget;
out vec4 fragColor;
void main () {
  float mean = textureLod(uDye, vec2(0.5), 24.0).x;
  float c = textureLod(uDye, vUv, 0.0).x;
  fragColor = vec4(clamp(c + (uTarget - mean), 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

const SPLAT_VELOCITY = `
in vec2 vUv;
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec2 uValue;
uniform float uRadius;
uniform float uAspect;
out vec4 fragColor;
void main () {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec2 splat = exp(-dot(p, p) / uRadius) * uValue;
  fragColor = vec4(texture(uTarget, vUv).xy + splat, 0.0, 1.0);
}`;

const SPLAT_DYE = `
in vec2 vUv;
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform float uValue;
uniform float uRadius;
uniform float uAspect;
uniform float uStrength;
out vec4 fragColor;
void main () {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  float a = clamp(exp(-dot(p, p) / uRadius) * uStrength, 0.0, 1.0);
  fragColor = vec4(mix(texture(uTarget, vUv).x, uValue, a), 0.0, 0.0, 1.0);
}`;

/** Initial pour: liquid B resting on top of liquid A, interface roughed up. */
const INIT = `
in vec2 vUv;
uniform float uLevel;
uniform float uSeed;
out vec4 fragColor;

float hash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise (vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm (vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main () {
  float n = fbm(vUv * 3.0 + uSeed);
  float level = uLevel + 0.07 * (n - 0.5) * 2.0 + 0.02 * sin(vUv.x * 9.0 + uSeed);
  float c = smoothstep(level - 0.05, level + 0.05, vUv.y);
  // A couple of faint streaks so the first frame is never flat.
  c += 0.12 * (fbm(vUv * vec2(2.0, 7.0) + uSeed * 1.7) - 0.5);
  fragColor = vec4(clamp(c, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

const DISPLAY = `
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
uniform sampler2D uDye;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uContrast;
uniform float uRelief;
uniform float uGrain;
uniform float uVignette;
uniform float uTime;
out vec4 fragColor;

void main () {
  float c = clamp(texture(uDye, vUv).x, 0.0, 1.0);

  // Interface sharpness: 0 keeps the soft blend, 1 snaps to marbled bands.
  float cc = clamp(0.5 + (c - 0.5) * (1.0 + uContrast * 7.0), 0.0, 1.0);
  vec3 col = mix(uColorA, uColorB, cc);

  // Relief from the concentration gradient — reads as liquid volume.
  float l = texture(uDye, vL).x, r = texture(uDye, vR).x;
  float t = texture(uDye, vT).x, b = texture(uDye, vB).x;
  vec2 g = vec2(r - l, t - b);
  vec3 n = normalize(vec3(-g * 26.0, 1.0));
  float light = clamp(dot(n, normalize(vec3(-0.45, 0.65, 0.62))), 0.0, 1.0);
  col *= mix(1.0, 0.62 + 0.85 * light, uRelief);

  // Finish.
  float grain = fract(sin(dot(vUv * (1.0 + uTime * 0.001), vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * uGrain;
  float d = length((vUv - 0.5) * vec2(1.05, 1.0));
  col *= 1.0 - uVignette * smoothstep(0.25, 0.95, d);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ---------------------------------------------------------------------------
// GL plumbing
// ---------------------------------------------------------------------------

type FBO = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelX: number;
  texelY: number;
  attach: (id: number) => number;
};

type DoubleFBO = { read: FBO; write: FBO; swap: () => void } & Pick<
  FBO,
  "width" | "height" | "texelX" | "texelY"
>;

function runSimulation(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
  // -- program helpers ------------------------------------------------------

  function compile(type: number, source: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, HEADER + source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader), source);
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);

  class Program {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation> = {};

    constructor(fragmentSource: string) {
      this.program = gl.createProgram()!;
      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      // Must happen before linking — every program draws the same fullscreen
      // triangle from attribute slot 0.
      gl.bindAttribLocation(this.program, 0, "aPosition");
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(this.program));
      }
      const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(this.program, i)!.name;
        this.uniforms[name] = gl.getUniformLocation(this.program, name)!;
      }
    }

    use() {
      gl.useProgram(this.program);
      return this.uniforms;
    }
  }

  const programs = {
    copy: new Program(COPY),
    clear: new Program(CLEAR),
    advect: new Program(ADVECT),
    divergence: new Program(DIVERGENCE),
    curl: new Program(CURL),
    vorticity: new Program(VORTICITY),
    pressure: new Program(PRESSURE),
    gradient: new Program(GRADIENT_SUBTRACT),
    buoyancy: new Program(BUOYANCY),
    diffuse: new Program(DIFFUSE),
    splatVelocity: new Program(SPLAT_VELOCITY),
    splatDye: new Program(SPLAT_DYE),
    conserve: new Program(CONSERVE),
    init: new Program(INIT),
    display: new Program(DISPLAY),
  };

  // -- fullscreen triangle pair --------------------------------------------

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function blit(target: FBO | null) {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // -- framebuffers ---------------------------------------------------------

  function createFBO(w: number, h: number, mipmap = false): FBO {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // A mip chain is only needed on the dye, where the top level doubles as a
    // whole-field average for the conservation pass.
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    if (mipmap) gl.generateMipmap(gl.TEXTURE_2D);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const created: FBO = {
      texture,
      fbo,
      width: w,
      height: h,
      texelX: 1 / w,
      texelY: 1 / h,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };

    allocated.push(created);
    return created;
  }

  /** Zero (or scale) a target without sampling the texture we're writing to. */
  function clearFBO(target: FBO) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function createDoubleFBO(w: number, h: number, mipmap = false): DoubleFBO {
    let fbo1 = createFBO(w, h, mipmap);
    let fbo2 = createFBO(w, h, mipmap);
    return {
      width: w,
      height: h,
      texelX: 1 / w,
      texelY: 1 / h,
      get read() {
        return fbo1;
      },
      set read(v) {
        fbo1 = v;
      },
      get write() {
        return fbo2;
      },
      set write(v) {
        fbo2 = v;
      },
      swap() {
        const t = fbo1;
        fbo1 = fbo2;
        fbo2 = t;
      },
    };
  }

  let velocity: DoubleFBO;
  let dye: DoubleFBO;
  let divergence: FBO;
  let curl: FBO;
  let pressure: DoubleFBO;
  let allocated: FBO[] = [];

  /**
   * The concentration the closed glass should always average out to. The
   * initial pour puts liquid B above `level` and liquid A below it, so the
   * mean is the fraction of the canvas above the line.
   */
  let targetMean = 1 - params.level;

  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

  /**
   * Sim grids follow the viewport's aspect so splats stay round.
   *
   * The aspect is clamped hard: during a window resize the drawing buffer can
   * momentarily report something degenerate (a 1×358 buffer was enough to ask
   * for a 128×45824 texture, which fails to allocate and leaves every
   * framebuffer unusable). Clamping means a bad frame costs a slightly wrong
   * aspect for one resize tick instead of killing the simulation.
   */
  function resolution(size: number) {
    const bw = gl.drawingBufferWidth;
    const bh = gl.drawingBufferHeight;
    const ratio = bw > 0 && bh > 0 ? bw / bh : 1;
    const aspect = Math.min(Math.max(ratio, 1 / 3), 3);

    const min = Math.round(size);
    const max = Math.round(size * (aspect >= 1 ? aspect : 1 / aspect));
    const dims = aspect >= 1 ? { w: max, h: min } : { w: min, h: max };

    return {
      w: Math.max(2, Math.min(dims.w, maxTextureSize)),
      h: Math.max(2, Math.min(dims.h, maxTextureSize)),
    };
  }

  /**
   * (Re)allocate every grid. `preserve` carries the current mix across a
   * window resize — the old dye is resampled into the new texture — so
   * resizing doesn't throw away whatever the liquids were doing.
   */
  function initFramebuffers(preserve = false) {
    const previous = allocated;
    const oldDye = preserve && dye ? dye.read : null;
    allocated = [];

    const sim = resolution(params.simRes);
    const dyeRes = resolution(params.dyeRes);
    velocity = createDoubleFBO(sim.w, sim.h);
    pressure = createDoubleFBO(sim.w, sim.h);
    divergence = createFBO(sim.w, sim.h);
    curl = createFBO(sim.w, sim.h);
    dye = createDoubleFBO(dyeRes.w, dyeRes.h, true);

    if (oldDye) {
      const u = programs.copy.use();
      gl.uniform1i(u.uTexture, oldDye.attach(0));
      gl.uniform2f(u.uTexel, dye.texelX, dye.texelY);
      blit(dye.write);
      dye.swap();
      clearFBO(velocity.read);
      clearFBO(velocity.write);
      clearFBO(pressure.read);
      clearFBO(pressure.write);
    } else {
      resetLiquids();
    }

    for (const old of previous) {
      gl.deleteTexture(old.texture);
      gl.deleteFramebuffer(old.fbo);
    }
  }

  let pourSeed = Math.random() * 100;

  /**
   * `reseed` is false while the level slider is being dragged, so the interface
   * slides up and down instead of the whole pattern jumping on every input.
   */
  function resetLiquids(reseed = true) {
    if (reseed) pourSeed = Math.random() * 100;
    targetMean = Math.min(Math.max(1 - params.level, 0), 1);

    const u = programs.init.use();
    gl.uniform1f(u.uLevel, params.level);
    gl.uniform1f(u.uSeed, pourSeed);
    gl.uniform2f(u.uTexel, dye.texelX, dye.texelY);
    blit(dye.write);
    dye.swap();

    // Still liquid to start with.
    clearFBO(velocity.read);
    clearFBO(velocity.write);
    clearFBO(pressure.read);
    clearFBO(pressure.write);

    // Seed the stirrer *on* its path, otherwise the first frame sees a jump of
    // up to a quarter of the canvas and kicks in a huge impulse.
    stirTime = Math.random() * 100;
    const seed = stirPosition(stirTime);
    stirX = seed.x;
    stirY = seed.y;
  }

  // -- splats ---------------------------------------------------------------

  function splatVelocity(x: number, y: number, dx: number, dy: number, radius: number) {
    const u = programs.splatVelocity.use();
    gl.uniform1i(u.uTarget, velocity.read.attach(0));
    gl.uniform1f(u.uAspect, canvas.width / canvas.height);
    gl.uniform2f(u.uPoint, x, y);
    gl.uniform2f(u.uValue, dx, dy);
    gl.uniform1f(u.uRadius, radius);
    gl.uniform2f(u.uTexel, velocity.texelX, velocity.texelY);
    blit(velocity.write);
    velocity.swap();
  }

  function splatDye(x: number, y: number, value: number, radius: number, strength: number) {
    const u = programs.splatDye.use();
    gl.uniform1i(u.uTarget, dye.read.attach(0));
    gl.uniform1f(u.uAspect, canvas.width / canvas.height);
    gl.uniform2f(u.uPoint, x, y);
    gl.uniform1f(u.uValue, value);
    gl.uniform1f(u.uRadius, radius);
    gl.uniform1f(u.uStrength, strength);
    gl.uniform2f(u.uTexel, dye.texelX, dye.texelY);
    blit(dye.write);
    dye.swap();
  }

  // -- step -----------------------------------------------------------------

  function step(dt: number) {
    gl.disable(gl.BLEND);

    // Density-driven convection: heavy liquid falls, light liquid climbs.
    if (params.buoyancy !== 0) {
      const u = programs.buoyancy.use();
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(u.uDye, dye.read.attach(1));
      // Velocities are in texels/second, so useful accelerations are tens, not
      // thousands: with viscosity ~0.3 the terminal speed is roughly strength/0.6.
      gl.uniform1f(u.uStrength, params.buoyancy);
      gl.uniform1f(u.uDt, dt);
      gl.uniform2f(u.uTexel, velocity.texelX, velocity.texelY);
      blit(velocity.write);
      velocity.swap();
    }

    // Vorticity confinement.
    if (params.vorticity > 0) {
      let u = programs.curl.use();
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      gl.uniform2f(u.uTexel, velocity.texelX, velocity.texelY);
      blit(curl);

      u = programs.vorticity.use();
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(u.uCurl, curl.attach(1));
      // Confinement amplifies at roughly `strength` per second. It is allowed
      // to outrun the viscous decay — that's what keeps the filaments alive —
      // because MAX_SPEED, not dissipation, is what bounds the field.
      gl.uniform1f(u.uCurlStrength, params.vorticity * 0.045);
      gl.uniform1f(u.uDt, dt);
      gl.uniform2f(u.uTexel, velocity.texelX, velocity.texelY);
      blit(velocity.write);
      velocity.swap();
    }

    // Projection: make the velocity field divergence-free (incompressible).
    let u = programs.divergence.use();
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform2f(u.uTexel, velocity.texelX, velocity.texelY);
    blit(divergence);

    u = programs.clear.use();
    gl.uniform1i(u.uTexture, pressure.read.attach(0));
    gl.uniform1f(u.uValue, 0.8);
    gl.uniform2f(u.uTexel, pressure.texelX, pressure.texelY);
    blit(pressure.write);
    pressure.swap();

    u = programs.pressure.use();
    gl.uniform1i(u.uDivergence, divergence.attach(0));
    gl.uniform2f(u.uTexel, pressure.texelX, pressure.texelY);
    for (let i = 0; i < params.iterations; i++) {
      gl.uniform1i(u.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    u = programs.gradient.use();
    gl.uniform1i(u.uPressure, pressure.read.attach(0));
    gl.uniform1i(u.uVelocity, velocity.read.attach(1));
    gl.uniform2f(u.uTexel, velocity.texelX, velocity.texelY);
    blit(velocity.write);
    velocity.swap();

    // Transport. Both passes backtrace with the velocity grid's texel size.
    u = programs.advect.use();
    gl.uniform2f(u.uVelTexel, velocity.texelX, velocity.texelY);
    gl.uniform2f(u.uTexel, velocity.texelX, velocity.texelY);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uSource, velocity.read.attach(0));
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uDissipation, params.viscosity);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uSource, dye.read.attach(1));
    gl.uniform1f(u.uDissipation, 0);
    blit(dye.write);
    dye.swap();

    // Molecular diffusion across the interface.
    if (params.diffusion > 0) {
      const d = programs.diffuse.use();
      gl.uniform1i(d.uTexture, dye.read.attach(0));
      gl.uniform1f(d.uAmount, Math.min(params.diffusion * dt * 30, 1));
      gl.uniform2f(d.uTexel, dye.texelX, dye.texelY);
      blit(dye.write);
      dye.swap();
    }

    // Put back whatever the solver lost this frame.
    const c = programs.conserve.use();
    dye.read.attach(0);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform1i(c.uDye, 0);
    gl.uniform1f(c.uTarget, targetMean);
    gl.uniform2f(c.uTexel, dye.texelX, dye.texelY);
    blit(dye.write);
    dye.swap();
  }

  // -- automatic motion -----------------------------------------------------

  let stirTime = Math.random() * 100;

  /** Two detuned frequencies, so the stirrer never retraces the same loop. */
  function stirPosition(t: number) {
    const a = t * 0.8;
    const b = t * 0.31 + 1.3;
    return {
      x: 0.5 + 0.26 * Math.cos(a) * (0.6 + 0.4 * Math.cos(b)),
      y: 0.5 + 0.26 * Math.sin(a) * (0.6 + 0.4 * Math.sin(b * 1.13)),
    };
  }

  let stirX = stirPosition(stirTime).x;
  let stirY = stirPosition(stirTime).y;
  let pourPhase = Math.random() * 100;

  function autoStir(dt: number) {
    if (params.stir <= 0 || params.stirSpeed <= 0) return;
    stirTime += dt * params.stirSpeed;
    const { x: nx, y: ny } = stirPosition(stirTime);
    // The delta is already proportional to dt, so this force is frame-rate safe.
    const dx = (nx - stirX) * 900 * params.stir;
    const dy = (ny - stirY) * 900 * params.stir;
    stirX = nx;
    stirY = ny;
    splatVelocity(nx, ny, dx, dy, 0.01);
  }

  function autoPour(dt: number) {
    if (params.pour <= 0) return;
    pourPhase += dt;
    const x = 0.5 + 0.16 * Math.sin(pourPhase * 0.37) * Math.cos(pourPhase * 0.11);
    const y = 0.96;
    splatDye(x, y, 1, 0.0015, Math.min(params.pour * dt * 10, 1));
    splatVelocity(x, y, 0, -300 * params.pour * dt, 0.0015);
  }

  // -- pointer --------------------------------------------------------------

  let pointerDown = false;
  let lastX = 0;
  let lastY = 0;

  function toUv(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: 1 - (e.clientY - rect.top) / rect.height,
    };
  }

  canvas.addEventListener("pointerdown", (e) => {
    pointerDown = true;
    const p = toUv(e);
    lastX = p.x;
    lastY = p.y;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointerDown) return;
    const p = toUv(e);
    splatVelocity(p.x, p.y, (p.x - lastX) * 900, (p.y - lastY) * 900, 0.008);
    lastX = p.x;
    lastY = p.y;
  });

  const release = () => {
    pointerDown = false;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener("dblclick", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    splatDye(x, y, 1, 0.004, 1);
    splatVelocity(x, y, 0, -120, 0.004);
  });

  // -- render ---------------------------------------------------------------

  let captureRequest: ((blob: Blob | null) => void) | null = null;
  let elapsed = 0;

  function render() {
    const u = programs.display.use();
    gl.uniform1i(u.uDye, dye.read.attach(0));
    const a = hexToRgb(params.colorA);
    const b = hexToRgb(params.colorB);
    gl.uniform3f(u.uColorA, a[0], a[1], a[2]);
    gl.uniform3f(u.uColorB, b[0], b[1], b[2]);
    gl.uniform1f(u.uContrast, params.contrast);
    gl.uniform1f(u.uRelief, params.relief);
    gl.uniform1f(u.uGrain, params.grain);
    gl.uniform1f(u.uVignette, params.vignette);
    gl.uniform1f(u.uTime, elapsed);
    gl.uniform2f(u.uTexel, dye.texelX, dye.texelY);
    blit(null);
  }

  // -- resize ---------------------------------------------------------------

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    // Layout hasn't settled — keep the buffers we have rather than rebuilding
    // them around a size that is about to change again.
    if (w < 16 || h < 16) return false;
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w;
    canvas.height = h;
    return true;
  }

  resize();
  initFramebuffers();

  // -- loop -----------------------------------------------------------------

  let last = performance.now();

  function frame(now: number) {
    // Checked per frame rather than from a resize event: a page that is laid
    // out while hidden reports a zero-width canvas, and rAF only runs once it
    // becomes visible — so this is the first moment a real size is knowable.
    if (resize()) initFramebuffers(true);

    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(raw, 1 / 30) * params.speed;

    if (!paused) {
      elapsed += dt;
      autoStir(dt);
      autoPour(dt);
      step(dt);
    }
    render();

    if (captureRequest) {
      const done = captureRequest;
      captureRequest = null;
      canvas.toBlob((blob) => done(blob), "image/png");
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // -- panel wiring ---------------------------------------------------------

  bindPanel({
    onResolutionChange: () => initFramebuffers(true),
    onReset: () => resetLiquids(),
    onLevelChange: () => resetLiquids(false),
    onStir: () => {
      for (let i = 0; i < 12; i++) {
        const x = Math.random();
        const y = Math.random();
        splatVelocity(x, y, (Math.random() - 0.5) * 500, (Math.random() - 0.5) * 500, 0.01);
      }
    },
    onCapture: (done) => {
      captureRequest = done;
    },
  });
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type PanelHooks = {
  onResolutionChange: () => void;
  onReset: () => void;
  onLevelChange: () => void;
  onStir: () => void;
  onCapture: (done: (blob: Blob | null) => void) => void;
};

function bindPanel(hooks: PanelHooks) {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-param]"),
  );

  function syncInputs() {
    for (const input of inputs) {
      const key = input.dataset.param as keyof MixParams;
      const value = params[key];
      if (value === undefined) continue;
      input.value = String(value);
      updateOutput(input);
    }
    applyHalo();
  }

  function updateOutput(input: HTMLInputElement | HTMLSelectElement) {
    const out = input.parentElement?.parentElement?.querySelector<HTMLElement>("[data-output]");
    if (out && input.type === "range") {
      const n = Number(input.value);
      out.textContent = Number.isInteger(n) ? String(n) : n.toFixed(2);
    }
  }

  function applyHalo() {
    const halo = document.getElementById("mix-halo");
    if (halo) halo.style.opacity = String(params.halo);
  }

  for (const input of inputs) {
    input.addEventListener("input", () => {
      const key = input.dataset.param as keyof MixParams;
      const raw = input.value;
      (params as Record<string, unknown>)[key] =
        input.type === "color" ? raw : Number(raw);
      updateOutput(input);
      if (key === "halo") applyHalo();
      if (key === "simRes" || key === "dyeRes") hooks.onResolutionChange();
      if (key === "level") hooks.onLevelChange();
      saveParams();
    });
  }

  // Presets and brand swatches.
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      Object.assign(params, PRESETS[button.dataset.preset!] ?? {});
      syncInputs();
      saveParams();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-swatch]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.target === "b" ? "colorB" : "colorA";
      params[target] = button.dataset.swatch!;
      syncInputs();
      saveParams();
    });
  });

  document.querySelector("[data-action='swap']")?.addEventListener("click", () => {
    const a = params.colorA;
    params.colorA = params.colorB;
    params.colorB = a;
    syncInputs();
    saveParams();
  });

  document.querySelector("[data-action='reset']")?.addEventListener("click", hooks.onReset);
  document.querySelector("[data-action='stir']")?.addEventListener("click", hooks.onStir);

  document.querySelector("[data-action='defaults']")?.addEventListener("click", () => {
    Object.assign(params, DEFAULTS);
    syncInputs();
    saveParams();
    hooks.onResolutionChange();
  });

  document.querySelector("[data-action='randomize']")?.addEventListener("click", () => {
    const r = (min: number, max: number) => min + Math.random() * (max - min);
    Object.assign(params, {
      viscosity: r(0, 1.2),
      diffusion: r(0, 0.35),
      vorticity: r(0, 45),
      buoyancy: r(-40, 60),
      stir: r(0.1, 1),
      stirSpeed: r(0.15, 1.2),
      pour: r(0, 0.6),
      contrast: r(0, 0.6),
      relief: r(0.2, 0.9),
      level: r(0.35, 0.8),
    });
    syncInputs();
    saveParams();
    hooks.onReset();
  });

  const pauseButton = document.querySelector<HTMLButtonElement>("[data-action='pause']");
  pauseButton?.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Play" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(paused));
  });

  document.querySelector("[data-action='save']")?.addEventListener("click", () => {
    hooks.onCapture((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sobremesa-mix-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  const copyButton = document.querySelector<HTMLButtonElement>("[data-action='copy']");
  copyButton?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(params, null, 2));
    const original = copyButton.textContent;
    copyButton.textContent = "Copied";
    window.setTimeout(() => (copyButton.textContent = original), 1200);
  });

  // Collapse / expand.
  //
  // The *default* state is CSS-driven (open on desktop, collapsed on mobile so
  // the wordmark is never covered) — deliberately not decided in JS at load,
  // because the viewport can still be settling when the module runs. Only an
  // explicit toggle writes the classes, and it writes both so either media
  // query resolves the same way.
  const panel = document.getElementById("mix-panel");
  const toggle = document.querySelector<HTMLButtonElement>("[data-action='toggle']");
  const desktop = window.matchMedia("(min-width: 768px)");

  function isOpen() {
    if (!panel) return false;
    if (panel.classList.contains("is-open")) return true;
    if (panel.classList.contains("is-collapsed")) return false;
    return desktop.matches;
  }

  function setOpen(open: boolean) {
    panel?.classList.toggle("is-open", open);
    panel?.classList.toggle("is-collapsed", !open);
    toggle?.setAttribute("aria-expanded", String(open));
  }

  const syncExpandedAttr = () => toggle?.setAttribute("aria-expanded", String(isOpen()));
  desktop.addEventListener("change", syncExpandedAttr);
  syncExpandedAttr();

  toggle?.addEventListener("click", () => setOpen(!isOpen()));

  window.addEventListener("keydown", (e) => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return;
    if (e.key === "h") setOpen(!isOpen());
    if (e.key === " ") {
      e.preventDefault();
      pauseButton?.click();
    }
    if (e.key === "r") hooks.onReset();
  });

  syncInputs();
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function saveParams() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    /* private mode — settings just won't persist */
  }
}

function loadParams() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored) as Partial<MixParams>;
    for (const key of Object.keys(DEFAULTS) as (keyof MixParams)[]) {
      if (parsed[key] !== undefined) (params as Record<string, unknown>)[key] = parsed[key];
    }
  } catch {
    /* corrupt payload — fall back to defaults */
  }
}

// Kick off last: the shader sources above are `const`, so calling earlier would
// hit the temporal dead zone.
const mixCanvas = document.getElementById("mix-canvas") as HTMLCanvasElement | null;
if (mixCanvas) start(mixCanvas);
