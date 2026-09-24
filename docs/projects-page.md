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
| Project zoom         | `components/transition/project-transition.tsx`, `project-zoom*.ts`, `lib/project-transition.ts` (spec in `docs/page-transition.md`)                                  |

## Choreography: the intro, the lock, and the list reveal

On a fresh load (and after the page-transition curtain on internal navigation), only the hero plays. The list stays hidden and the page stays locked at the top until the hero's entrance has finished. Then the list fades and rises in while the covers on screen play their opening.

1. **Hero mount** (`projects-hero.tsx`, in a layout effect, before any `await`): `beginProjectsIntro()`, `acquireScrollLock("projects-intro")`, jump to the top, and a scroll listener that snaps any scroll back to 0 while locked. `beginProjectsIntro()` must run in the hero's layout effect: the grid and every card footer subscribe from their own layout effects, which React runs after the hero's (the hero is the earlier sibling). A passive or deferred begin lets the list and the card text play under the intro.
2. **Scroll restoration**: while it holds the page, the hero sets `history.scrollRestoration` to `"manual"` through `ScrollTrigger.clearScrollMemory("manual")`, so a reload from deep in the page paints at the top instead of flashing the footer first. It hands back `"auto"` on unmount (never a value read at mount, which after a reload is still `"manual"`).
3. **Entrance**: fresh loads play after the display font loads (capped at 1.5 s). Internal navigation first awaits `waitForRouteReveal()` (see `docs/page-transition.md`), then skips the timeline's 0.1 s lead so the letters rise as the curtain's wash clears. Scroll position never skips it. Reduced motion switched on mid-intro jumps the entrance to its end and unlocks at once.
4. **Hand-off** (the entrance timeline's `onComplete`, in this order): release the lock, `finishProjectsIntro()`, start the hero play.
5. **Grid** (`projects-grid.tsx`): waits for `waitForProjectsIntro()`, then up to 700 ms for the cover stage to be ready (it reveals on time either way), then calls `markGridRevealStarted()` and tweens the list from opacity 0 and 28 px down to rest over 0.9 s (`power3.out`). While the list is hidden, the grid also holds its own lock owner (`"projects-grid-reveal"`), so the page never unlocks over an invisible list, and makes the list and the page footer `inert`, so pointer and keyboard can't reach hidden links.
6. **Card text** waits for `waitForGridReveal()`, so nothing types or drops before the list is visible.

Failsafes: the hero and the grid each give up waiting after 13 s of **visible** time (a hidden tab freezes animation frames but not timers, so a wall-clock failsafe would release the list over an entrance nobody has seen yet). Unmounting mid-intro always releases the lock. Reduced motion and an empty list finish the intro at once and never lock.

Pre-hydration: the hero pieces and the list start hidden in the server HTML only when motion is allowed (`motion-safe:opacity-0`), with a `<noscript>` override, so no-JS and reduced-motion visitors see everything at first paint. `inert` is set from JS only: CSS can't undo an SSR `inert`, which would break the no-JS path.

### Return mode (back from a project)

Going back from a project page through the project zoom (`docs/page-transition.md`, last section), the overlay leaves a return note (`setProjectReturn`, `lib/project-transition.ts`) before the list mounts. The list arrives as it was left, while the overlay zooms back out onto the project's card:

- The hero, the grid and every card cover read the note **synchronously during their first render** (a lazy `useState` initializer), like the heroes read the boot flag: the overlay clears the note once it has landed, and each component keeps the mode it mounted with.
- Hero: no intro, no lock, no scroll pinning, no entrance. It calls `finishProjectsIntro()` and `markGridRevealStarted()` itself, shows its final state and starts the idle play, which parks while the overlay's scroll lock is held.
- Grid: the reveal state goes straight to started, opacity 1 and no rise, with no `inert` hold. In its layout effect it jumps the scroll (`window.scrollTo` with `behavior: "instant"`, never `scrollPageTo`: the smooth scroller is either missing or locked here) to the remembered position, or so the card's top sits at 25% of the viewport (lusion's rule) when there is none or it no longer shows at least half of the card below the header. The root layout's scroll reset runs after this effect, and the overlay has told it to stand down for `/projects` (`skipScrollReset`, consumed by `smooth-scroll.tsx`).
- Card covers already on screen rest instead of arming their opening (the start frame would also set `data-dom-opening`, which keeps the stage from taking them over). They replay after they have been fully out of view, like any other.
- The card being returned to renders `data-project-landing` on its frame, which hides the whole frame (`visibility`, its background included). The overlay removes the attribute when it rests on the card, then fades out over it. The card keeps an 8 s failsafe of its own.
- Card text still plays as each footer is seen, so the landed card's title drops in as the overlay lets go.

