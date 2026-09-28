# Navigation Menu System

The site's only navigation is the full-screen right-side menu (`nav/nav-menu.tsx`), derived from the React Bits `StaggeredMenu` component and modeled on the menu at `https://kaizin.framer.website` (studied, then rebuilt on the MGM design system, not copied verbatim). The old center navbar was removed entirely. `site-header.tsx` holds the LogoMark, the ThemeToggle and the menu button, plus a centre Back pill on project detail pages.

## The header bar

The bar is frosted glass: a translucent tint under `backdrop-filter: blur(20px) saturate(180%)`, with a hairline bottom edge and a faint top highlight. The glass sits on a child layer, not on `<header>` itself. A `backdrop-filter` on `<header>` would make it the containing block for the menu's fixed overlay and panel, which render inside the header, and the panel would collapse into the 64 px bar. The controls wrapper holds the menu too, so it never gets a `filter`, `transform` or `backdrop-filter` either. Under `prefers-reduced-transparency: reduce`, or where `backdrop-filter` isn't supported, the bar is opaque.

On a project detail page the bar takes that project's theme: its tint, ink and accents read `var(--project-bg)`, `var(--project-text)` and `var(--project-highlight)`, falling back to the site tokens everywhere else. The multicolour logo mark keeps its brand colours, and the wordmark follows the ink.

Without JavaScript, and until the first sample, the tint is the page background at 76% in light mode, 80% in dark and 94% while the menu is open. The weakest text in the bar, the 70% "Laboratory" caption, keeps 4.9:1 or better at those alphas even over solid black or white. That static bar is the safe floor, and the adaptive ink below only ever lowers the tint where the contrast rule holds.

The Back pill renders only on `/projects/<slug>`. It is a `Link` to `/projects` (`data-project-back`, labelled "Back to projects") that the project zoom transition intercepts (see [`page-transition.md`](page-transition.md)). Hover and keyboard focus play a slide-through arrow swap with a fill rising from the bottom, and the pill slides in once the page-transition curtain lifts. At 812 px and below it becomes a 44 px icon-only circle beside the theme toggle. Everything is CSS, and reduced motion keeps only the colour change.

## Adaptive ink

The bar and the open menu panel sample what is actually behind them and pick colours that stay readable over it. The scheduler is `hooks/use-header-tone.ts`, the rule and the colour maths are `lib/header-tone.ts`, and the sampling is `lib/header-tone-probe.ts`.

**Zones.** The bar has three zones, marked with `data-header-zone`: the logo, the centre (the Back pill on wide screens) and the controls (the theme toggle, the menu button, and the Back pill at 812 px and below). The open menu panel is a fourth. Each bar zone gets its own ink, tint and surface, written inline on the header as `--hz-<zone>-ink`, `--hz-<zone>-tint` and `--hz-<zone>-solid`. The glass paints the tints as a gradient across the zones, with stops just past the logo and just before the controls. A bar half over a dark picture and half over the page is dark on one side and light on the other.

**Sampling.** Six points per bar zone, inside the bar's 64 px, and 21 behind the panel. `document.elementsFromPoint` lists what is under each point, and the header's own elements are skipped.

- An element or ancestor with `data-header-tone` wins over everything under it: `dark`, `light` or any CSS colour. `ignore` makes that subtree transparent to the probe.
- A loaded same-origin `<img>` is read from a tiny cached copy (48 px on its long side) at the matching position, with `object-fit` and `object-position` honoured. A `<video>` uses its same-origin poster, or one cached frame. Cross-origin pictures are never drawn, since they taint a canvas, and a draw that throws anyway counts as unknown.
- Hit testing skips `visibility: hidden` and `pointer-events: none`. That is exactly how the WebGL stages hide the DOM pictures they draw, so the first element's own hidden pictures under the point are read as well. The `/projects` covers count this way.
- Text scrolled behind the glass counts as a thin layer of its colour, from about 7% for body copy to 40% for display type.
- Otherwise the translucent backgrounds are composited down to the first opaque one, then the body's. Canvases fall through to what is under them.
- Painted pixels the probe can't read make the point unknown: an `<iframe>`, `<embed>` or `<object>` (the YouTube embed, a PDF preview), a loaded cross-origin picture or playing cross-origin video, and a CSS `url()` background. The rule then has to hold over black and over white alike there, which lifts the tint to about the static floor exactly where the content is unknown. A picture that hasn't loaded yet paints nothing, so its container still decides.

