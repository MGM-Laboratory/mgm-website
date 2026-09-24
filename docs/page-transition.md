# Page Transition Curtain

Every internal client-side navigation plays a full-screen transition: the MGM logo covers the screen, the destination page loads behind it, then it reveals. Built across PR #45 and #46. All of it lives in `apps/web/src/components/transition/route-transition.tsx` (`RouteTransition`), mounted in `layout.tsx` as a sibling of `<SiteHeader>` and outside `<SmoothScroll>`. This is deliberate: neither the header's stacking context nor the smoother's transform wrapper (see `docs/architecture.md`'s root layout chain) affects it.

## How coverage works

No SVG masking or clip-path: coverage is pure `transform-origin` + `scale` on a white-tone `LogoMark` (`tone="white" solid`, see `hero/shapes.tsx`). Two full-screen `fixed inset-0 z-[999]` sibling divs: a plain white wash, then a `bg-[var(--brand-blue)]` div containing the logo, painting over the wash by DOM order. Blue only becomes visible as the logo shrinks back toward idle size. At full "giant" scale, the logo's own white fill is all that's on screen.

`LOGO_PIVOT = "50% 44%"` and `GIANT_SCALE_MULTIPLIER = 20` are both empirically tuned, not arbitrary:

- The pivot point matters more than the scale multiplier. Scaling from a point that sits too close to a gap between the logo's three shards just reveals more gap as it grows. Dead-center (50%, 50%) is technically inside white fill but close enough to a shard edge that coverage was **non-monotonic** (passed at one scale, failed at a larger one). `50% 44%` is a genuinely interior point, confirmed to stay inside solid fill across an increasing range of scales, which guarantees coverage only gets _better_ as scale grows, never worse.
- The scale itself is computed at runtime from the logo's measured bounding box vs. the viewport diagonal (`getGiantScale()`), not hardcoded: `GIANT_SCALE_MULTIPLIER` is a margin on top of that, empirically verified across seven aspect ratios (tall mobile needs ~18x; wide desktop covers under 10x).

**Gotcha carried over from the nav menu's own history**: the overlay's click-blocking is set via `setOverlayBlocking()` writing `pointerEvents` as an **inline style**, not a Tailwind class. A static `pointer-events-none` default and a toggled `pointer-events-auto` class resolve by generated-CSS source order, not by which class was added most recently, so class-based toggling silently never took effect once before. Inline style always wins; don't regress this back to a class toggle.

## Sequence and timing

| Phase  | Function             | Duration           | What happens                                                                                                                                                            |
| ------ | -------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover  | `startCover`         | 0.66 s total       | White wash fades in (0.1 s, `power2.out`); logo set to giant scale + settles (0.06 s, default ease); logo shrinks giant→idle scale/rotation (0.5 s, `power3.out`)       |
| Hold   | `engageHoldIfNeeded` | until `routeReady` | A breathing yoyo (`scale: 1.08`, 0.9 seconds, `sine.inOut`, `repeat: -1`): see the timing note below                                                                    |
| Reveal | `startReveal`        | 0.82 s total       | Logo grows to giant scale + rotates (0.28 s, `power4.in`, accelerating); blue overlay fades out (0.12 s, `power3.in`); white wash fades out last (0.42 s, `sine.inOut`) |

`router.push(href)` fires immediately once the cover timeline is built. Navigation and the cover animation happen concurrently, not sequentially.