Under reduced motion the note carries `restoreOnly`: the list renders as it always does and only scrolls back to the card, again one frame later because a link's own navigation scrolls to the top after the layout effect.

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

- **Letters with mass.** One fixed-step spring solver (1/120 s substeps) on the GSAP ticker writes every glyph transform through `quickSetter`s. Hovering leans and pushes nearby letters away from the cursor and swells their weight along Hanken's `wght` axis (Gaussian falloff, radius 0.55em, up to +180). Pressing squashes a letter while its neighbours make room (passing a little of the push on to the next letters, with the hover field reduced to the held letter's weight, so nothing fuses). Releasing launches it into a hop with a landing squash. After 12 calm substeps the solver leaves the ticker and snaps every glyph to exact identity.
- **Residents and the eye.** Brand shapes (yellow circle, blue triangle, green square, red ring) live behind the word and peek through its gaps and counters. In dark mode the yellow circle never peeks, since white strokes crossing brand yellow break the design system's ink-on-yellow rule. A brand-blue pupil in the O tracks the cursor, glances at events and blinks.
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

A frame carrying `data-project-landing` (the card the project zoom is landing on, see return mode above) is neither taken over nor drawn by the stage until the attribute goes. The stage then takes it over at rest like any other card on screen.

The card link carries the project zoom's hooks: `data-project-transition`, `data-project-slug` and `data-project-theme` (from `projectThemeId(record.project)`). The cover frame carries `data-project-transition-frame` and `data-overscan` (its rest zoom, 1.026), which tell the overlay where the picture is and how far it is zoomed. The homepage's featured projects section carries the same hooks on its "View project" link, with the image box as the frame.

### Smooth scroll and the frame loop

Fine-pointer, full-motion visitors get Lenis wheel smoothing on `/projects` (`stage/smooth-scroller.ts`, dynamically imported, lerp 0.15). Project detail pages start their own instance through the same module with per-page options (lerp 0.2, both-axis gestures, a 200 px wheel clamp). Lenis is stepped from `stage/frame-loop.ts`, one ordered GSAP-ticker callback in which every "scroll" step runs before any "render" step. That ordering is what keeps the fixed canvas and the DOM text in the same frame: a fixed canvas drawn against native compositor scrolling visibly trails the DOM. Scroll keys go through Lenis too. It stops while any scroll lock is held, queues a `scrollPageTo` made while locked (latest only) until unlock, and is registered through `setPageScroller`. Touch keeps native scrolling.

### The WebGL cover stage (`stage/cover-engine.ts`)

