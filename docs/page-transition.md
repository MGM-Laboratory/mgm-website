# Page Transition Curtain

Every internal client-side navigation plays a full-screen transition: the MGM logo covers the screen, the destination page loads behind it, then it reveals. Built across PR #45 and #46. All of it lives in `apps/web/src/components/transition/route-transition.tsx` (`RouteTransition`), mounted in `layout.tsx` as a sibling of `<SiteHeader>` and outside `<SmoothScroll>`. This is deliberate: neither the header's stacking context nor the smoother's transform wrapper (see `docs/architecture.md`'s root layout chain) affects it.

## How coverage works

No SVG masking or clip-path: coverage is pure `transform-origin` + `scale` on a white-tone `LogoMark` (`tone="white" solid`, see `hero/shapes.tsx`). Two full-screen `fixed inset-0 z-[999]` sibling divs: a plain white wash, then a `bg-[var(--brand-blue)]` div containing the logo, painting over the wash by DOM order. Blue only becomes visible as the logo shrinks back toward idle size. At full "giant" scale, the logo's own white fill is all that's on screen.

`LOGO_PIVOT = "50% 44%"` and `GIANT_SCALE_MULTIPLIER = 20` are both empirically tuned, not arbitrary:

- The pivot point matters more than the scale multiplier. Scaling from a point that sits too close to a gap between the logo's three shards just reveals more gap as it grows. Dead-center (50%, 50%) is technically inside white fill but close enough to a shard edge that coverage was **non-monotonic** (passed at one scale, failed at a larger one). `50% 44%` is a genuinely interior point, confirmed to stay inside solid fill across an increasing range of scales, which guarantees coverage only gets _better_ as scale grows, never worse.
- The scale itself is computed at runtime from the logo's measured bounding box vs. the viewport diagonal (`getGiantScale()`), not hardcoded: `GIANT_SCALE_MULTIPLIER` is a margin on top of that, empirically verified across seven aspect ratios (tall mobile needs ~18x; wide desktop covers under 10x).

**Gotcha carried over from the nav menu's own history**: the overlay's click-blocking is set via `setOverlayBlocking()` writing `pointerEvents` as an **inline style**, not a Tailwind class. A static `pointer-events-none` default and a toggled `pointer-events-auto` class resolve by generated-CSS source order, not by which class was added most recently, so class-based toggling silently never took effect once before. Inline style always wins; don't regress this back to a class toggle.

## Sequence and timing

| Phase  | Function             | Duration           | What happens                                                                                                                                                           |
| ------ | -------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover  | `startCover`         | 0.56 s total       | White wash fades in (0.1 s, `power2.out`); logo set to giant scale + settles (0.06 s, default ease); logo shrinks giant→idle scale/rotation (0.4 s, `power3.out`)      |
| Hold   | `engageHoldIfNeeded` | until `routeReady` | A breathing yoyo (`scale: 1.08`, 0.9 seconds, `sine.inOut`, `repeat: -1`): see the timing note below                                                                   |
| Reveal | `startReveal`        | 0.67 s total       | Logo grows to giant scale + rotates (0.22 s, `power4.in`, accelerating); blue overlay fades out (0.1 s, `power3.in`); white wash fades out last (0.35 s, `sine.inOut`) |

`router.push(href)` fires immediately once the cover timeline is built. Navigation and the cover animation happen concurrently, not sequentially.

**Floors**: a normal link click can't reveal before `coverAnimDone (0.56s) + MIN_STAY_MS (0.5s)` ≈ **1.73 seconds** even for a destination that's instantly ready. `MIN_STAY_MS` exists so the curtain never flashes for a fast route. `CEILING_MS = 8000` is a hard backstop: if the destination never signals ready at all, the transition force-reveals anyway rather than hanging forever. A browser back/forward (`startPopstateCover`) skips the cover animation entirely (the browser already navigated) and floors at `MIN_STAY_MS + reveal` ≈ **1.17 seconds**.

**Known code-comment/behavior mismatch** (verified 2026-09-19, not yet fixed, flagging so nobody "fixes" the comment by changing the behavior without checking which one is actually wrong first): the breathing hold-loop's own comment describes it as being for "genuinely slow" destinations, but `HOLD_DELAY_MS = 600ms` is measured from transition start (t=0), while the earliest a reveal can legally happen is t≈1.06 seconds (`coverAnimDone` + `MIN_STAY_MS`). Since 600 ms always elapses before 1.06 seconds, the hold timer fires, and the breathing loop starts, on **essentially every navigation**, not just slow ones. It's a ~460 ms cosmetic overlap in practice, not a functional bug, but the comment oversells the condition it actually gates on.

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

## Skipping the homepage's entrance animation on internal navigation

Landing on `/` via internal navigation (not a fresh load) skips the hero's entrance animation entirely, jumping straight to its final resting state. This is a **separate mechanism** from the curtain above, coordinated through one shared module-level flag:

- `apps/web/src/lib/app-boot.ts`: `appHasBooted` (module-level `boolean`, starts `false`), `markAppBooted()`, `hasAppAlreadyBooted()`. A hard reload re-evaluates the module (resets to `false`); a client-side navigation within the same session doesn't.
- `apps/web/src/components/app-boot-tracker.tsx`: `<AppBootTracker />`, mounted in `layout.tsx` before `<RouteTransition />`, calls `markAppBooted()` in a mount effect and renders nothing. Persists across all client-side navigations since it's above the page-content boundary.
- `hero/hero.tsx` reads the flag **synchronously during its first render**, not inside an effect or async callback: `if (skipRef.current === null) skipRef.current = hasAppAlreadyBooted();`. This ordering is load-bearing: by the time a later `document.fonts.ready.then()` callback would run, `AppBootTracker`'s own effect has already fired for _this_ commit, so reading the flag lazily inside that callback would always (incorrectly) report "already booted," even on a fresh load.

The actual skip check (inside `gsap.matchMedia()`, after fonts are ready and `SplitText` has split all three hero lines) is `if (reduced || startedScrolled || cameFromInternalNav)`: `startedScrolled` (`window.scrollY > 40` at mount) handles a reload that lands mid-page, and `cameFromInternalNav` is the flag above. Taking this branch does a single `gsap.set()` to the fully revealed end state and returns. The idle float loops and mouse-parallax setup that the full entrance's `onComplete` would otherwise wire up never run at all in this case (not a bug: those are decorative loops the skip path has no need for).
