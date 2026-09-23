# Projects Page (`/projects`)

The project index is the site's most heavily animated page. It is modeled on lusion.co's project list: a huge "PROJECT" hero with the total count, then a two-column grid of cards whose covers are drawn by one full-screen WebGL canvas. Cards open one by one as they scroll into view, their text scramble-types and drops in, and every card bends with the scroll speed. The hero has an idle and hover "play" of its own.

The lusion constants below were read from lusion.co's own (unminified) bundle and confirmed frame by frame. Where this page deliberately differs from lusion, it says so.

## Files

| Area                 | Files (under `apps/web/src/`)                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page                 | `app/projects/page.tsx` (server component: fetches the CMS feed, `overflow-x-clip` root, gutters `px-6 sm:px-10 lg:px-14`)                                           |
| Choreography signals | `lib/projects-intro.ts` (intro and grid-reveal signals), `lib/scroll-lock.ts` (owner-counted lock), `lib/page-scroll.ts` (scroller registry)                         |
| Shared helpers       | `lib/reduced-motion.ts` (live reduced-motion preference), `lib/random.ts` (seeded random for decorative motion)                                                      |
| Hero                 | `components/projects/projects-hero.tsx` (markup, alignment, entrance, intro lock), `components/projects/hero-play.ts` (idle and hover play)                          |
| Grid and card shell  | `components/projects/projects-grid.tsx` (gated list reveal), `components/projects/project-card.tsx` (link, accessible name, focus ring)                              |
| Card cover           | `components/projects/project-card-cover.tsx` (3:2 frame, DOM cover, DOM opening and hover)                                                                           |
| Card text            | `components/projects/project-card-footer.tsx`, `components/projects/card-text/*` (scramble, drop, flip, ticker, triggers)                                            |
| Cover stage          | `components/projects/stage/*` (`projects-stage.tsx` host, `cover-engine.ts`, `cover-shaders.ts`, `cover-textures.ts`, `smooth-scroller.ts`, `frame-loop.ts`, others) |

## Choreography: the intro, the lock, and the list reveal

On a fresh load (and after the page-transition curtain on internal navigation), only the hero plays. The list stays hidden and the page stays locked at the top until the hero's entrance has finished. Then the list fades and rises in while the covers on screen play their opening.

1. **Hero mount** (`projects-hero.tsx`, in a layout effect, before any `await`): `beginProjectsIntro()`, `acquireScrollLock("projects-intro")`, jump to the top, and a scroll listener that snaps any scroll back to 0 while locked. `beginProjectsIntro()` must run in the hero's layout effect: the grid and every card footer subscribe from their own layout effects, which React runs after the hero's (the hero is the earlier sibling). A passive or deferred begin lets the list and the card text play under the intro.
2. **Scroll restoration**: while it holds the page, the hero sets `history.scrollRestoration` to `"manual"` through `ScrollTrigger.clearScrollMemory("manual")`, so a reload from deep in the page paints at the top instead of flashing the footer first. It hands back `"auto"` on unmount (never a value read at mount, which after a reload is still `"manual"`).
3. **Entrance**: fresh loads play after the display font loads (capped at 1.5 s). Internal navigation first awaits `waitForRouteReveal()` (see `docs/page-transition.md`). Scroll position never skips it.
4. **Hand-off** (the entrance timeline's `onComplete`, in this order): release the lock, `finishProjectsIntro()`, start the hero play.
5. **Grid** (`projects-grid.tsx`): waits for `waitForProjectsIntro()`, then up to 700 ms for the cover stage to be ready (it reveals on time either way), then calls `markGridRevealStarted()` and tweens the list from opacity 0 and 28 px down to rest over 0.9 s (`power3.out`). While the list is hidden, the grid also holds its own lock owner (`"projects-grid-reveal"`), so the page never unlocks over an invisible list, and makes the list and the page footer `inert`, so pointer and keyboard can't reach hidden links.
6. **Card text** waits for `waitForGridReveal()`, so nothing types or drops before the list is visible.

Failsafes: the hero and the grid each give up waiting after 13 s of **visible** time (a hidden tab freezes animation frames but not timers, so a wall-clock failsafe would release the list over an entrance nobody has seen yet). Unmounting mid-intro always releases the lock. Reduced motion and an empty list finish the intro at once and never lock.

Pre-hydration: the hero pieces and the list start hidden in the server HTML only when motion is allowed (`motion-safe:opacity-0`), with a `<noscript>` override, so no-JS and reduced-motion visitors see everything at first paint. `inert` is set from JS only: CSS can't undo an SSR `inert`, which would break the no-JS path.

## Hero

### Layout and alignment

"PROJECT" is `17vw` Hanken Grotesk 500, `line-height: 1.15em`, `tracking 0.05em`. The count and the arrow are aligned by their **ink**, not their boxes:

- The count's digit tops sit on the title's flat cap line (P, R, E, T tops), and its last digit's ink right edge sits on the right card's right edge.
- The arrow's ink right edge sits on the same edge, and its ink bottom on the title's baseline.

All offsets are CSS `calc()` in `vw` and `em`, so server HTML is already correct. The inputs are measured font metrics: Hanken's cap inset is `0.2265em` of the title (so `17vw × 0.2265`), Geist Mono's flat digit tops sit `0.145em` below the count's line-box top, each digit has its own right side bearing (`DIGIT_RIGHT_BEARING_EM`), and the arrow's stroke ink sits `1/38` inside its viewBox. Letter slots are frozen at their weight-500 advances (`SLOT_EM`) so the play's weight changes never shift the word. **Re-measure these tables if the title text, font, weight, tracking or line-height changes.** Measured deltas are under 1 px at 390 to 1920 px widths (the residual is Chromium flooring text baselines).

The word stays "PROJECT": at this size a trailing S would run into the right-aligned count.

### Entrance

Letters rise out of the h1's overflow mask tilted 30 degrees and level off (lusion's hero entrance). The count slides up and counts from 0 to the total. The arrow's shaft draws, then its head springs out of the tip. The arrow is out of the tab order until it is drawn.

