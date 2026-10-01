# The homepage story

After Featured Projects, the homepage tells one continuous story in a single section: the deck of competency cards, the living room, five worlds, and "Let's work together." This page documents the engine every act plugs into. The creative direction and the beat-by-beat script live with the project brief; the beat table itself is code (`components/story/engine/timeline.ts`).

Read `docs/animation-system.md` (the gotchas) before touching any of this.

## The two versions

The section's server HTML carries both versions of the story, and an inline script in the root layout's head picks one before the first paint:

- **The WebGL story** (`html[data-story-mode="gl"]`): on `/`, with motion allowed, no `?nostory`, not given up earlier in this tab, and a hardware WebGL2 context (the same probe as `reel/gl/webgl-probe.ts`: `failIfMajorPerformanceCaveat`, then the renderer string checked against software rasterisers).
- **The storybook** (anything else): the same content told in the DOM in about three to four screens. The Competencies title and line, the four cards as real links to the focus pages, six moments of the story as stills with a caption each, and the finale block. It is the default, so visitors without JavaScript, crawlers, CI, Lighthouse and reduced-motion visitors all see it.

The WebGL story can still hand the visit to the storybook: a lost context, a renderer too slow for any tier (the warm-up or the hopeless watch), a failed build, the 6 s visible-time start failsafe, or reduced motion switched on mid-visit. The host then flips `html[data-story-mode]` to `dom` and scrolls to the storybook's matching place (the cards, the matching still, or the finale). A lost context or a hopeless renderer also sets `sessionStorage` `mgm:story` to `dom`, so the rest of the tab keeps the storybook.

## Files

```
components/story/
  story-section.tsx      <section id="story">: the layer host, the storybook, the shell, the host
  story-shell.tsx        the WebGL version's DOM: entrance screen, spacer, finale screen, screen-reader mirror
  story-host.tsx         client: starts, attaches and stops the engine; the fallback; mounts the overlay
  story-overlay.tsx      the fixed overlay: hint, HUD caption, skip control, hotspots, dev HUD
  finale-block.tsx       "Let's work together." with its one action
  storybook/             the DOM version (cards, stand-in art for the stills)
  story.css              both versions, the entrance geometry, the storybook's cards and panels
  engine/
    timeline.ts          THE beat table, and everything computed from it
    frame.ts             the shared room frame (table, box spot, card stage, landing shot, sizes)
    act.ts               the act contract and the pure scroll helpers
    stage.ts             renderer, canvas layer, camera, composition, sizing, context loss
    backdrop.ts          the page colour backdrop and its dissolve
    post.ts              bloom, vignette, grain, flash and fade in one composite
    director.ts          scroll position to story state, auto-advance, freeze, locks, skip, resize
    scroll-intent.ts     real-input arming (the reel's rules)
    pointer.ts           NDC pointer, raycasts, routed taps
    dom-glue.ts          anchor rects once a frame, plane-to-rect glue, projections
    overlay-store.ts     the overlay's state (framework free)
    header-tone.ts       the header's ink over the story
    flow-yield.ts        the cursor flow steps aside while the story covers the page
    quality.ts           tiers, the warm-up judge, the governor, the hopeless watch
    story-engine.ts      the build pipeline and the module-level engine
    palette.ts, props.ts, labels.ts
  assets/
    types.ts             the asset contract (StoryFile, StoryLoaderLike)
    files-<group>.ts     each asset package's file list (deck, room, character, letters, worlds, stills)
    manifest.ts          every file, by tier and group
    cache.ts             the byte cache with progress (no three.js)
    loaders.ts           StoryLoaderLike over the cache: glTF, meshopt, KTX2, images, JSON
  acts/{cards,room,worlds,finale}/index.ts   one act each (placeholders until wave 2)
components/loader/
  boot.ts, boot-script.tsx   the pre-paint decisions
  loader-core.ts             what the loader waits for and when it goes
  site-loader.tsx            the host: visibility, progressbar, live region
  loader-view.tsx            the visuals (the only file the loader design replaces)
```

## The timeline

