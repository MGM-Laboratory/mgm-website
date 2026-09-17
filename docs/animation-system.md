# Animation System (GSAP)

All site animation is **GSAP 3.15.0** (+ ScrollTrigger, ScrollSmoother). "Heavy animations everywhere" is an explicit design goal — but every animation must degrade gracefully under `prefers-reduced-motion`.

## Setup & conventions

- Plugins registered in `scroll-reveal.ts` (ScrollTrigger) and `smooth-scroll.tsx` (ScrollSmoother).
- **Scroll reveal**: `fadeUpOnScroll(root, selector, {start: "top 85%", stagger, y: 24})` — one timeline with a **timeline-level** ScrollTrigger, `once: true`. Under reduced motion it synchronously `gsap.set(targets, {opacity: 1, y: 0})` and returns null (no animation, therefore no race with hover timelines).
- **Smooth scrolling**: `<SmoothScroll>` in the root layout wraps everything; NOT created under reduced motion.
- **Reduced motion**: components check `matchMedia("(prefers-reduced-motion: no-preference)")`. The pattern is `const d = reduced ? 0 : 1;` and multiplying durations by `d` — timelines still run (content must stay reachable) but collapse to instant swaps. Decorative loops (idle breathing, social wiggle) are skipped entirely under reduced motion.
- **Hydration-safe clock** (`"--:--"` server-side, real time in effect) is the pattern for any time-dependent UI.
- **React 19**: refs pass as props (`ref={ref}`) on function components — no `forwardRef`.

## Animation inventory

| Feature           | File                             | Technique                                                                                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero title        | `hero/hero.tsx`                  | Split-character reveal; `.media-char`/`.mobile-char` need `display: inline-block` (set in globals.css) for per-letter GSAP transforms                                                                                                                                                                                            |
| Hero logo         | `hero/shapes.tsx`                | ShardLogo assembly: 3 shards `.fromTo()` (opacity 0, scale 0.3 + x/y/rotate offsets → identity, `back.out(1.9)`, overlapping)                                                                                                                                                                                                    |
| CTA button        | `hero/see-work-button.tsx`       | Pure CSS gradient rim (`cta-ring-spin`, two half-clips offset half a cycle); disabled under reduced motion in CSS                                                                                                                                                                                                                |
| Core Competencies | `sections/core-competencies.tsx` | 3D flip (`rotationY 0→180`, `back.out(1.5)`) + lift + motif scale + back-content stagger, one paused timeline per card; `[perspective:1400px]` on link, `[transform-style:preserve-3d]` on inner, `[backface-visibility:hidden]` both faces, back pre-rotated `[transform:rotateY(180deg)]`                                      |
| Nav menu          | `nav/*`                          | Staggered prelayers, item sweeps, bento flips/slide-reveals, logo assembly — full spec in `docs/navigation-menu.md`                                                                                                                                                                                                              |
| Process           | `process/*`                      | Mosaic marquee, pattern tiles                                                                                                                                                                                                                                                                                                    |
| About hero field  | `about/bauhaus-field.tsx`        | Hand-composed field of the shared pattern-tile shapes; one timeline-level ScrollTrigger entrance (`back.out`, randomized stagger order) then per-shape idle `y` yoyo loops; mouse parallax reuses hero.tsx's `quickTo` pattern                                                                                                   |
| About sections    | `about/reveal-section.tsx`       | Thin reusable wrapper around `fadeUpOnScroll` — every `/about` section supplies its own `stagger`, tuned down for sections with many items (governance/research/record/open-questions) so a 15–20-item section doesn't take 2+s to fully reveal                                                                                  |
| Evidence Lens     | `about/evidence-lens.tsx`        | Filters `[data-tier]` claims site-wide via one `data-evidence-filter` attribute on `<html>`; dims with `filter: grayscale() opacity()`, never the `opacity` property — `fadeUpOnScroll` writes its end state as an inline `opacity` style, which beats any stylesheet opacity rule on the same element regardless of specificity |

## Gotchas (each of these has already cost real debugging time)

### 1. Never let a CSS class set transform on an element GSAP animates