### Idle and hover play: Residents (`hero-play.ts`)

Starts only after the entrance. Three motion ideas, one idle beat at a time:

- **Letters with mass.** One fixed-step spring solver (1/120 s substeps) on the GSAP ticker writes every glyph transform through `quickSetter`s. Hovering leans and pushes nearby letters away from the cursor and swells their weight along Hanken's `wght` axis (Gaussian falloff, radius 0.55em, up to +180). Pressing squashes a letter while its neighbours make room. Releasing launches it into a hop with a landing squash. After 12 calm substeps the solver leaves the ticker and snaps every glyph to exact identity.
- **Residents and the eye.** Brand shapes (yellow circle, blue triangle, green square, red ring) live behind the word and peek through its gaps and counters. A brand-blue pupil in the O tracks the cursor, glances at events and blinks.
- **The instruments.** The count "drops" through its own mask like the card titles and always lands on the real count. The arrow has a magnet, a wind-up (a yellow disc swells behind it, the arrow turns ink on it), and fires: the shaft zips into the tip, a flinch runs through the word, and the page scrolls to the list through `scrollPageTo` (never `window.scrollTo`, which the smooth scroller would fight). Keyboard activation also hands focus to the first card once the list reveal has started.

The idle director plays peek, blink, breathe (a weight crest across the word that spills into a count drop and an arrow nod), count and hop-wave beats, one at a time, 3.5 to 6.5 s apart, never the same beat twice in a row, and only blinks while the cursor is over the hero. Everything parks (and returns to rest) when the hero is offscreen, the tab is hidden, or another scroll-lock owner covers the page (the nav menu). Touch: tapping a letter launches it, a sideways drag strums the letters, tapping the count drops it. Reduced motion never starts the play and keeps a still, centred pupil.

Ownership: the entrance owns the outer `.projects-hero-char` slots (`yPercent`, `rotation`, `opacity`), the solver owns the inner `.projects-hero-glyph` transform and `font-weight`, and the markup owns slot widths and `transform-origin`.

## Cards

`project-card.tsx` is a thin shell: a `<Link>` with an explicit `aria-label` (the visual text is split per character and would otherwise be read letter by letter), a designed `:focus-visible` ring, then the cover and the footer. Both halves find the link from their own element (`closest("a")`), because a parent's ref isn't attached yet when a child's layout effect runs.

### Cover stage modes and ownership

`stage/projects-stage.tsx` decides one page-wide mode (`stage/stage-registry.ts`):