**Floors**: a normal link click can't reveal before `coverAnimDone (0.66s) + MIN_STAY_MS (0.75s) + reveal (0.82s)` ≈ **2.23 seconds** even for a destination that's instantly ready. `MIN_STAY_MS` exists so the curtain never flashes for a fast route; it was raised from 500 ms (along with a proportional slowdown of the reveal phase) after the whole curtain read as a blink rather than a beat (issue #60). `CEILING_MS = 8000` is a hard backstop: if the destination never signals ready at all, the transition force-reveals anyway rather than hanging forever. A browser back/forward (`startPopstateCover`) skips the cover animation entirely (the browser already navigated) and floors at `MIN_STAY_MS + reveal` ≈ **1.57 seconds**.

**Loading indicator**: while the destination's `loading.tsx` fallback is up (the `[data-route-loading]` sentinel exists), the curtain shows three pulsing white dots under the idle logo (`rt-waiting-dot`, see globals.css), set immediately by `watchForRouteReady` rather than waiting for the cosmetic `HOLD_DELAY_MS` breathing loop. Routes with no `loading.tsx` (the static ones) resolve on the first rAF and never show the dots, which keeps small pages on the fast floor: the indicator only appears when there is something real to wait for. The dots are CSS-animated; GSAP owns only the curtain layers' `autoAlpha` and the logo's `scale`, so the split stays clean (animation-system.md gotcha #1).

**Known code-comment/behavior mismatch** (verified 2026-09-19, re-verified 2026-09-22 after the issue #60 pacing change, not yet fixed, flagging so nobody "fixes" the comment by changing the behavior without checking which one is actually wrong first): the breathing hold-loop's own comment describes it as being for "genuinely slow" destinations, but `HOLD_DELAY_MS = 600ms` is measured from transition start (t=0), while the earliest a reveal can legally happen is t≈1.41 seconds (`coverAnimDone` + `MIN_STAY_MS`). Since 600 ms always elapses before 1.41 seconds, the hold timer fires, and the breathing loop starts, on **essentially every navigation**, not just slow ones. It's a ~810 ms cosmetic overlap in practice, not a functional bug, but the comment oversells the condition it actually gates on. The dots indicator above is the honest "still waiting" signal; the breathing loop is decorative.

## Readiness detection

`watchForRouteReady()` checks, one `requestAnimationFrame` after the pathname changes, whether `document.querySelector("[data-route-loading]")` exists:

- **Absent** → real content already committed, `routeReady = true` immediately.
- **Present** → a `MutationObserver` on `document.body` waits for that node to be removed (Next's Suspense swap from `loading.tsx` to real content), then flips `routeReady = true`.

The sentinel is `<RouteLoadingSentinel />` (`route-loading-sentinel.tsx`), a single `<span data-route-loading="" hidden />`. **Its own doc comment claims it's "dropped into every route's `loading.tsx` fallback": this is inaccurate.** As of 2026-09-19 it's wired into exactly 8 of the 18 route trees, all under CMS-backed dynamic routes that actually have a `loading.tsx`:

```
member/loading.tsx           member/[slug]/loading.tsx
articles/loading.tsx         articles/[slug]/loading.tsx
careers/loading.tsx          careers/[slug]/loading.tsx
events/loading.tsx           events/[slug]/loading.tsx
```

Every other route (home, about, contact, the four Focus pages, projects, publications, research, legal pages) has no `loading.tsx` at all, so for those the sentinel check always finds nothing and `routeReady` resolves on the first rAF, gated only by `MIN_STAY_MS`. If a future route gets real Suspense-boundary loading states, add the sentinel to its `loading.tsx` too. Otherwise the curtain will reveal before that route's content is actually ready.

## What triggers (and doesn't trigger) the curtain

Click interception is wired in a `useEffect` that **only runs under full motion**. It checks `matchMedia("(prefers-reduced-motion: no-preference)")` once at mount, not reactively, so a preference change mid-session doesn't retroactively enable/disable it. A hard/initial page load never shows the curtain (deliberate: an SSR-visible "always covering" curtain would strand no-JS visitors).

The capture-phase click handler bails out (lets the click through normally) on: `defaultPrevented`, a non-left-click, any modifier key held, no ancestor `<a href>`, a `target` other than `_self`/empty, a `download` attribute, an empty/`#`/`mailto:`/`tel:` href, a cross-origin URL, either side being under `/admin`, or navigating to the exact same pathname. A click while a transition is already in progress is dropped entirely (no queueing: the second click just does nothing).

Two exceptions belong to the project zoom (see the last section). Project card clicks never reach this handler: the zoom's capture listener sits on `window`, runs first and prevents the default. Back and forward between `/projects` and a project, or between two projects, are skipped through `claimsProjectPopstate()` (`lib/project-transition.ts`) while the zoom layer is mounted and motion is allowed.

Back/forward (`popstate`) covers the page too, except when the pathname doesn't change. Following a same-page fragment link (`<a href="#x">`), or going back from one, also fires `popstate`; covering for it would wait up to the 8-second ceiling for a route change that never comes, so `RouteTransition` compares against the pathname currently on screen and ignores those. In-page anchors that animate should still call `preventDefault` and scroll through `scrollPageTo` (`lib/page-scroll.ts`) so they cooperate with a page's smooth scroller.

## Skipping the homepage's entrance animation on internal navigation

Landing on `/` via internal navigation (not a fresh load) skips the hero's entrance animation entirely, jumping straight to its final resting state. This is a **separate mechanism** from the curtain above, coordinated through one shared module-level flag:

- `apps/web/src/lib/app-boot.ts`: `appHasBooted` (module-level `boolean`, starts `false`), `markAppBooted()`, `hasAppAlreadyBooted()`. A hard reload re-evaluates the module (resets to `false`); a client-side navigation within the same session doesn't.
- `apps/web/src/components/app-boot-tracker.tsx`: `<AppBootTracker />`, mounted in `layout.tsx` before `<RouteTransition />`, calls `markAppBooted()` in a mount effect and renders nothing. Persists across all client-side navigations since it's above the page-content boundary.
- `hero/hero.tsx` reads the flag **synchronously during its first render**, not inside an effect or async callback: `if (skipRef.current === null) skipRef.current = hasAppAlreadyBooted();`. This ordering is load-bearing: by the time a later `document.fonts.ready.then()` callback would run, `AppBootTracker`'s own effect has already fired for _this_ commit, so reading the flag lazily inside that callback would always (incorrectly) report "already booted," even on a fresh load.

The actual skip check (inside `gsap.matchMedia()`, after fonts are ready and `SplitText` has split all three hero lines) is `if (reduced || startedScrolled || cameFromInternalNav)`. `startedScrolled` (`window.scrollY > 40` at mount) handles a reload that lands mid-page, and `cameFromInternalNav` is the flag above. This branch sets the fully revealed end state. On desktop, normal-motion visitors also get the same idle loops and text/shape parallax as a completed fresh entrance; reduced motion skips those effects. The idle context, pointer tweens, and visibility observer are cleaned up on breakpoint changes and unmount.

## Waiting for the reveal before playing entrances

The projects list hero needs the opposite treatment from the homepage: its entrance is part of what the page is for, so it must be _seen_, never skipped. It therefore waits for the curtain instead of skipping behind it.

- `apps/web/src/lib/route-reveal.ts`: the shared signal: `markRouteCoverStarted()` (called by `RouteTransition` from both `startCover` and `startPopstateCover`), `markRouteRevealDone()` (called as the reveal's final white wash fades below 30% opacity, `REVEAL_SIGNAL_OPACITY`, and again from the timeline's `onComplete` and the refs-missing early return), and `waitForRouteReveal()`, a promise that resolves immediately when no transition is in flight and otherwise once the reveal is that far along. Waiting for the wash's last, nearly transparent frames left almost a second of blank page before the entrance began, so the signal fires once the page is plainly visible. Module-level state resets on a hard reload, so fresh loads resolve instantly.
- `projects/projects-hero.tsx` reads `hasAppAlreadyBooted()` synchronously during render (same load-bearing ordering as the homepage hero above): on a fresh load it plays immediately after `document.fonts.ready` (bounded at 1.5 s), while internal navigation awaits `waitForRouteReveal()` first. The hero's pieces are hidden during the wait so nothing peeks through the curtain. Only `prefers-reduced-motion` jumps straight to the end state. Scroll position never suppresses the entrance: a skipped entrance is exactly the "refresh and it never plays" bug this replaced.
- The same hero also owns the page's intro: from mount until the entrance completes, the page is locked at the top and the project list stays hidden, and the list then fades in (`lib/projects-intro.ts`). On internal navigation that lock is taken under the curtain and held through the reveal and the entrance. The full sequence, its failsafes and its ordering contract are in `docs/projects-page.md`.

Because `RouteTransition` marks the cover started before `router.push`, a hero mounting at any point during the hold phase always sees the transition as in-flight; a hero that mounts only after the reveal (slow routes past the 8-second ceiling) sees none and plays immediately, which is correct since the curtain is gone by then.

## The project zoom (list and project pages)

Navigations between the project list and a project page don't use the curtain. They play the project zoom instead, a lusion.co style transition: clicking a card zooms into its cover and shifts the page to the project's theme, and going back zooms out and lands on the card again. It lives in `components/transition/project-transition.tsx` (the layer, mounted in `layout.tsx` right after `<RouteTransition />`) and `project-zoom.ts` (the controller). The frame maths is in `project-zoom-frame.ts`, the colours and the header tint in `project-zoom-colors.ts`, the WebGL2 renderer in `project-zoom-gl.ts` (dynamically imported on first use, raw WebGL2, no three.js) and the DOM fallback in `project-zoom-dom.ts`. The signals it shares with the pages are in `lib/project-transition.ts`. The list's side of the contract (return mode) is in `docs/projects-page.md`.

### What it takes over

| From        | To                 | Trigger                                                                   | What plays                                                 |
| ----------- | ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/projects` | `/projects/<slug>` | A card click (`a[data-project-transition]`), or a homepage featured link  | Enter: the zoom in                                         |
| a project   | `/projects`        | The header's Back pill, the page's own back link, any link to `/projects` | Exit: the zoom out onto the card                           |
| a project   | `/projects`        | Browser back or forward                                                   | Exit, covered in the same task as the browser's navigation |
| a project   | another project    | Browser back or forward                                                   | Swap: a crossfade from one page colour to the other        |
| `/projects` | a project          | Browser forward                                                           | Swap (the route commits too soon for a zoom)               |

Clicks go through a capture listener on `window`, which runs before the curtain's listener on `document` and prevents the default, so the curtain bails on `defaultPrevented`. Popstates go through `claimsProjectPopstate(from, to)`, a pure matcher the curtain consults, which claims only while the layer is mounted and motion is allowed. Every pair it claims has a handler. The "next project" navigation a project page does itself with `router.push` never reaches either listener and plays whatever the page plays.

Same bail-outs as the curtain: a modifier key, a non-left button, a `target` other than `_self`, `download`, `/admin`, the same pathname. Reduced motion never intercepts anything (see below). While a transition runs, every click anywhere is swallowed (`preventDefault` and `stopPropagation` in the capture phase), so nothing navigates or toggles under the overlay.

### Stacking and blocking

The overlay is `fixed inset-0 z-[45]`: above the page, the WebGL cover stage (20), BackToTop (30), the cursor wake and the nav menu (40), and below the header (50), which stays visible above the zoom and walks to the project's colours. A second element, a transparent shield at `z-[51]` over the header's 64 px, takes pointer input only while a transition runs. Both toggle `pointer-events` as an inline style (the gotcha at the top of this page). The nav menu renders inside the header, so an exit through the menu's Projects link shows the menu over the colour cover until it closes on the route change.

### Enter

1. At the click: the card's cover frame rect and radius, its `<img>`, the theme (`data-project-theme`, the light or dark variant by the site's current `.dark` class) and the list's scroll position are taken. The scroll lock is taken (`"project-transition"`), `markProjectCoverStarted()` and `expectProjectPage(slug)` are called, and the route's full payload is prefetched. `pointerdown` already warms the renderer, decodes the cover and prefetches.
2. The zoom waits up to 300 ms for the renderer and the decoded cover (16 to 62 ms measured). Its first frame is the card itself at its rest overscan, so showing the overlay changes nothing on screen.
3. 1.5 s on the GSAP ticker. The quad travels from the frame's rect to the screen centre and grows to 1.2 times a cover fit of the viewport (cubic in-out, done by 82%), swinging up to about 4 degrees with its inner side receding. The picture zooms into its centre from the rest overscan to 2.5 times, accelerating to the end. A radial motion blur follows the zoom speed, a radial chromatic split peaks mid-zoom, a slight barrel bulge grows, and the picture dissolves into the theme background from the rim inward, the centre last. A full-screen theme colour layer fades in over the list (10% to 72%), and the header palette walks to the theme's.
4. `router.push` only once that layer is opaque: a route committed earlier would show through it. The payload is prefetched, so the commit is usually immediate.
5. Hold on the solid theme colour until the project route has committed (8 s ceiling) and the page has called `markProjectPageReady(slug)`, or 2 s after the commit. The clock starts at the commit, not the click: the route only changes about 1.1 s into the zoom, and a slow server commits it later still. Then `markProjectRevealStarted()`, which releases the page's `waitForProjectReveal()`, and the overlay fades out over 0.35 s onto the page's own background, the same colour.

The project page reports ready once its first three media have decoded (`detail-controller.ts`, bounded by its own timeout), usually a few hundred milliseconds after the commit. Its entrance waits for both `waitForRouteReveal()` and `waitForProjectReveal()`, so it plays as the overlay clears whichever way the page was reached.

### Exit

1. At the trigger (in the popstate handler itself for browser back): an instant cover in the project page's own background colour, so only its content goes. On a themed page that is its resolved `--project-bg`, read from `:root`: the value the page's root, `html` and `body` all paint. The cover address to decode ahead comes from the root's `data-project-cover`. The header palette is pinned where it is. The return note is left for the list (`setProjectReturn({ slug, scrollY })`, with the scroll position only if this visit started from that card), and `skipScrollReset("/projects")` stops the smooth scroller jumping the list to the top. Clicks navigate with `router.push("/projects", { scroll: false })`: Next's own scroll to top runs after the page's layout effects and would undo the list's restore.
2. The list commits in return mode, already scrolled back to the card, with the card's cover hidden.
3. The cover holds until the card's picture is decoded (1.5 s at most) and the covers on screen can paint (1.2 s at most). A picture that decodes later is uploaded mid-zoom, while the dissolve still hides the swap.
4. 1.3 s: the reverse zoom. The dissolve clears centre first, the blur and the split fade, the quad shrinks and swings back onto the card's rect (re-measured every frame), the colour layer fades out (22% to 82%) and the header walks back to the site tokens. At 90% it rests on the card: the real cover is unhidden under it and the quad fades out over the last 10%. Measured against the real card at that moment, the difference is 0.63 levels on average.
5. No card to land on (an empty list, a project that isn't listed, a card less than 30% on screen): the cover just fades out over 0.45 s.

### Swap

An instant cover in the current page's background and `markProjectCoverStarted()`. Once the route commits, a 0.45 s crossfade to the new page's background (read from its theme after it has committed), with the header palette, then the reveal signal and a 0.3 s fade.

### Header colours

The header reads `--project-bg`, `--project-text`, `--project-highlight` and the `--project-button-*` variables, each falling back to a site token. A themed project page sets them on `:root` from its own stylesheet when it commits, which lands mid-zoom and would snap the header. So while a transition runs, the controller writes all of them as inline custom properties on `<html>` (inline beats the page's `:root` rule) and lerps them in sRGB every frame. It writes one property at a time with `setProperty`, because the scroll lock owns `overflow` and `scrollbar-gutter` on the same element. Colours are resolved through a hidden probe element, which handles `var()` chains and `color-mix()`. `finish()` removes them, and the page underneath then carries the values the walk ended on. The header also eases its colours over 0.5 s in CSS, so the walk ends early (by 80% on the way in) to arrive in time.

The project page's own next-project wipe navigates by itself, so the zoom never sees it and the header would keep the old project's colours until the next page commits. `walkHeaderPalette(palette)` (`project-zoom-colors.ts`) is the same walk for that case, with the caller driving the progress: start it with the next project's palette when the wipe starts, `set(t)` every frame, and `release()` in the page's cleanup (the old page unmounts in the same commit that mounts the new one, whose stylesheet then carries the values) or when the wipe is abandoned.

### Cleanup

Every flow ends in one `finish()`, whichever way it ended (landed, revealed, aborted, replaced by another flow, unmounted). It kills the tweens, releases every pending wait, calls `markProjectRevealStarted()`, releases the scroll lock, clears the inline blocking and the inline colours, unhides any landing card, clears the return note and the scroll-reset skip, and hides the overlay. A route that settles anywhere the flow didn't mean to go aborts it with a 0.2 s fade. A return note is also dropped whenever the route settles anywhere but the list, so an abandoned exit never leaves the next ordinary list visit in return mode.

### Reduced motion and fallbacks

- Reduced motion: no interception, no overlay, native navigation. The one trick left is the list's scroll position: going back to the list (a link or browser back) scrolls it to the card again (`restoreOnly` in the return note).
- No hardware WebGL2 (`failIfMajorPerformanceCaveat`), a lost context, or a renderer that failed to load: the DOM fallback. It is a fixed clone of the cover moved by the same frames with CSS transforms, with a CSS blur for the streak and a radial `mask-image` for the dissolve over the theme colour. No split and no bulge. It waits (200 ms at most) for the clone's picture to decode before it replaces the card.
- Touch uses the WebGL renderer too: the overlay isn't scroll-synced.

### Verifying

- Dev builds expose `window.__projectTransition`. `state()` reports the running flow and renderer, the overlay's visibility, the inline blocking, the `html` overflow, landing cards, inline colours, the pending note, the renderer's status, the last prepare timings and the current progress. `setSlowdown(factor)` stretches every duration for slow-motion frame sheets, and `forceDom(true)` forces the fallback.
- In dev the CMS media route takes 1 to 8 s per image, and the first visit to each route compiles it: judge holds and timings on a production build.
- A pixel diff of a card before and after a zoom must keep the pointer off the card: a hovered card on the WebGL stage rests at about 1.0 times instead of 1.026.
- Playwright's Firefox screenshots can show a frame without the fixed overlay while a route commits, and WebKit's video capture has dropped a WebGL canvas. Confirm anything odd with in-page state sampled every animation frame before chasing it.
- CI runs `e2e/project-transitions.spec.ts` over the fixture projects (`docs/testing-verification.md`) with the DOM fallback: a card into its project, the Back pill, browser back and forward, and the next-project hand-off. After each step it checks that nothing is locked, tinted or covering the page, and that the curtain's layers (`[data-route-transition]`) never showed.
