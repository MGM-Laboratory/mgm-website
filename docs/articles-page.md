# Articles (`/articles` and `/articles/[slug]`)

The articles pages live inside one persistent WebGL scene: a forbidden heavenly library, white and thick with fog by day, black and ink-blue by night. The list is a river of paper cards flowing up the nave. An article is a themed page read inside the same library. Moving between them plays transitions inside that one scene, and a separate portal carries visitors in from the rest of the site and back out.

The pages are modelled on unseen.co's projects list and project pages (camera, card deformation, lens, transitions), with an original setting. Where this page differs from unseen on purpose, it says so.

Everything here is theme-aware and reduced-motion safe. Without hardware WebGL2 (or with `?noworld`) every page renders as plain DOM with its own CSS versions of the effects, and nothing depends on the world being there.

## Files

| Area                 | Files (under `apps/web/src/`)                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Routes               | `app/articles/layout.tsx` (mounts the world host, then the transitions host, then the page), `page.tsx` (first batch on the server), `loading.tsx` and `[slug]/loading.tsx` (transparent), `[slug]/page.tsx`, `read-article.ts`, `not-found.tsx` |
| Styles               | `app/articles/articles.css` (list), `detail.css` (article), `world.css` (world chrome, cursor), `transitions.css`                                                                                                                                |
| Data                 | `lib/article-index.ts` (card model, categories, query parsing, next slug), `lib/article-index-server.ts` (server reads, strict search), `app/api/articles-cms/index/route.ts` (batches), `lib/theme-pick.ts` (article theme)                     |
| Signals              | `lib/article-transition.ts` (kinds, cover and ready handshakes, arrival and return notes, busy flag, popstate claim), `lib/theme-switch.ts` (the header toggle's staged switch)                                                                  |
| World                | `components/articles/world/` (`world-host.tsx`, `world-registry.ts`, `world-api.ts` (the contract), `engine.ts`, `camera-rig.ts`, `world-glsl.ts`, `palette.ts`, `quality.ts`, `theme-wave.ts`)                                                  |
| Library              | `world/library/*` (floor plan, stacks, vault, window, lanterns, floor, atmosphere, drifting books, pages, dust and glyphs)                                                                                                                       |
| Effects              | `world/fx/composite.ts` (lens, motion blur, pulses, wipe), `world/fx/theme-front.ts`, `world/particles/*` (sparks, paper, cursor magic), `world/cursor/world-cursor.ts`                                                                          |
| List                 | `components/articles/list/*` (`articles-index.tsx`, `articles-hero.tsx`, `article-card.tsx`, `category-pills.tsx`, `filter-sheet.tsx`, `use-list-query.ts`, `list-entrance.ts`, `return-scroll.ts`, `list-cache.ts`, `articles-end.tsx`, others) |
| Cards in the world   | `world/cards/*` (`cards-layer.ts`, `card-shaders.ts`, `card-textures.ts`), `world/home/*` (the 3D Home button)                                                                                                                                   |
| Article page         | `components/articles/detail/*` (hero, story model and renderer, controller, entrance, reveals, scroll motion, image zoom, next threshold, flood), `world/detail/*` (the cover's sea)                                                             |
| In-world transitions | `components/articles/transitions/article-transitions.ts`, `articles-transitions-host.tsx`                                                                                                                                                        |
| Portal               | `components/transition/articles-portal.tsx`, `articles-portal-controller.ts`, `articles-portal-stage.ts`, `articles-portal-gl.ts`, `articles-portal-palette.ts`                                                                                  |

## The world

### Mode, once per visit

`world-host.tsx` decides the mode when the first articles page mounts and publishes it through `world-registry.ts` (mirrored on `<html data-articles-world>`):

- `gl`: motion allowed, a hardware WebGL2 context (`failIfMajorPerformanceCaveat`), and a renderer string that isn't a CPU (`swiftshader`, `llvmpipe`, `softpipe` and similar are rejected, so CI's headless browsers get the DOM list).
- `dom`: everything else, final for the visit: reduced motion, no hardware WebGL2, `?noworld`, a failed start, or a lost context.
- `pending`: until the decision. Pages render their DOM and subscribe (`onWorldState`), because the engine is a dynamic import and may arrive after they mount.

The host lives in `app/articles/layout.tsx`, so the scene persists across list and article navigations. It comes before the page on purpose: its layout effects run first, so a page's own layout effects (a scroll restore on return) always win. The layout fetches nothing.

### Space and frame

- The canvas is fixed behind everything (`z-index: 0`, no pointer events), appended to `<body>`.
- The camera sits 2000 px in front of the card plane (z = 0) with `fov = 2·atan(H / 2 / 2000)`, so one world unit is one CSS px on that plane (unseen's perspective). DOM rects map straight onto it: the DOM stays the source of layout, links, focus and accessible names, and the world draws over it.
- The camera orbits a pivot on the card plane with the mouse (pitch up to 2.0°, yaw up to 2.9°, a banking roll from the fast mouse leading a slow one, a slow wander). Cards stay nearly anchored under their links while the library swings behind them.
- One callback on the shared frame loop's "render" phase, after Lenis in the same tick (`docs/animation-system.md` gotcha #17). The scene renders into an 8-bit target, then the screen pass, then an overlay scene (the 3D Home button) that the lens never shifts.
- Color management is off: the whole pipeline stays in display sRGB, so the palette hex values show exactly as written.

### The library

Modelled in library units (`library/layout.ts`), scaled so a unit is a ninth of the viewport height. The walls move to stand just outside the list's columns at every width (`setNaveHalfWidth`), so the arcade frames the list from a portrait phone to a 21:9 screen. Three storeys of stacks with galleries and ladders, pointed arches on every pier, a great window pouring god rays, lanterns on long chains, a river of light along the marble floor, veils of mist at several depths, and drifting books, pages, dust and (by night) glyphs. About twenty draw calls in all.

### Effects

- **Screen pass** (`fx/composite.ts`): barrel distortion with a radial spectral split (about 17 px at a 1440 px corner), a vertical motion blur as long as the scroll is fast (decorrelated from the split so it never smears into rainbows), vignette, grain, click pulses, and the transitions' right-to-left wipe. The list wears the lens fully, articles keep the grain only. A first visit starts strongly warped and settles.
- **Cursor** (fine pointers, motion allowed): a thin ring that lags and stretches (at most 55%), dots over links, haloes over a card, presses in. Moving leaves a trail of motes. Resting about 400 ms releases a swarm of paper. On touch, a drag trails, a tap bursts, a long press swarms.
- **Theme switch**: the header toggle hands the switch to the world (`lib/theme-switch.ts`). The new scheme spreads from the toggle behind a ragged front (per pixel, `darkAt()` in `world-glsl.ts`), sparks race along it, and the lanterns gutter and relight. The DOM flips through a View Transition clipped to the very same edge (`theme-wave.ts`, `fx/theme-front.ts`).
- **Quality** (`quality.ts`): starts at a device guess, watches steady visible frames for the first seconds and steps down (pixel ratio first, then the tier that thins the library and particles). It never steps back up in a visit.

## The list (`/articles`)

### Head and filters

A fixed head over the library: the "Articles" title, a search field and category pills (phones and short landscape screens get a compact head with a "Filter" sheet). Filters are URL state through nuqs (`?category=`, `?q=`, history "replace"), so a filtered list survives going into an article and back, a reload, and a shared link. Search is strict: every term must appear (title, subtitle, categories, authors or body), ranked by the fuzzy scorer. The head's bottom is published as `--articles-head`: the grid starts under it and the world folds the cards just below it.

### Cards

Two columns (one on phones). Each card is a real link (`a[data-article-card][data-article-slug][data-article-theme]`) with a 5:2 cover, a one-line title, a one-line lighter description (both cut with an ellipsis) and a southeast arrow.

With the world running, `cards-layer.ts` draws one sheet per card over its DOM frame (cover, gap and text strip as one piece of paper) and the DOM copy turns transparent, keeping the link, the focus ring, and the hit area. The shader (`card-shaders.ts`) keys every displacement on where a vertex rests on screen:

- the swell: a slow diagonal wave lifting a crest of about 24 px toward the camera;
- the fold: under the head the river folds away, pushed back up to 2400 px, wobbling and twisting as it goes;
- depth fade and fog, so folded cards sink into the library.

Hover (pointer or keyboard focus) plays on the sheet: the cover zooms and the title rolls. Without the world, CSS plays the DOM card's hover: the cover zooms, the light sweeps, the title rolls, the arrow slips out and back in, and the rule draws itself in the accent color.

Only cards near the viewport own GPU resources: a card wakes within 1 viewport above or 2.1 below and sleeps past 1.8 above or 3.1 below (at most 28 awake). Covers decode off the main thread (`createImageBitmap`, nearest first, aborted when a card sleeps). Batches of 12 load as the end nears (an IntersectionObserver 260% below the viewport). A list of two hundred articles costs about what the two dozen near the screen cost.

Text strips are an alpha atlas per card colored in the shader, so a theme switch recolors them without a redraw. Covers and batches load with XMLHttpRequest, not `fetch`, because Codacy's SSRF rule flags any `fetch` whose URL carries state.

### Entrance (`list-entrance.ts`)

The articles entrance protocol, shared by every articles page:

- A fresh load plays at once after the fonts (bounded): the title's letters rise, the search and pills follow, the lens settles and the cards rise out of the fog row by row.
- Under a cover (the portal, the route curtain or an in-world transition) the pieces wait hidden until every cover reveals, then play the same entrance without the lens settle.
- Coming back from an article the list is simply there, as it was left.
- Reduced motion shows everything at once.

Hidden means `visibility` keyed on the page's `data-entrance`, never a transform class and never the head itself (the transitions move it). A visible-time failsafe plays the entrance if a cover never reveals.

### Return mode

Closing an article leaves a return note (`setArticleReturn`: the slug and the scroll position when the card was opened). The list reads it while rendering, renders every batch it had (`list-cache.ts`, up to 8 more on demand) and restores the scroll in a layout effect so the card is where it was, or in view if the list changed. `skipScrollReset` stops the root layout's scroll reset for that navigation.

### End of the list

No footer. A line saying the visitor has reached the end, a floating 3D "Home" pill the world draws over a real link (`world/home/*`: it surfaces from the depth, bobs, leans toward the cursor, glows with orbiting motes on hover, squashes when pressed and bursts into light on click, then the portal carries the visitor home), and the legal links. A back-to-top button sits bottom left with hover and pressed states (it is translated by CSS, so transitions only animate its opacity).

## The article page (`/articles/[slug]`)

### Data and theme

`read-article.ts` memoises the reads per request (`generateMetadata`, `generateViewport` and the page share one CMS round trip). The page wears one of the 20 project themes (`lib/project-themes.ts`): the one an editor picked in the admin (`theme` on the article record), else a stable pick from the slug (`lib/theme-pick.ts`), so older records get a considered theme too. The world tints its fog and stone toward the theme (`setTheme`) and the header walks to its palette.

### Layout and motion

- **Hero** (`article-hero.tsx`, `detail-entrance.ts`): the date and reading time, the title, the short description, the categories (links back to the filtered list) and the authors (links to their member pages). Each letter rises from under its word's mask, the description's words follow, then the chips.
- **Cover**: 5:2. With the world, `world/detail/cover-layer.ts` draws it as a sheet of water: a wave front washes the picture into being with foam along its crest, then the surface swells, ripples under the pointer, and splashes on a click. Without it (DOM mode, touch), a wave-shaped mask and a small ripple canvas play the same idea (`detail/cover-dom.ts`).
- **Story** (`story-model.ts`, `article-story.tsx`): a lede, then numbered sections (every heading opens one), then the sources gathered at the end. Figures break out of the text column in a rotation that starts at a stable point per article (full bleed with an inner parallax, inset with the caption in the margin, offset), two pictures in a row form a diptych, and diagrams are never cropped. It renders every block type production uses (paragraph, level-2 heading, image, bullet and numbered list items, inline links) and falls back to plain text for anything else.
- **Reveals and scroll motion** (`detail-reveals.ts`, `detail-motion.ts`): paragraphs dissolve in along a diagonal, headings rise word by word, pictures peel into place, and lean toward a resting pointer. A rail on wide screens keeps the section index and reading progress in view, a slim bar does it on narrow screens. Reveals use an IntersectionObserver, never ScrollTrigger, so a block already past the viewport can't stay hidden (gotcha #11).
- **Playful touches**: small magnetism on links (`detail-magnetic.ts`, the `translate` property only), and pictures that open large on a click (`image-zoom.ts`).

### Next article

The end is a screen-tall threshold to the next article in the list's own order (`nextArticleSlug`). Only input after reaching the bottom counts: wheel travel fills a progress of two viewport heights, a drag of 400 px fills it, and keys add steps. It drains back when input stops. Progress raises a dome of the next article's color, rolls "Next article" out of its mask and carries the next title toward the hero title's place. At 100%, or on a click (it is a real link, `a[data-article-next]`), the flood fills the screen and the next page reads an arrival note that puts its title already in place. The flood lives on `<body>` (`next-flood.ts`) because the old page unmounts before the next one renders.

### Not found

An unknown slug renders `article-missing.tsx` inside the library: a quiet card with the way back to the archive and home. It answers the transitions like any article page.

## Transitions

All of them share `lib/article-transition.ts`. The route curtain stands down for every articles navigation it doesn't own: clicks are taken in capture listeners, and browser back and forward are claimed through `claimsArticlePopstate`. See `docs/page-transition.md` for how the curtain, the project zoom, and these coexist.

### Inside the world (`article-transitions.ts`)

| Kind  | From → to         | Out                                                                                                                                                                                                           | In                                                                                                                                                         |
| ----- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| open  | list → article    | The whole scene pans left 2800 px (2 s, `power4.inOut`), the head slides away, the article's theme color sweeps in from the right with a soft front (1.7 s) and the lens relaxes. The route changes at 1.2 s. | The article's content slides in from a quarter screen to the right while the color dissolves onto the themed library.                                      |
| close | article → list    | The content drifts right and fades while the fog swallows the library. The list is pushed at 1.15 s in return mode.                                                                                           | The list arrives from the left (the pan back from 2800 px) with the opened card where it was, as the color recedes to the right. The lens comes back last. |
| swap  | article → article | The content falls away into the fog (the camera dollies in).                                                                                                                                                  | The next article rises out of the fog as the header walks to its palette.                                                                                  |

The next-article pull is not a swap: `[data-article-next]` links are left to the page's own hand-off.

- **Handshakes**: before pushing, the controller notes the arrival (`noteArticleArrival`), marks the cover (`markArticleCoverStarted`) and expects the page (`expectArticlePage`). The "in" half waits for the route to commit, then for the page to call `markArticlePageReady` (bounded at 2.2 s), then a frame, and calls `markArticleRevealStarted` so held entrances play.
- **Long pans stay in the nave**: during a pan the library follows all but a parallax that eases out as it nears 45% of the nave's half-width, so the camera never leaves through a wall of shelves on any screen.
- **Browser back and forward** cover at once in the popstate handler (the route is already changing) and play only the "in" half. The cover then dissolves or recedes as usual.
- **Without the world**, a fixed overlay in the same color plays the same sweep (a clip from the right) and the DOM grid slides with it.
- **Reduced motion** is never intercepted: links navigate natively, and the return note (`restoreOnly`) still brings the list back to the card.
- **One `finish()`** releases everything on every path (landed, superseded, route changed elsewhere, unmounted), and a visible-time ceiling of 16 s ends a run that never did. Frame callbacks are guarded: a fault ends the run cleanly instead of freezing it.
- While a run covers the screen, `html[data-article-transition]` hides the page coming in from its first frame (`transitions.css`, opacity only), and every click is swallowed.

### The portal (in from the site, out to it)

From any other page into `/articles` or `/articles/<slug>` ("in"), the real page lifts off the screen like a sheet of paper while the library's arch opens in white-gold light behind it, paper fragments and motes rise past, and a wall of luminous fog climbs until the screen is nothing but fog. Only then does the route change. On the other side the fog thins from the heart of the screen outward onto the library, and the list's entrance plays as it clears. Going out ("out"), the library floods with fog, a sheet of paper lands, and the site returns. In the dark scheme the same happens as ink with blue fire and embers.

The controller (`articles-portal-controller.ts`) ships in the root layout but loads its stage (DOM) and WebGL layer only on intent (hovering, focusing or pressing a link that leads through the portal, or on idle on a library page), so pages that never use it ship neither and three.js never reaches the root chunk.

Timing: the GL stage covers in 1.05 s and reveals in 1.4 s going in (1.25 s and 1.0 s going out). The DOM stage takes about 0.6 s each way. After the route commits, the portal holds (bounded) for the content to replace its loading shell, the page to report ready and the world to decide its mode, then reveals. Into an article with WebGL it holds longer for the content (up to 3.4 s), showing a line of ink to say the library is still writing the page.

Every wait counts visible time only (a background tab pauses it). The frame clock counts at most half a second per frame, so each beat is also bounded in real time at 1.5 times its length, and a timer ticks the run on while the frame loop is silent. A software renderer on a loaded machine therefore can't hold a visitor under the cover (this was a real flake on CI's Linux WebKit).

## Verifying changes here

- **Real GPU**: headless Chromium uses SwiftShader, which the world rejects, so verify the world in Playwright with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` (see `docs/testing-verification.md`). Check light and dark, reduced motion, `?noworld`, a phone (390×844, touch), a tablet (834×1194) and a wide screen.
- **Transitions**: open a card, go back, check the card lands where it was and nothing is left locked (`html` overflow), busy or covered (`html[data-article-transition]`), and that the route curtain never shows. In development `window.__articleTransition.state()`, `window.__articlesPortal.state()` and `window.__articlesWorld` expose the live state.
- **E2E**: `e2e/articles.spec.ts` runs against the CMS fixture (`e2e/fixtures/cms/articles.json`, five articles), in DOM mode on every CI browser.
- **Never save anything through local `/admin`**: `.env.local` points at the production CMS.