- `"pending"`: undecided. The list may reveal in this state, and the stage can still start afterwards.
- `"gl"`: the WebGL stage runs. Requires a fine pointer, motion allowed, and a hardware WebGL2 context (`failIfMajorPerformanceCaveat`; three.js r163 and later are WebGL2-only).
- `"dom"`: final. Touch, reduced motion, no WebGL2, a failed start, a lost context, or reduced motion switched on mid-visit.

Ownership is per card in every mode. The stage draws a cover only while its frame carries `data-stage="gl"`. The cover markup then hides the DOM `<img>` (`visibility`, never opacity) and the frame background. Every other card plays the DOM opening and hover. A slow stage never drops to DOM for the whole visit: it takes cards over progressively, off screen, or on screen only while the DOM cover rests and the page is still. The DOM cover rests at the same 1.026× overscan as the WebGL one, so that swap is invisible.

### Smooth scroll and the frame loop

Fine-pointer, full-motion visitors get Lenis wheel smoothing on `/projects` only (`stage/smooth-scroller.ts`, dynamically imported, lerp 0.15). Lenis is stepped from `stage/frame-loop.ts`, one ordered GSAP-ticker callback in which every "scroll" step runs before any "render" step. That ordering is what keeps the fixed canvas and the DOM text in the same frame: a fixed canvas drawn against native compositor scrolling visibly trails the DOM. Scroll keys go through Lenis too. It stops while any scroll lock is held, queues a `scrollPageTo` made while locked (latest only) until unlock, and is registered through `setPageScroller`. Touch keeps native scrolling.

### The WebGL cover stage (`stage/cover-engine.ts`)