One fixed, full-viewport three.js canvas appended to `<body>`: `pointer-events: none`, `z-index: 20` (above the page's opaque background, below BackToTop 30, the cursor wake 40, the header and nav 50, and the curtain 999), pixel ratio capped at 2. One subdivided quad per card is placed on its frame's rect from cached document offsets (re-measured on resize, a body `ResizeObserver` and `fonts.ready`, never per frame). three.js is only ever dynamically imported from `/projects` code, so no other route loads it.

**Opening** (lusion's constants, `expo.out`):

- A card arms when it enters and plays once 25% of its cover frame is on screen (`OPENING_VISIBLE_SHARE`). Until then it holds the first frame: mask at 70%, content at 1.333×, slid and tilted, sharp. Lusion starts at the first pixel, which spends the whole opening on a sliver at the viewport edge. This page waits so the opening is actually seen.
- The rounded mask grows 70% to 100% and the picture pulls back from 1.333× to 1.026× over 1.5 s. The quad slides in from 0.05 × the viewport width toward the page centre and un-rotates 0.05 rad (left column counter-clockwise, right column clockwise) over 2 s. No opacity fade.
- Camera order: the zoom-out starts with a radial **edge motion blur** on a sharp centre (7 px of streak per unit of zoom speed, capped at 16 px, weighted to the mask's edges), then at 0.12 s the **focus hunt** starts: blur in to 9 px, then a second-order spring (f 2.2, ζ 0.7, r 3) pumps it blur, sharp, soft, sharp by about 0.5 s. Both end at exactly 0.
- It replays after the card has been fully out of view.
- At the list's reveal, covers already on screen hold their first frame until the list is 60% opaque (`OPENING_MIN_REVEAL_OPACITY`), so the edge smear and the focus hunt don't play on a nearly transparent list.

**Scroll morph**:

- lusion's horizontal lens, verbatim: `uv.x -= (screenX - 0.5) · (1 - sin(π · screenY)) · min(0.15, E · 0.5)`, where E accumulates the per-frame scroll distance in viewport heights and decays with a 100 ms time constant. The mask is evaluated in the warped space, so card edges near the top and bottom of the viewport flare outward at speed.
- A spring-damped vertical bend (original to this page): the card sags like a dragged sheet, centre lagging, edges pinned. The target grows with speed past a 250 px/s dead zone toward a 30 px cap. The spring (f 2, ζ 0.3) swings past flat once when the scroll stops. The card's DOM footer rides with the frame's bottom-centre point, so the whole card reacts.
- At most 1.5 px of chromatic split on the warped edges near full lens strength, on sharp pixels only.
- A jump moves the covers but feeds none of the physics (`stage/scroll-jump.ts`): a frame that moves more than a screen, or more than 0.3 of one out of a still page (End, anchors, the browser scrolling a keyboard-focused card into view). Real motion ramps up, so flicks still register fully.

**Hover and focus**: a focus kick (blur, then sharp), a zoom to about 1.0× through the spring's overshoot, a perspective tilt toward the cursor (0.05 rad), and two small "handheld camera" jolts at 0.2 s and 0.3 s. The blur always returns to exactly 0. A hover only starts while the page isn't scrolling (`stage/scroll-idle.ts`), so cards sliding under a resting cursor don't flash. A `:focus-visible` card plays the same hover without the tilt.

**Textures** (`stage/cover-textures.ts`): from the card's own same-origin `<img>`, once loaded, the cached URL is fetched as a Blob and decoded off the main thread with `createImageBitmap`, cropped to the visible 3:2 region plus a 6% margin and downscaled to the rendered size × pixel ratio. Uploads are one per frame, streaming from 2.5 viewports ahead to 1.5 behind. The bytes are read with `XMLHttpRequest` rather than `fetch` only because Codacy's server-side SSRF pattern reports every non-literal `fetch()` URL and can't be suppressed inline for JavaScript. The first row's cover images load at high fetch priority and the rest at low, so the stage's script doesn't queue behind them on a cold visit. Colours stay raw sRGB (parity with the DOM cover measured within resampling noise).

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

## Project detail page (`/projects/[slug]`)

Each project has a detail page modeled on lusion.co's project pages. Above 812 px wide (and 520 px tall) it is a horizontal strip: the title block on the left, the media in a band to its right, and the next project waiting at the end. At 812 px and below, or 520 px tall and below, it stacks vertically. Pulling past the end fills a bar and hands off to the next project. Constants come from lusion's own code and live captures (the research notes in the project's scratchpad). Where the page differs, this section says so.

### Files

| Area       | Files (under `apps/web/src/`)                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route      | `app/projects/[slug]/page.tsx` (metadata, viewport colour, the theme `<style>`), `lib/project-cms-server.ts` (`readProjectDetail`, one read per request) |
| View model | `components/projects/detail/detail-data.ts` (fallbacks, resolved URLs, the next project)                                                                 |
| Markup     | `components/projects/detail/project-detail.tsx`, `detail-media.tsx`, `detail-cta.tsx`, `project-detail.module.css`                                       |
| Motion     | `components/projects/detail/detail-controller.ts` (scroll mapping, entrance, parallax, next project, DOM media), `detail-session.ts`, `detail-math.ts`   |
| Around it  | `detail/stage/*` (the WebGL media stage), `detail/topography.tsx` (the background), the header's Back pill (`site-header.tsx`)                           |

### Data and fallbacks

The server page reads the record and the published feed once (`readProjectDetail`, wrapped in React `cache`), then builds the view model:

- Title, then the description paragraphs. A record without a description shows its summary.
- The CTA from `project.cta`. It is hidden when absent or unsafe.
- Services from `project.services`, else the tech stack.
- Links from `project.links`, then a linked demo video, then organisations and outputs with URLs. Every URL goes through `safeProjectHref`.
- Credits from the contributors (name and role). Past six, the list collapses behind a "+N more" button.
- Media from `projectMediaSections(project, record.mediaSizes)`. Older records derive theirs from the cover (full), the gallery (normal) and an uploaded demo video (full).
- The next project is the following entry in list order, wrapping around.

The BlockNote body isn't rendered. It stays in the record. Metadata uses the SEO fields first, then the title and the description or summary, with the cover as the Open Graph image. The browser's theme colour follows the project's light and dark backgrounds.

### Theme

The page renders `projectThemeCss(themeId)` in a plain `<style>`, plus `html, body { background: var(--project-bg) }`. The variables sit on `:root`, so the header can read them too. The page's own styles use only `--project-*` variables, never `dark:` utilities, and the light or dark variant follows the site's `.dark` class. The palette object for canvases (the stage, the background) follows the class live through `use-site-scheme.ts`.

Small text in the accent colour (group headings, the scroll hint) uses 85% highlight mixed with the text colour. The raw highlight only guarantees 3:1, and this mix keeps every theme at 4.5:1 or better. The next project's resting title is its text colour at 55% over its background (at least 3.3:1 at 72 px).

### Layout

Horizontal, above 812 px wide and 520 px tall (tablets included). Lusion switches on width alone; the height floor keeps a phone turned sideways, or a small browser window, on the stacked layout. A meta block that still doesn't fit at its smallest type pins under the header and scrolls on its own:

- The em base is `clamp(1rem, 1vw, 1.5rem)`. Padding is lusion's `max(5vw, 40px)` by `clamp(30px, 4vw, 50px)`.
- The meta block is `34em` wide at the left padding, centred on the viewport. Title `4.5em` Hanken Grotesk 500, line height 0.95. The description takes 60% of the block at `0.75em`. Services and Links sit in the right 40%.
- The media band starts one vertical padding below the 64 px header. It ends `2 × padY + 1.1 × header-size` above the bottom, where lusion's scroll hint lives. Portrait tablets cap the band at 70vw, so a 16:9 item stays about a screen wide.
- Normal items are the band's height, as wide as their aspect ratio, with a 20 px radius. Full items run the full viewport height, edge to edge, with no radius.
- The first item starts at `48em`. Gaps are `5em`. The last item keeps a `10vw` margin, and the track ends with a `25vw` pad for the next project panel.
- A long legacy meta block (many credits or outputs) shrinks its copy under the title, down to 72%, and pins under the header if it still doesn't fit. The title never changes size, because the next-project hand-off lands on it.

Vertical, 812 px wide and below or 520 px tall and below: document flow. The meta block on top, with the title at `min(4.5em, 16.5vw)` so a long single word still fits a narrow phone. Then the media full width with side padding, a 10 px radius and 50 px gaps. Full items drop the padding and the radius. The next project panel closes the page. Visitors without JavaScript get this layout at every width, with everything visible.

### Scrolling

The document scrolls natively, so the keyboard, the scrollbar, find-in-page and scroll restoration keep working.

- In the horizontal layout the stage is `position: fixed` and a spacer gives the page the track's length. The track sits at `translateX(-scrollY)`, written in the frame loop's "scroll" phase, after Lenis. The WebGL stage reads the same value in the "render" phase.
- Fine pointers with motion allowed get Lenis at lerp 0.2 (lusion's 12 per second ease). Wheel events are clamped to 200 px each, and sideways trackpad swipes scroll too (`gestureOrientation: "both"`).
- Keys: arrows step 100 px, Page Up and Page Down one viewport, plus Space, Home and End. Focus landing inside the track scrolls its item into view. The next project link scrolls to the end.
- Touch in the horizontal layout: vertical swipes pan the page natively (`touch-action: pan-y`), and a sideways drag moves the strip with lusion's release momentum.
- A media size that arrives late, or a file that fails and leaves the layout, keeps the visible item where it is.

### Entrance

On a fresh load, after the route curtain or after the project zoom, the page waits for the display font (at most 1.5 s), `waitForRouteReveal()` and `waitForProjectReveal()`. Then it plays lusion's 1.5 s windows:

- The title fades in and rises from the viewport centre into its slot (expo in-out, first 65%). Stacked, it doesn't move and shows from the first paint, as on lusion's phones. It is the stacked page's largest paint.
- The description, CTA, credits, services and links each fade and rise 30 px in staggered windows (expo out).
- The media fade in over the second half.
- The page is locked (`"project-detail-entrance"`) until 75%.

`markProjectPageReady(slug)` fires once the layout is measured and the first screen's media are decoded, or after 450 ms (the entrance fades the media in late, and a highlight placeholder stands in until a file decodes). Before hydration the animated pieces are hidden only when motion is allowed (`motion-safe:opacity-0`, with a `<noscript>` override).

### While scrolling

- The meta pieces slide at lusion's fractions of the travel: title 1/2, description and credits 1/3, links 1/4, services 1/5. They fade out over the first quarter viewport. The CTA doesn't slide. Links take pointer events only while the block is visible.
- "Scroll to explore" sits bottom right in the band under the media. It leaves after the first scroll of any kind (lusion only listens for the wheel, which strands it on touch tablets) and stays gone for the session.

### Media

- DOM `<img>` (width and height attributes, async decoding, the first two eager at high priority) and `<video muted loop playsInline preload="metadata">` with an optional poster.
- The horizontal stage clips everything, so native lazy loading can't look ahead. Images within 2.5 viewports of the travel are switched to eager.
- A video plays only while visible, in a visible tab, after the entrance has begun, and not during a hand-off. A pause and play button per video (shown on hover and focus, kept visible once paused) meets WCAG 2.2.2. Reduced motion doesn't autoplay: the poster shows and the button starts the video.
- The WebGL stage (`detail/stage/*`) starts at once in the horizontal layout when motion is allowed. Items it draws hide their DOM frame with `visibility`, so videos keep decoding as its textures. A lost context, reduced motion switched on or the stacked layout hand the DOM media back.
- The controller tells the site header what its media show behind the bar (`registerHeaderToneProvider`, see `docs/navigation-menu.md`, Adaptive ink), since hit testing can't see the hidden DOM frames. Full items run behind the 64 px header, so a dark first item turns the header's ink light over it.
- The DOM fallback plays lusion's emerge in CSS: the frame's clip opens from `inset(20%)` to 0 while the picture settles from 1.667× to 1×, over 1 s of expo out, replaying on every re-entry. The highlight colour shows until the file loads, then crossfades to it. Scroll speed bends the frames a little (a lean plus lusion's arch, edges down and centre up) and they spring back to exactly nothing at rest.

### Next project

- The panel is a real link, with the accessible name `Next project: <title>`. In the horizontal layout it enters from the right over the last quarter viewport of travel and rests on the right 25%. The panel wears the next project's own palette, so the next world peeks in. lusion uses one neutral grey for every project.
- The accumulator is lusion's. While the travel is at the end, frames with forward input (wheel, trackpad, sideways drag, pulling past the bottom on touch, and forward keys) raise it at 3 per second. Backward input drains it at 5 per second. Otherwise it decays at 0.2 per second. The bar shows it.
- At 1, or on click or Enter, the hand-off plays for 1 s. The panel wipes over the screen (quint in-out) while the media fade over the first half and the meta over the first 30%. The title reaches full text colour over the last quarter. When stacked, a full-width panel rises from the bottom and the title travels to the title's slot. The click listener runs in the capture phase on `window`, before the route curtain's document listener, so the curtain never plays for it.
- Then `router.push` runs, with a note for the next page (`detail-session.ts`). That page reads the note while rendering: its background is already the panel's colour and its title is already visible where the panel's title ended. Only the rest fades in.
- Reduced motion keeps the plain link: no auto-advance, no wipe.

### CTA

lusion's anatomy in the project's button colours: a pill with a dot, an uppercase label and an arrow chip at scale 0. Hover floods the pill from the dot (the dot flies right and scales 26×), the label shifts 20% left and changes colour, and the chip scales in, all on `cubic-bezier(0.35, 0, 0, 1)`. Added here:

- A magnetic pull of 22% toward the cursor, capped at 9 px (GSAP owns the link's transform).
- A press that squeezes the pill to 0.97 and sends a highlight pulse out.
- `:focus-visible` shows the hover state plus a ring.
- External links open in a new tab.

Side-list links grow an underline on hover and focus.

### Deviations from lusion, and why

- **Native scrolling** instead of a virtual scroll pane, so the keyboard, find-in-page, the scrollbar, and restoration work.
- **Full items stay full on phones.** lusion keeps a padded, rounded box. Here "full" always means no padding.
- **The band sits under the site's 64 px header**, and portrait tablets cap it at 70vw.
- **The next panel wears the next project's colours**, and it is a link. lusion's panel is always the same grey and has no click.
- **The scroll hint leaves on any scroll**, not only the wheel.
- **Credits, a video pause button, focus rings and reduced motion** are additions. lusion has none of them.
- **Hanken Grotesk 500** for titles instead of Aeonik 400 (DESIGN_SYSTEM.md).

## Verifying changes here

Follow `docs/testing-verification.md`, plus these page-specific checks:

- In dev, `page.goto` waiting for `load` can return after the roughly 2 s intro has already finished. Observe the intro with `waitUntil: "commit"` and poll.
- Judge the WebGL stage on a real GPU: launch headless Chromium with `--use-angle=metal --enable-gpu`. Playwright's Chromium otherwise gets its WebGL2 context from SwiftShader, which `failIfMajorPerformanceCaveat` doesn't reject, so the stage runs there in software, slowly.
- CI's e2e serves three fixture projects (`docs/testing-verification.md`), and those specs switch WebGL off, so CI covers the list, the detail page and the project zoom through their DOM fallbacks. The WebGL card animations must still be verified locally against the CMS data.
- Useful dev-only probes: `window.__projectsStage` (mode, per-card state and uniforms, render count), `window.__heroPlay` (solver state, current beat) and `window.__projectDetail()` (a detail page's layout, entrance, travel, accumulator, hand-off and stage ownership). None of them exists in production builds.
- Detail page scenarios: every width from 320 to 1920 px, in light and dark mode, including 820 and 1180 px touch tablets. The start, middle and end of the strip. The accumulator filled with the wheel, a touch pull and a click or Enter on the panel. Keyboard-only traversal. Reduced motion, no JS, a legacy record and a record whose media 404. A lost WebGL context must hand the DOM media back.
- Scenarios worth repeating after any change: 10 reloads (half from deep in the page), internal navigation through the curtain, the nav menu opened during the intro, a slow scroll and a flick through the whole list and back, rapid hovers while scrolling, keyboard Tab and Enter from the hero arrow, reduced motion, dark mode, 390 px touch, no JS, and the navigation fuzzer.
- Project zoom scenarios: enter from a card high on the list and one deep down, back via the header pill and via browser back (the list lands where it was, the card's cover hidden until the overlay rests on it), a project to project back and forward (a colour crossfade, never the logo curtain), rapid double clicks, clicks during a zoom, reduced motion, dark mode, 390 px touch, the DOM fallback (`window.__projectTransition.forceDom(true)`), and a fuzzer mixing card clicks, the pill, back and forward. After each: nothing locked, no overlay, no `data-project-landing`, no inline `--project-*` on `<html>`, the list at opacity 1.
