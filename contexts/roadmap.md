# Sobremesa London — Incremental "Wow" Roadmap

The hero looks, at first glance, like just another AI-generated photo. This roadmap turns that assumption into the trap: six increments, each adding one layer of delight the previous one made possible, until the photo itself comes apart and becomes the layout. Each increment ships as a complete experience — nothing here depends on a future step to feel finished.

Companion document: [visual-dna.md](visual-dna.md) — the lighting/palette DNA every generated asset must follow.

---

## Guiding principles

- **Cluttercore maximalism, engineered.** Density and surprise on the surface; a small, disciplined system underneath.
- **The photo is the interface.** Every effect deepens the illusion that the scene is real, present, and aware of the visitor.
- **HTML-ness is non-negotiable.** The wordmark and all copy stay real, selectable, indexable text at every increment.
- **Progressive enhancement ladder.** Static photo → tilt → living light → per-pixel depth → real layers → scatter. Each rung is the complete site for the devices/browsers that stop there.

## Tech stance

- **Stay on Astro 5.** Zero-JS baseline plus islands is exactly the right chassis for a ladder of optional enhancements. No framework refactor needed at any increment.
- **Increments 1–4: hand-rolled, dependency-free.** One vanilla script (the Scene Rig) plus CSS custom properties covers pointer/scroll/light. The depth effect is a ~120-line raw WebGL shader — no three.js.
- **Increments 5–6: adopt GSAP ScrollTrigger.** Scrub-timelines with pinning, staggered choreography and seeking are where hand-rolled code stops paying for itself. Native `animation-timeline: scroll()` still lacks cross-browser coverage, so GSAP is the maximum-compatibility choice for the scatter.
- **Performance budget (all increments):** animate `transform`/`opacity` only; one shared `requestAnimationFrame` loop with lerped values; `will-change` only on actively animated layers; device-pixel-ratio capped at 2 for canvas work.
- **Accessibility (all increments):** `prefers-reduced-motion: reduce` collapses everything to the current static hero; text always real; decorative clones/cutouts `aria-hidden`.
- **Mobile:** `deviceorientation` (gyro) stands in for pointer position; scroll-driven effects work as-is; effects degrade rung by rung, never break.

---

## The spine: the Scene Rig (built in Increment 1, never rebuilt)

A single vanilla script that observes pointer, scroll and (later) light position, lerps them, and writes normalized CSS custom properties on `:root`:

| Variable | Range | Meaning |
|---|---|---|
| `--pointer-x`, `--pointer-y` | −1 … 1 | Smoothed pointer/gyro position relative to viewport center |
| `--scroll-progress` | 0 … 1 | Progress through the hero's scroll runway |
| `--light-x`, `--light-y` | 0 … 1 | The light source's position in image space (set per image, Increment 3+) |

Every visual effect in every increment is a *declarative consumer* of these variables (CSS `calc()` transforms, gradient positions, shadow offsets) or reads them once per frame (the WebGL shader, GSAP). One source of truth means the text, the photo, the glow, the flare and the shadows always agree about where the visitor and the sun are — that coherence is what makes the tricks read as physical rather than gimmicky.

---

## Increment 1 — The Tilt · *"the room breathes"*