`t` is the story position in story viewport heights. `t = 0` is the section's top at the viewport top. The entrance (`c-enter`) is the screen before that, `t` in [-1, 0), while the section scrolls in as normal content. The laid-out beats run from `t = 0` to `TIMELINE.end`, 61 today (the Act 3 rows add up to 34.4, not 33). Nothing hardcodes that number: the section's height, the rests and each act's range come from the table.

- A `hard-end` rest stops auto-advance at the beat's end in both directions (`c-rise`, `c-turn`, `r-figure`).
- A `backstop-start` rest stops a backward advance at the beat's start (`w-hole` and the five worlds).
- The `terminal` rest (`f-wave`) stops it, and nothing advances past it.
- The section start (`t = 0`) is a backward stop too.

The story viewport height (`--story-vh`) is the window's inner height, set on `<html>` by the boot script and on the section by the director. On a coarse pointer it ignores height changes under 25% at the same width, so the phone URL bar showing and hiding never rescales 61 screens.

The WebGL shell's layout follows the table: the entrance screen is the first story vh of the section, the finale screen is the last one (it is on screen at the terminal rest and scrolls away with the footer during `f-out`), and a transparent spacer fills the rest.

## The act contract

Every act implements `StoryAct` (`engine/act.ts`, fully documented there):

```ts
interface StoryAct {
  readonly id: "cards" | "room" | "worlds" | "finale";
  init(ctx: StoryContext): Promise<void>;
  update(ctx: StoryContext, state: ActState): void;
  pointer?(ctx: StoryContext, event: StoryPointerEvent): boolean;
  palette?(ctx: StoryContext): void;
  resize?(ctx: StoryContext): void;
  tier?(ctx: StoryContext): void;
  sleep?(ctx: StoryContext): void;
  dispose(): void;
}
```

`acts/<id>/index.ts` exports `createAct(): StoryAct`.

The rules:

- **Story state is a pure function of `ActState`.** The same `t` looks like the same moment in either direction and after any jump (End key, a restored position, a back navigation). Life (loops, particles, idle, blinking) runs on `ctx.clock`, and nothing on the clock changes the story state. Use `clock.storyDt` for life layers, so press and hold slows them to 0.3x.
- **The active act owns the camera and the scene.** The act whose range holds `t` is `active` (the entrance belongs to the cards, anything past the end to the finale). A `near` act (within the neighbouring acts' edge beats) updates too, before the active one, and may prepare visibility, but never touches the camera.
- **Per-frame settings reset every frame.** The scene (the root scene), the post effects (all off), the backdrop (transparent, nothing behind revealed), the overlay hint and HUD (none) and the header tone (none) start from their defaults before the acts update. The active act sets what it needs, so a beat left in any direction never leaves a setting behind.
- **Build in `init()`, from `ctx.assets`, and compile there** (`ctx.stage.compile(scene)`). The build pipeline then renders one frame at the middle of every beat, so no program compiles on first sight.
- **`ctx.dom` is live only in `update()` and `pointer()`.** During `init()` and the warm-up its rects read as null.
- **Dispose everything you create.** The engine outlives routes; an act may be created again on a later visit after a failure.

`ActState` gives `t`, `progress` (0..1 over the act), `current` and `local` (the beat under `t` and its progress), `beat(id)`, `beats` (the same as a record), `span(from, to)`, `entrance` (the cards' 0..1 during `c-enter`), `direction`, `velocity` (vh per second), `freeze`, `active`, `near` and `arrived` (the first near frame of a run).

Helpers exported from `act.ts`: `clamp`, `saturate`, `mix`, `fit`, `span`, `smoothstep`, `window4`, `damp`, `stepSpring`, `seededRandom`, `cubicBezier`, `easeSettle`, `expoInOut`, `expoOut`, `quadInOut`, `cubicInOut`, `cubicOut`, `backOut`, and three small state holders: `Latch` (a latched timed beat), `OneShot` (a burst on a forward crossing at a moderate speed, re-armed on the way back) and `Cut` (a cut with a hysteresis band).

### Shared props

Props shared by several acts (the box, the cards, the room, Godette, the toy letters, the fx) live in `ctx.props`. A prop package adds its key by module augmentation, with no edit to `act.ts`:

```ts
declare module "@/components/story/engine/act" {
  interface StoryPropMap {
    room: StoryRoom;
  }
}
const room = await ctx.props.ensure("room", () => loadRoom(ctx.assets, ctx.tier));
```

The first caller builds it, every later caller gets the same promise, and a prop with a `dispose()` goes with the stage.

## The stage and composition

One `WebGLRenderer` (WebGL2, `alpha`, premultiplied, MSAA on the high and medium tiers), one canvas and one `PerspectiveCamera` for the whole story, kept for the whole visit. Output is sRGB with `NeutralToneMapping`, chosen because it keeps the brand's primaries close to their hex values under light.

### Where the canvas lives

The canvas sits in `div[data-story-layer]` inside the section's layer host (an empty element React never renders into), at `z-index: -1` under the section's transparent DOM. The cursor flow's layer moved to `z-index: -2`, so the story always paints above it. This differs on purpose from a canvas fixed on `<body>`. On touch the page scrolls on the compositor, and a fixed canvas trails anything glued to the page by a frame. The director therefore places the layer every frame:

- `viewport` (from `t = 0` to the terminal rest): with ScrollSmoother (desktop) the layer is translated back to the viewport in the same tick the smoother moved the page; with native scroll (touch) it is `position: fixed`.
- An anchor (the entrance screen before `t = 0`, the finale screen during `f-out`): the layer sits on that element and scrolls with it, so GL glued to the DOM stays glued while the compositor scrolls.

The switch happens where the anchor covers the viewport exactly, so it is seamless. On touch, no ancestor of the layer host may get a transform, `filter`, `contain` or `will-change`, or `position: fixed` stops meaning the viewport. Frame work reads one rect per anchor and writes inline styles only (class changes inside `#smooth-content` would make the cursor flow rescan).

### Layers and the backdrop

The canvas is transparent, so wherever the story draws nothing, the DOM page shows through. Objects are on one of two layers (`STORY_LAYERS`):

- `front` (layer 0, the default) always draws over the backdrop.
- `behind` (layer 1, `object.layers.set(STORY_LAYERS.behind)`): the room and anything else the page colour should hide. It shows only where the backdrop is revealed.

The backdrop is set per frame with `ctx.stage.backdrop.set({ paint, reveal, origin, noise, edge, edgeColor, color })`:

- `paint` 0 leaves the unrevealed area transparent (the DOM shows); 1 paints the page colour there, written as the page colour's exact sRGB bytes (no tone mapping), so it matches `--background` pixel for pixel in both schemes.
- `reveal` 0 shows nothing of the `behind` layer; 1 shows all of it (one pass, shared depth); in between, a noisy radial dissolve opens it from `origin` (NDC), with an optional `edge` band in `edgeColor`. During a partial reveal the stage draws the behind layer, then the mask (which also resets the depth where it paints), then the front layer.

Lights must light both layers: `stage.compile()` enables every light on all layers, or the two passes would compile different programs. A `Color` `scene.background` is honoured only when the reveal is complete (the stage clears manually).

### Post effects

`ctx.stage.post.set({ bloom, bloomThreshold, bloomRadius, vignette, grain, flash, flashColor, fade, fadeColor, exposure })`, per frame. With every effect off the stage renders straight to the canvas and post costs nothing. With any effect on, the same composition renders into a target that behaves exactly like the canvas (it carries three's XR render target flag and plain RGBA8 storage, so lit materials are tone mapped and encoded into it with the same programs as the direct path, and the backdrop's bytes survive), then one composite pass adds a cheap display-space bloom (a dual filter at half resolution and below), the vignette, grain, flash and fade. Re-check the flag's handling when three is upgraded. `exposure` (1 by default) is the renderer's tone mapping exposure for the frame: it needs no pass, brightens or darkens lit materials only, and leaves anything `toneMapped: false` (the backdrop, colours that must match the page) byte for byte.

### Quality

- The device guess starts coarse pointers low or medium and laptops medium or high (`guessStoryTier`).
- The build times a few frames of the heaviest act: over 20 ms per frame starts a tier lower, over 33 ms two, over 90 ms gives the visit to the storybook.
- At runtime the articles world's `QualityGovernor` walks the story's ladder (pixel ratios high 1.75 and 1.5, medium 1.4 and 1.2, low 1.15, 1 and 0.85, never more than 2560 x 1440 device pixels), and `HopelessWatch` hands a renderer under 8 fps to the storybook.
- The stage draws only while the section is within half a viewport of the screen and the tab is visible.

## The director

- **Position.** Once a frame on `gsap.ticker`, the director reads the section's rect: `t = -top / storyVh`, what is on screen. GSAP renders its root timeline (where ScrollSmoother moves the page) before any ticker listener, so the rect is always this frame's.
- **Auto-advance** (the reel's arming rules, gotcha #31). It is armed only by real input: a wheel (not a pinch), a scroll key, a touch drag, a scrollbar drag. After the input stops and the glide has settled (the rendered position within 2 px of the target, or 120 ms without scroll events on touch) it waits 0.35 s, then carries the page to the next rest in the last input direction. It ramps to the beat's speed over 0.8 s and lands softly exactly on the rest, and it latches that rest so landing never retargets. It moves the rendered position itself (`smoother.scrollTo(y, false)`, or `window.scrollTo` on native scroll), so a press stops it dead.
- **Cancelling it.** Any input cancels it at once. A held pointer or finger freezes it. The scroll lock (the menu), the reel player and reduced motion stand it down. A scroll nobody asked for (a script, focus, an e2e spec) disarms it once 600 ms have passed since the last real input, and it never runs before `t = 0` or after the terminal rest.
- **Freeze.** Press and hold eases `freeze` to 1 (rate 10 per second); acts run their life at `mix(1, 0.3, freeze)`. A hold is a press kept down for 180 ms, and a finger must also stay within 10 px: a finger that scrolls the page, a second finger or a quick click never slows time. Any press still pauses the auto-advance at once.
- **Skip.** "Skip the story" (bottom left, while the story covers the screen) jumps to the start of `f-cut` and arms forward, so the landing and the wave play; in the finale it becomes "Watch again" (back to `t = 0`, armed forward).
- **Resize and rotation.** The story keeps its place: the director re-lays out and scrolls back to the same `t`, again after ScrollTrigger's refresh.
- **Integrations.** The theme lock is held from `t = 0` to the terminal rest (`lib/theme-lock.ts`); the theme provider forces the scheme the lock started in, so an OS switch cannot flip the page either. The cursor flow yields while the section covers the top of the viewport (`setFlowYield`: it stops drawing and hides its layer but keeps its host and surface markers, so the reel keeps its host; it resumes with a frame drawn in the same tick). The header's tone comes from `ctx.setHeaderTone()` through `registerHeaderToneProvider`.
- **Leaving `/`.** The engine stays built (assets parsed, programs compiled), the layer is parked hidden, and every lock, yield and listener is released in the layout effect that leaves the page.

## Assets and caching

- Files ship under `public/story/v1/<group>/`, at most 1,048,576 bytes each, served `public, max-age=31536000, immutable` by the `headers()` rule for `/story/:path*` in `next.config.ts`. Bump `STORY_ASSET_VERSION` (and the folder) when any file changes.
- Each asset package owns `assets/files-<group>.ts`, a `StoryFile[]` with exact byte sizes; `manifest.ts` joins them. The stills belong to the storybook and are not part of the WebGL preload.
- `cache.ts` fetches every file once per visit into a module-level map with byte progress. It uses XMLHttpRequest, because its progress counts bytes even when the response is gzipped, and every URL is shape-checked as a same-origin `/story/` path. It retries once, reports failures, and never rejects.
- `loaders.ts` implements `StoryLoaderLike` over those bytes: glTF through `GLTFLoader` with `MeshoptDecoder` and one `KTX2Loader` per visit (default bundler URLs for the Basis transcoder; never `setTranscoderPath()`), KTX2 and image textures, JSON and raw buffers. Relative files inside a glTF resolve to the cached bytes through a URL modifier. `KTX2Loader.parse` transfers its buffer to a worker, so it gets a copy. Parses are memoised by URL.
- Coming back to `/` from another page finds everything in place: the bytes, the parsed assets, the compiled programs and the stage.

## The loader

The core (`loader-core.ts`) owns the rules, the view (`loader-view.tsx`) only the looks:

- It shows on a hard load of a public route (not `/admin`, `/forms/*`, `/s/*`), decided by the boot script before the first paint (`html[data-loader="active"]`). A client navigation never shows it again.
- It is skipped when `navigator.webdriver` is true unless the URL has `?loader=1`, and hidden without JavaScript (no attribute, plus a `<noscript>` style).
- It never writes `html { overflow }` and never makes the page inert; it only swallows wheel and touch scrolling over itself.
- On a device that can run the WebGL story it waits for the story's bytes, build and warm-up; otherwise only for the fonts. It stays at least 900 ms (450 ms on a repeat load in the same tab) and at most 12 s of visible time. The rest keeps loading behind the page.
- It is a `role="progressbar"` named "Loading the site" with its value, plus a polite live region. Every fetch it starts catches its own failure.
- When it is done it sets `html[data-loader="done"]` (specs wait for it) and `sessionStorage` `mgm:loader` (the fast path), and at idle it fully prefetches the menu's routes (not when `navigator.webdriver` is set).

A view gets `{ state, onExited }`: `state` is the core's `LoaderSnapshot` (phase, progress, bytes, whether the story is part of the wait, the fast path, reduced motion, visible time, the announcement), and the view calls `onExited()` once its exit has played (the core hides the loader after 1.2 s anyway).

## Dev flags

Development builds only, except where noted:

- `?storydebug`: the HUD (beat, local progress, `t`, fps, CPU time, tier and pixel ratio, draw calls and triangles, auto-advance state, freeze).
- `?story=<beat>:<p>`: jumps there on load (`?story=c-turn:0.8`).
- `?storyglue`: outlines the box placeholder and draws the placeholder box's face flat green, to measure the entrance glue in captured frames.
- `?storytier=high|medium|low` (also in production): forces the start tier.
- `?nostory` (also in production): the storybook.
- `?loader=1` (also in production): the loader even when `navigator.webdriver` is set.
- `window.__story`: `{ director, stage, timeline, jump(beat, p), jumpTo(t), setTier(tier) }`.

## Verification

Measured on an Apple Silicon laptop in GPU Chromium (`--ignore-gpu-blocklist --use-angle=metal --enable-gpu`) with the placeholder acts:

- **Frame times.** 60 fps at every beat (16.7 ms median, at most 16.8 ms) at 1440 x 900 (high tier at 1.69, the pixel cap), and at 390 x 844, 820 x 1180 and 1180 x 820 touch (medium tier at 1.4). A 12 s scrub through all 61 vh had no frame over 50 ms. Draw calls peak at 32.
- **Entrance glue.** Frames captured mid-scroll with `?storyglue` put the GL face on the DOM placeholder with 0 px of drift under ScrollSmoother at 1440 x 900, and within one device pixel (0.33 CSS px, under one canvas pixel) during a native touch drag at 390 x 844.
- **Behaviour.** The page settles on the `c-rise` rest going forward and on the section start going back, a held press freezes it, a wheel cancels it at once, a script scroll is never carried, and a resize puts the story back at the same `t`. A lost context lands on the storybook's matching still, and a round trip to `/projects` keeps the same stage and one canvas.

## Gotchas met while building it

- **GLSL3 outputs.** A GLSL3 `ShaderMaterial` gets no `gl_FragColor` in three 0.186: declare `layout(location = 0) out highp vec4 ...` yourself.
- **Canvas textures.** A `CanvasTexture` whose canvas changes size needs `texture.dispose()` first (the GPU copy has a fixed size), or WebGL reports `Offset overflows texture dimensions`.
- **Colour-managed targets.** A render target texture tagged `SRGBColorSpace` gets hardware sRGB storage. Rendering display-referred values into it encodes them twice. The post target sets `internalFormat = "RGBA8"` for that reason.
- **Rest epsilon.** Choosing the next rest with an epsilon picks the one after it once the page is within a hair of the target: latch the target for the whole advance.
- **Life layers break the glue.** Breathing, hover lift or a hop moves the glued box off the DOM, so keep them off until the box leaves the placeholder, or add them as offsets the glue knows about.