**Providers.** A page that knows better than the probe registers `registerHeaderToneProvider((zones) => ...)`, which answers per point or leaves points to the probe. The project detail page answers for points over its media items, whose WebGL stage draws them while the DOM frames are hidden. It reads the item's own `<img>` (or its video's poster) at that point, shows its placeholder colour until the file has loaded, and fades it with the track over the page background. The meta block and the next project's panel, in the next project's colours, stay with the probe.

**The rule.** For each zone:

1. The backdrop is the average of the samples (the blur averages them in sRGB), passed through the glass's `saturate()`.
2. Its tone is light or dark, split at the luminance where black and white text contrast equally (about 0.18), with some hysteresis near the split.
3. The tint is the preferred surface (the project's background, or the site's) when it has that tone. Otherwise it is the tone's neutral surface, `--tone-light-surface` or `--tone-dark-surface`. The tint follows the backdrop, so text never sits on a washed-out mismatch.
4. The preferred ink (the project's text colour, or the site ink) stays while the weakest text in the zone keeps 4.5:1 against every sample seen through the glass. Over imagery the bar is 5.3:1, because a downscaled picture is an estimate with bright or dark spots between the samples. Otherwise the ink becomes the tone's neutral ink, near-white or near-black.
5. If that ink still misses somewhere, the tint's alpha rises until it passes.

The weakest text is the 70% caption in the logo zone, the full ink in the centre and controls zones, and the 65% labels in the panel. The base alpha is 58% (light) or 62% (dark) for the bar and 74% or 78% for the panel. While the menu is open the bar uses the panel's.

**Flip and halo.** A zone whose ink left the preferred colour carries `data-hz-<zone>="flip"`. Its focus ring and hover wash follow the ink instead of the theme accent, and the Back pill inverts to the zone's ink and surface so it stays a solid shape on the glass. Over imagery (`data-hz-<zone>-media`) a zone adds a faint halo in its surface colour: a text shadow on the logo, and a drop shadow on each control button, never on the wrapper.

**When.** On arrival and on every route change (then a few more times while the page settles), on scroll (at most 10 times a second, plus a few samples after it stops, while ScrollSmoother and Lenis glide on), on resize, on a theme switch, when a picture near the bar loads, when the menu opens, and when a page calls `requestHeaderToneSample()`. Nothing runs while idle. The colours ease over 0.45 s through registered custom properties (`@property`), the gradient's tints included.

**Transitions.** Nothing is sampled while the route curtain, the project zoom or a detail page's next-project hand-off runs. The moment one starts, the inline values are removed, so the bar's static CSS follows the zoom's `--project-*` walk instead of fighting it. `isRouteCoverActive()` (`lib/route-reveal.ts`) and `isProjectTransitionBusy()` (`lib/project-transition.ts`) report them, with change listeners, and sampling resumes when they end.

**Opaque glass.** Under reduced transparency, or without `backdrop-filter`, the scheduler writes nothing. The rule reduces to the theme's own ink on its own opaque surface, which the themes already guarantee.

**Verifying.** Dev builds expose `window.__headerTone`. `state()` reports each zone's tone, flip, alpha and worst contrast, plus everything written, and `sample()` forces a sample.

## Files

| File                                                                         | Role                                                                                                                          |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `nav/nav-menu.tsx`                                                           | Toggle, overlay, 4 staggered brand prelayers, panel, direct nav links, bottom block, logo animation, open/close orchestration |
| `nav/focus-bento.tsx`                                                        | Preserved dropdown component; currently not shown in the menu                                                                 |
| `nav/work-bento.tsx`                                                         | Preserved dropdown component; currently not shown in the menu                                                                 |
| `nav/email-reveal.tsx`                                                       | Email widget with copy/mailto dropdown                                                                                        |
| `nav/logo-mark.tsx`                                                          | Animated header mark (separate from the menu's logo assembly)                                                                 |
| `site-header.tsx`                                                            | The bar: glass layer, zones (`data-header-zone`), Back pill                                                                   |
| `hooks/use-header-tone.ts`, `lib/header-tone.ts`, `lib/header-tone-probe.ts` | Adaptive ink: scheduling and writes, the rule and colour maths, DOM sampling (see [Adaptive ink](#adaptive-ink))              |
| `data/nav.ts`                                                                | All menu content: `NAV_ITEMS`, `CONTACT_EMAIL`, `LEGAL_LINKS`, `NAV_SOCIALS`                                                  |
| `social-icons.tsx`                                                           | Hand-drawn social glyphs (ref-accepting)                                                                                      |

## Behavior spec

**Open**: hamburger click → overlay dims/blurs the page, four brand-color layers stagger across the screen in sequence, the glass panel slides in from the right over them (then the layers fade, so the page shows through the glass instead of the last layer's colour), nav items cascade in, and the MGM ShardLogo **assembles itself** on the empty left side (same shard animation as the hero, `back.out(1.9)`, delayed ~0.3× the panel's duration, and **no** post-assembly stomp/pulse, which was removed on purpose). Scroll is locked while open, through the shared owner-counted `lib/scroll-lock.ts` (owner `"nav-menu"`), so closing the menu never releases a lock another feature still holds, such as the `/projects` intro.

**Close**: reverse, logo fades out (`power2.in`), layers sweep back, panel exits. Escape, backdrop click, and route change all close. Focus returns to the toggle.

**A11y**: `inert={!open}` + `aria-hidden={!open}` on the panel, `aria-expanded` on the toggle, focus moves into the panel on open and back on close. Reduced motion: durations collapse to 0 so everything is instant but reachable (decorative-only loops like the social wiggle are skipped).

**Glass**: the panel is the header's frosted glass, a little denser (`blur(28px) saturate(170%)`, a 74% tint in light mode and 78% in dark), with a hairline left edge. The overlay is a lighter glass that dims and blurs the page, and it stops at the panel's left edge (it's absent where the panel is full width), so the panel's glass sees the page itself rather than the overlay's tint. Reduced transparency, or no `backdrop-filter`, makes both opaque.

**Theme-aware**: the panel wears one tone, light or dark. By default it is the site's own, and it switches to the other one when sampling finds content of that tone behind the panel (see [Adaptive ink](#adaptive-ink)). The panel re-points the site tokens its contents already use (`--foreground`, `--background`, `--surface-muted`, `--line`) at that tone, so every link, card and label follows without colours of its own. The muted labels, item numbers, chevrons and the legal row are at 65% ink or more, which keeps them at 4.5:1 on the glass. They were at 30% to 40% on the old solid panel. Theme-awareness was an explicit user requirement: test both themes.

**Reload flash**: a previous bug made the menu flash open for a split second on reload (SSR HTML rendered it visible). Closed-state defaults are now static opacity/visibility classes (`invisible opacity-0`), with GSAP owning transforms exclusively: see gotchas #1 and #5 in `docs/animation-system.md`.

## Item animations

Each row: number + label + trailing arrow. On hover: an `ItemFill` sweep (accent-colored) scales across, label slides 14px and takes the item's brand color, number scales `back.out(2)` and colors, arrow fades/slides in. The seven rows stretch through the panel's available height while the bottom block keeps its padding.

## Bottom block

- **"Let's Talk"**: `EmailReveal` with `hi@labmgm.org` (from `data/nav.ts`; do not hardcode). Hover opens an upward dropdown (`bottom-full`, since it sits at the panel bottom): "Copy email" (clipboard write → Check icon + "Copied!" for about 1.8 seconds) and "Open in Mail app" (`mailto:`). 150 ms delayed close on mouseleave, cancelled on re-enter.
- **Malang (ID) WIB clock**: hydration-safe (`"--:--"` SSR placeholder, `Intl.DateTimeFormat` with `timeZone: "Asia/Jakarta"` in effect, updates every 30 seconds).
- **Socials**: icon-only Instagram and LinkedIn links from `data/nav.ts`, each with its own GSAP wiggle on hover. Icons adapt to theme via `currentColor`.
- **Legal row**: real links to `/privacy-policy` and `/terms-of-services`.

## Sizing (the no-scroll guarantee)

**Hard requirement from the owner: the menu must never scroll.** The seven direct links fill at most `52dvh`, with the remaining space shared above and below the list. The font-size anchor on the `<nav>` is `text-[clamp(1.375rem,4dvh,2.5rem)]` (slightly smaller below `lg`); rows share the capped height evenly. Bottom block: `clamp(0.7rem,1.7dvh,0.95rem)`.

When changing sizes: verify across viewports (1280×800, 1440×900, 1280×600, mobile 390×844), checking no scrollbar appears and the bottom block stays visible. Extreme-landscape and ~600px-tall cases may fall back to `overflow-y-auto`. The gap between icons and text is `0.7em`.