GSAP **stacks onto** a pre-existing CSS-class transform instead of replacing it (observed twice: `translate-y-full` made a `yPercent` tween a no-op; a static `[transform:translateX(100%)]` class compounded with GSAP's `xPercent` to a 200% offset — computed style was literally `translate(100%,0%) translate(460px,0px)`). Tailwind v4's `translate-x-full` sets the separate CSS `translate` property — same failure mode.

**Rule:** GSAP must be the _only_ thing touching `transform`/`translate`/`rotate`/`scale` on an element, from first paint on (explicit `gsap.set()` in a mount effect). For pre-hydration "hidden" defaults use **opacity/visibility only** (`invisible opacity-0` — GSAP's `autoAlpha` cleanly overrides them).

### 2. `.fromTo()` renders its "from" state at creation (`immediateRender: true` default)

Even inside a `paused: true` timeline, creating a `.fromTo()` immediately applies the "from" values. Under reduced motion all durations collapse to 0, so "from" and "to" are the same instant — every card snapped to its hovered state **on mount, before any hover**. Fix: `immediateRender: !reduced` on such tweens. (`immediateRender` cannot be part of `defaults` — it's per-tween. Also note: `defaults: {immediateRender: false}` does not work reliably across GSAP versions; set it explicitly per tween.)

### 3. Hover-vs-entrance races: use `.fromTo()` baselines, not `.to()`

When a hover timeline and a scroll entrance (or idle loop) animate the **same property of the same element**, a plain `.to()` adopts "current value" as its implicit start. Hovering mid-entrance lets `overwrite: "auto"` kill the entrance at a partial value, and reversing the hover timeline returns to that **stuck half-finished value forever** — the famous Core Competencies bug (cards stuck lower than the others, sometimes `opacity: 0`).

**Fix pattern** (see `core-competencies.tsx`, heavily commented): build the hover timeline with `.fromTo()` specifying the true rest baseline (`{y: 0, opacity: 1}`, `{scale: 1}`), `immediateRender: !reduced`. Reduced motion doesn't need the protection (its entrance is a synchronous `gsap.set`, already resolved before any hover).

### 4. ScrollTrigger: use timeline-level triggers, not tween-level

GSAP 3.15.0 throws inside ScrollTrigger's internal refresh when a **tween-level** `scrollTrigger` is created after ≥4 other ScrollTriggers exist on a page that loaded already scrolled down (e.g. reload mid-page). `fadeUpOnScroll` deliberately builds a timeline with a timeline-level trigger (`gsap.timeline({ scrollTrigger: {...} })`). Don't regress to `gsap.fromTo(el, {...}, { scrollTrigger })` on this codebase.

### 5. SSR flash prevention (server HTML has no JS)

Anything hidden only by a mount-effect `gsap.set()` flashes visible on first paint / reload. Give closed-state defaults via static classes (opacity/visibility only — gotcha #1), and let the mount effect position the rest. Verified with a `javaScriptEnabled: false` Playwright context: server HTML must show nothing of the closed panel.

### 6. Panels inside collapsed clips

A panel mounted inside a `height: 0` accordion clip can't establish its starting transform value — `gsap.to(panel, {yPercent: 0})` may no-op. Set the start explicitly with `gsap.set(panel, {yPercent: 100})` on mount (see `work-bento.tsx`).

### 7. Stacking contexts & z-index under transforms

GSAP's transform creates its own stacking context, so a child with a stray `z-10` can paint over a sibling overlay that animates in later (observed: front title painting over the Our Work reveal panel — fixed by removing the z-10). Keep z-index flat inside animated subtrees.

### 8. A GSAP-owned CSS property can't also be styled by a stylesheet rule

Any tween's end state is an **inline style** (`element.style.opacity = ...`), and inline styles beat every stylesheet rule on the same property regardless of selector specificity — `!important` aside. `fadeUpOnScroll` leaves `opacity: 1` sitting in `style` on every revealed element forever, so a later stylesheet rule that also targets `opacity` on that element (e.g. a filter/dimming feature keyed off a data attribute) silently no-ops on anything that already played its entrance. Discovered building `/about`'s Evidence Lens (`about/evidence-lens.tsx`), which dims claims by confidence tier — the fix was dimming via `filter` instead, a property no GSAP tween on the page touches. **Rule:** if a feature needs to style a property from a plain stylesheet rule, make sure no GSAP tween anywhere on the page ever sets that same property inline on the same elements — pick an untouched property (`filter`, a custom property consumed by `filter`/`background`, etc.) rather than fighting inline-style specificity.