One fixed, full-viewport three.js canvas appended to `<body>`: `pointer-events: none`, `z-index: 20` (above the page's opaque background, below BackToTop 30, the cursor wake 40, the header and nav 50, and the curtain 999), pixel ratio capped at 2. One subdivided quad per card is placed on its frame's rect from cached document offsets (re-measured on resize, a body `ResizeObserver` and `fonts.ready`, never per frame). three.js is only ever dynamically imported from `/projects` code, so no other route loads it.

**Opening** (lusion's constants, `expo.out`):

- A card arms when it enters and plays once 25% of its cover frame is on screen (`OPENING_VISIBLE_SHARE`). Until then it holds the first frame: mask at 70%, content at 1.333×, slid and tilted, sharp. Lusion starts at the first pixel, which spends the whole opening on a sliver at the viewport edge. This page waits so the opening is actually seen.
- The rounded mask grows 70% to 100% and the picture pulls back from 1.333× to 1.026× over 1.5 s. The quad slides in from 0.05 × the viewport width toward the page centre and un-rotates 0.05 rad (left column counter-clockwise, right column clockwise) over 2 s. No opacity fade.
- Camera order: the zoom-out starts with a radial **edge motion blur** on a sharp centre (7 px of streak per unit of zoom speed, capped at 16 px, weighted to the mask's edges), then at 0.12 s the **focus hunt** starts: blur in to 9 px, then a second-order spring (f 2.2, ζ 0.7, r 3) pumps it blur, sharp, soft, sharp by about 0.5 s. Both end at exactly 0.
- It replays after the card has been fully out of view.

**Scroll morph**:

- lusion's horizontal lens, verbatim: `uv.x -= (screenX - 0.5) · (1 - sin(π · screenY)) · min(0.15, E · 0.5)`, where E accumulates the per-frame scroll distance in viewport heights and decays with a 100 ms time constant. The mask is evaluated in the warped space, so card edges near the top and bottom of the viewport flare outward at speed.
- A spring-damped vertical bend (original to this page): the card sags like a dragged sheet, centre lagging, edges pinned. The target grows with speed past a 250 px/s dead zone toward a 30 px cap. The spring (f 2, ζ 0.3) swings past flat once when the scroll stops. The card's DOM footer rides with the frame's bottom-centre point, so the whole card reacts.
- At most 1.5 px of chromatic split on the warped edges near full lens strength, on sharp pixels only.
- A jump of more than one viewport in a frame (End, anchors) moves the covers but feeds none of the physics.

**Hover and focus**: a focus kick (blur, then sharp), a zoom to about 1.0× through the spring's overshoot, a perspective tilt toward the cursor (0.05 rad), and two small "handheld camera" jolts at 0.2 s and 0.3 s. The blur always returns to exactly 0. A hover only starts while the page isn't scrolling (`stage/scroll-idle.ts`), so cards sliding under a resting cursor don't flash. A `:focus-visible` card plays the same hover without the tilt.

**Textures** (`stage/cover-textures.ts`): from the card's own same-origin `<img>`, once loaded, the cached URL is fetched as a Blob and decoded off the main thread with `createImageBitmap`, cropped to the visible 3:2 region plus a 6% margin and downscaled to the rendered size × pixel ratio. Uploads are one per frame, streaming from 2.5 viewports ahead to 1.5 behind. Colours stay raw sRGB (parity with the DOM cover measured within resampling noise).

**Lifecycle**: renders only while something moves (0 renders at rest). The shader compiles and the first textures upload after the intro, never during it. `webglcontextlost` sets `"dom"` and hands every card back. Unmount disposes textures, materials, geometry and the renderer, force-loses the context and removes the canvas.

### DOM covers (`project-card-cover.tsx`, `stage/dom-reaction.ts`)

The same opening in DOM form, for every card the stage doesn't draw: `clip-path: inset(15% round 15px)` opening to 0, a lens wrapper scaling 1.333× to 1.026× over 1.5 s, a radially masked blurred copy fading out as the edge blur, then the focus hunt as a `filter: blur()` pump ending at `blur(0px)`. Visibility is measured with `getBoundingClientRect`, because Chromium's IntersectionObserver applies the frame's own `clip-path`. The scroll reaction for touch is one spring on the native scroll velocity driving the frame's `skewY` and `scaleY` and the footer's lag, cleared to identity at rest. The DOM hover (a blur-then-sharp focus pull and a cursor tilt) also waits for scroll idle.

### Card text (`project-card-footer.tsx`, `card-text/*`)

- **Category scramble** (lusion's formula): 40 letters per second behind a head of 5 random printable ASCII characters, re-rolled every frame, with the real text locked in behind it. It ends on the exact text at (length + 5) / 40 s.
- **Title drop** (lusion's formula): each character is a column of 4 identical copies inside the one-line window. The column travels from -500% to 0% of its own height with `expoInOut` over 1.25 s, middle characters leading by up to about 62 ms (`-cos(fit(i, 0, n-1, π/2, 3π/2)) / 20`). Visibly, three copies fall through before the fourth lands and stops. The drop writes each column's transform directly and clears it once landed.
- **Triggers**: plays when the footer itself is seen below the header (lusion starts from the card top, which makes the text finish off screen on a slow scroll), only after the grid reveal. It resets when the whole card has left the viewport and replays on the next entry.
- **Hover and focus**: the magicui 3D flip on the title and the indent with the arrow sliding in. Both wait for the drop to land and for the scroll to settle. The flip's 3D geometry (a `preserve-3d` box, translated faces, backface hiding) is switched on only while a flip runs, because always-on 3D faces kept about 1000 compositor layers alive. The one-line ellipsis fit reserves the indent's width so the tail stays visible while indented.
- Ownership: the drop moves the column, the flip rotates the box (copy one), the indent moves `.project-card-title`, and the stage owns the `[data-card-footer]` wrapper's transform.

Reduced motion shows the final text, and a mid-visit switch finishes every running effect to its real text.

## Verifying changes here

Follow `docs/testing-verification.md`, plus these page-specific checks:

- In dev, `page.goto` waiting for `load` can return after the roughly 2 s intro has already finished. Observe the intro with `waitUntil: "commit"` and poll.
- WebGL needs a real GPU in headless Chromium: launch with `--use-angle=metal --enable-gpu`. Software rendering (and CI) falls back to DOM covers by design.
- CI's e2e runs without an API, so `/projects` only ever renders its empty state there. The card animations must be verified locally against the CMS data.
- Useful dev-only probes: `window.__projectsStage` (mode, per-card state and uniforms, render count) and `window.__heroPlay` (solver state, current beat). Neither exists in production builds.
- Scenarios worth repeating after any change: 10 reloads (half from deep in the page), internal navigation through the curtain, the nav menu opened during the intro, a slow scroll and a flick through the whole list and back, rapid hovers while scrolling, keyboard Tab and Enter from the hero arrow, reduced motion, dark mode, 390 px touch, no JS, and the navigation fuzzer.