**The idea (yours, #1):** text tilts over the image following the mouse; the image tilts subtly in counterpoint.

**Experience.** The page appears static. The first mouse movement betrays it: the wordmark leans toward the cursor like a card held in the hand, and the room behind drifts a beat later, slightly against it. Nothing announces the effect — visitors discover it.

**Build.**
- `perspective: 1000px` on `<main>`; the wordmark block gets `rotateX`/`rotateY` up to ~6° driven by `--pointer-x/y`.
- The photo counter-drifts: `scale(1.06)` (to hide edges) + small translate, lerped at a *slower* rate than the text. The speed mismatch between layers is what sells depth — do not tune them equal.
- Surprise beat: the existing radial glow follows the pointer a few percent, as if the visitor carries a candle into the room.
- Files: `src/pages/index.astro`, new `src/scripts/scene-rig.ts`, `src/styles/global.css`.

**Assets.** None.

**Risks.** None — pure enhancement over the shipped page.

---

## Increment 2 — Embossed HTML · *"type you can pinch"*

**The idea (yours, #2):** 3D-ness for the text — extrusion and light — without losing selectability.

**Experience.** As the wordmark tilts, it reveals thickness: SOBREMESA is extruded, its flank shaded, a specular highlight sweeping across the letterforms as the angle changes. Visitors triple-click and — it's just text. That contradiction is the wow.

**Build.**
- Extrusion: a stack of layered `text-shadow`s whose offset vector is computed (CSS `calc()`) from `--light-x/y` and current tilt — shadows always fall *away* from the light, so when Increment 3 lands, the type automatically obeys the photographed sun.
- Specular sweep: a `background-clip: text` gradient whose hot spot tracks the light across the glyphs.
- Stretch option: true 3D extrusion via a few `aria-hidden` clones stacked in `translateZ` inside `transform-style: preserve-3d`.

**Assets.** None.

**Risks (known, must design around).** 3D transform contexts flatten `mix-blend-mode` on children — the current `plus-lighter` overlap between SOBREMESA and *london* will break inside `preserve-3d`. Two exits: keep the blend group isolated *outside* the 3D context (tilt its wrapper only), or reproduce the crossing-strokes highlight explicitly with a clipped gradient where the scripts overlap.

---

## Increment 3 — The Living Light · *"the photo looks back"*

**The idea (yours, #3):** make the image's light source truly interactive, up to overshining into the visitor's POV.

**Experience.** A new hero image puts the low sun *in frame*, flaring through the garden doors. The flare is alive: it blooms when the pointer approaches it, glints across the glassware, and as the visitor starts to scroll it swells until it overexposes the whole viewport — the site's signature transition, later reused to hide the seams of Increments 5–6.

**Build.**
- Set `--light-x/y` per image (hand-placed constant in image metadata).
- A DOM light anchored at the source: 2–3 layered radial gradients with `screen`/`plus-lighter` blends, plus halation rings and a horizontal anamorphic streak. Intensity = f(pointer proximity, `--scroll-progress`).
- The overshine: past a scroll threshold, the bloom's scale/opacity ramps to a warm-white flood of the viewport, then resolves into whatever comes next.
- Increment 2's text shading now reads the *real* light position — one sun governs the page.

**Assets.** New hero image — **KREA Prompt A** below. Current [cover.png](../src/assets/cover.png) has POV-facing shadows but no visible source; the new image must show it.

**Risks.** Blend-mode stacking over a bright image can wash out the wordmark — keep the text layer isolated from the flare stack (same pattern as the current glow/text separation in `index.astro`).

---

## Increment 4 — Depth · *"per-pixel parallax"*

**The idea (yours, #4):** depth-map the image for extra 3D-ness.

**Experience.** The tilt stops being a flat card trick: the carafe slides against the window, near plates move more than far bookshelves. The photo behaves like a diorama shot through a real lens.

**Build.**
- Generate a grayscale depth map of the (new) hero — KREA's depth output, or Depth Anything locally.
- A dependency-free WebGL fragment shader (~120 lines): one quad, two textures (photo + depth), UVs displaced by `depth × pointer`. Reads the rig's pointer values once per frame.
- The canvas layer replaces the flat `<img>` **only when WebGL is available**; the `<img>` remains in the DOM as fallback and LCP element.
- Micro-parallax (shader) composes with macro tilt (Increment 1) — keep shader displacement small (~1.5% UV max) so the two never fight.

**Assets.** Depth map derived from the Increment 3 hero (this is why the new image lands *before* this increment).

**Risks.** Displacement artifacts at strong depth edges (glass stems, chair backs) — mitigate with small amplitude and a slightly blurred depth map.

---

## Increment 5 — Layers · *"the room comes apart"*

**The idea (yours, #5):** proper parallax that splits the image into real planes — table, background, extra plants in between.

**Experience.** What the depth map faked, this makes real. The scene is now three-plus physical planes: on pointer they slide at different rates; on scroll they begin to pull apart vertically, and new foliage — never in the original photo — peeks in from between the planes. The room is deeper than the photograph ever was.

**Build.**
- Planes (back to front): **background room plate** (table removed via inpainting), **midground** (chairs + new interstitial plant cutouts), **foreground** (table + tableware).
- The Increment 4 depth shader keeps running, now on the background plate only (micro-parallax inside the far plane).
- **Adopt GSAP ScrollTrigger here** for the scroll choreography; pointer parallax stays on the rig's CSS variables.

**Assets.**
- Background plate: KREA edit/inpaint of the hero — **Prompt B**.
- Interstitial plants/foliage: **Prompt C** set (plant items).

**Risks.** Inpainting quality behind the table decides whether the plate reads as the same room — budget iteration time on Prompt B; the Increment 3 overshine can also cover residual seams during the split.

---

## Increment 6 — Sobremesa Scatter · *"cluttercore explosion"*

**The idea (yours, #6):** on scroll, cups and plates leave the table as separate elements and crowd the rest of the content, cluttercore-style — books, frames and plants joining in.

**Experience.** The maximalist payoff. The hero pins; scrolling lifts the tableware off the table one object at a time — a wine glass drifts up and left, rotating slowly; the napkin tumbles; the carafe catches the flare as it passes it. As the visitor continues, the objects don't vanish: they *settle as the decorative clutter framing the actual content sections* (about / manifesto / signup). The aftermath of the meal literally becomes the page layout. Background books, frames and plants peel off last and shelve themselves in the margins.

**Build.**
- Sticky/pinned hero + long scroll runway; one master GSAP ScrollTrigger scrub timeline with per-object staggers (position, rotation, scale), each object a `transform`-only layer.
- The swap from full photo to layered/cleared state happens *inside* the Increment 3 overshine flash — the seam is never visible.
- Objects land at deterministic positions inside the content sections below, becoming their frames and dividers.

**Assets.**
- Object cutouts: primary strategy is **cutting the objects from the hero itself** (best light/grain consistency) and inpainting the holes they leave (extend Prompt B's cleared-table plate). Fallback/extension: generate matching look-alike objects with **Prompt C**.
- Background clutter (book stacks, frames, plants): Prompt C items.

**Risks.** Compositing many translucent PNG layers is the main perf risk — keep cutouts tightly cropped, pre-scaled, and limit simultaneously-animating layers (~12); freeze layers once settled.

---

## Asset production — KREA prompts

All prompts follow the [visual-dna.md](visual-dna.md) constraints: absolute human absence, traces of life ("organized chaos"), the lighting architecture DNA, single descriptive English string.

### Prompt A — new hero with a visible light source (Increment 3)

```
A long timber dining table in the glazed rear extension of a Victorian terrace in West London, the aftermath of a lunch for eight left exactly where it ended, smudged wine glasses, a half-empty glass carafe, tilted cutlery resting across finished plates, crumpled linen napkins, an espresso cup with a dried crema ring, breadcrumbs on the grain of the wood, the place where they ate centered in the frame with the angle open enough to reveal the layered room behind, the camera facing the garden doors where a low golden sun sits visible in frame and flares directly into the lens with pronounced halation and blooming specular highlights that rake across the tabletop toward the viewer, casting long dense shadows with crushed black levels, warm 3500K golden-hour light and a 2700K tungsten practical lamp glowing against cool 5800K ambient daylight spilling from the skylight in a strict warm-cool split, a cluttercore background dense with stacked books, framed photographs hung edge to edge and trailing houseplants on crowded shelves, desaturated earth-toned palette of low-luminance umbers, ochres and olive greens against muted cerulean mid-tones with heavily restrained saturation, extreme textural contrast between porous matte ceramics and linen and the sharp specular refraction of vitreous glass and metal, deep depth of field with crisp planar focus and atmospheric perspective, fine high-frequency film grain and perceptible luminance noise in the underexposed shadow gradients, cinematic, bright, minimal geometric lens distortion, no people, no shadows or reflections of people
```

### Prompt B — cleared background plate (Increment 5, via KREA edit/inpaint on the chosen hero)

```
Remove the dining table and everything on it, the chairs pulled up to it, and reconstruct the room behind them, continuing the timber floorboards, the lower walls, the crowded bookshelves, the framed photographs and the trailing houseplants exactly in the style of the surrounding image, preserving the low golden sun flaring through the garden doors, the long dense shadows with crushed black levels, the warm-cool split between 3500K sunlight, 2700K tungsten lamp glow and 5800K skylight daylight, the desaturated umber, ochre and olive palette, and the fine high-frequency film grain, no people, no shadows or reflections of people
```

### Prompt C — object cutout set (Increments 5–6)

One generation per object; swap the subject phrase. Subjects to produce: smudged wine glass with the dregs of red wine · finished plate with tilted cutlery and crumbs · half-empty glass carafe · espresso cup with a dried crema ring on its saucer · crumpled linen napkin · leaning stack of worn hardback books · trailing potted houseplant (pothos or similar) · small framed black-and-white photograph.

```
A single [SUBJECT], slightly used and imperfect with the honest traces of a long shared meal, centered and fully visible on a plain seamless neutral warm-grey background, lit by a low golden 3500K sun from behind and to one side so the rim light blooms with pronounced halation and sharp specular highlights against cool 5800K ambient fill in a strict warm-cool split, long dense shadow with crushed black levels falling toward the camera, desaturated earth-toned palette with heavily restrained saturation, extreme textural contrast between porous matte surfaces and sharp vitreous or metallic reflections, crisp planar focus, fine high-frequency film grain and perceptible luminance noise in the shadow gradients, cinematic, minimal geometric lens distortion, photographed for clean isolation and cutout, no people, no hands, no shadows or reflections of people
```

**Consistency tip:** generate Prompt C items *after* the Prompt A hero is chosen, and feed the hero as a style/image reference in KREA so grain, palette and sun angle match. For Increment 6's primary strategy (cutting objects directly out of the hero), Prompt C is the fallback for objects that don't cut cleanly and the source for *extra* clutter the photo never contained.

---

## Sequence and dependencies at a glance

| # | Increment | Depends on | New assets | New tech |
|---|---|---|---|---|
| 1 | The Tilt | — | — | Scene Rig (vanilla) |
| 2 | Embossed HTML | 1 (rig) | — | CSS-only |
| 3 | The Living Light | 1 (rig) | **Prompt A hero** | CSS blend/flare stack |
| 4 | Depth | 3 (final image) | Depth map of new hero | Raw WebGL shader |
| 5 | Layers | 3, 4 | **Prompt B plate**, Prompt C plants | GSAP ScrollTrigger |
| 6 | Sobremesa Scatter | 3, 5 | Hero cutouts + Prompt C set | GSAP master timeline |

The one ordering rule that matters: **the new hero image (Increment 3) must be locked before Increments 4–6**, because the depth map, the background plate and the object cutouts all derive from it.
