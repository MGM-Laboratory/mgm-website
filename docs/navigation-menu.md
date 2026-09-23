# Navigation Menu System

The site's only navigation is the full-screen right-side menu (`nav/nav-menu.tsx`), derived from the React Bits `StaggeredMenu` component and modeled on the menu at `https://kaizin.framer.website` (studied, then rebuilt on the MGM design system, not copied verbatim). The old center navbar was removed entirely. `site-header.tsx` holds the LogoMark, the ThemeToggle and the menu button, plus a centre Back pill on project detail pages.

## The header bar

The bar is frosted glass: a tint of the page background (76% in light mode, 80% in dark, 94% while the menu is open) under `backdrop-filter: blur(20px) saturate(180%)`, with a hairline bottom border and a faint top highlight. The glass sits on a child layer, not on `<header>` itself. A `backdrop-filter` on `<header>` would make it the containing block for the menu's fixed overlay and panel, which render inside the header, and the panel would collapse into the 64 px bar. Under `prefers-reduced-transparency: reduce`, or where `backdrop-filter` isn't supported, the bar is opaque.

On a project detail page the bar takes that project's theme: its tint, ink and accents read `var(--project-bg)`, `var(--project-text)` and `var(--project-highlight)`, falling back to the site tokens everywhere else, and the colours transition over 0.5 s. The multicolour logo mark keeps its brand colours. The open menu panel keeps the site colours.

The Back pill renders only on `/projects/<slug>`. It is a `Link` to `/projects` (`data-project-back`, labelled "Back to projects") that the project zoom transition intercepts (see [`page-transition.md`](page-transition.md)). Hover and keyboard focus play a slide-through arrow swap with a fill rising from the bottom, and the pill slides in once the page-transition curtain lifts. At 812 px and below it becomes a 44 px icon-only circle beside the theme toggle. Everything is CSS, and reduced motion keeps only the colour change.

## Files

| File                   | Role                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nav/nav-menu.tsx`     | Everything: toggle (hamburger), overlay, 4 staggered brand prelayers, panel, nav items, dropdown accordions, bottom block, logo animation, open/close orchestration |
| `nav/focus-bento.tsx`  | Focus dropdown: 2×2 flip cards                                                                                                                                      |
| `nav/work-bento.tsx`   | Our Work dropdown: Projects 2×1 + Publications/Research 1×1, slide-reveal                                                                                           |
| `nav/email-reveal.tsx` | Email widget with copy/mailto dropdown                                                                                                                              |
| `nav/logo-mark.tsx`    | Animated header mark (separate from the menu's logo assembly)                                                                                                       |
| `data/nav.ts`          | All menu content: `NAV_ITEMS`, `CONTACT_EMAIL`, `LEGAL_LINKS`, `NAV_SOCIALS`                                                                                        |
| `social-icons.tsx`     | Hand-drawn social glyphs (ref-accepting)                                                                                                                            |

## Behavior spec

**Open**: hamburger click → overlay dims/blurs the page, four brand-color layers stagger across the screen in sequence, the panel slides in from the right, nav items cascade in, and the MGM ShardLogo **assembles itself** on the empty left side (same shard animation as the hero, `back.out(1.9)`, delayed ~0.3× the panel's duration; **no** post-assembly stomp/pulse, that was removed on purpose). Scroll is locked while open, through the shared owner-counted `lib/scroll-lock.ts` (owner `"nav-menu"`), so closing the menu never releases a lock another feature still holds, such as the `/projects` intro.

**Close**: reverse, logo fades out (`power2.in`), layers sweep back, panel exits. Escape, backdrop click, and route change all close. Focus returns to the toggle.

**A11y**: `inert={!open}` + `aria-hidden={!open}` on the panel, `aria-expanded` on the toggle, focus moves into the panel on open and back on close. Reduced motion: durations collapse to 0 so everything is instant but reachable (decorative-only loops like the social wiggle are skipped).

**Theme-aware**: panel background is `--surface-muted` (light in light mode, dark in dark mode); text `--foreground`. This was an explicit user requirement: test both themes.

**Reload flash**: a previous bug made the menu flash open for a split second on reload (SSR HTML rendered it visible). Closed-state defaults are now static opacity/visibility classes (`invisible opacity-0`), with GSAP owning transforms exclusively: see gotchas #1 and #5 in `docs/animation-system.md`.

## Item animations

Each row: number + label + trailing icon (ArrowUpRight for links, ChevronDown for dropdowns, the chevron moves **in sync with the text**, 14px, same duration/ease). On hover: an `ItemFill` sweep (accent-colored) scales across, label slides 14px and takes the item's brand color, number scales `back.out(2)` and colors, arrow fades/slides in. Hover timelines use `.fromTo()` baselines (`immediateRender: !reduced`) per gotcha #3.

## Dropdowns (bento cards, title-only: descriptions were removed by request)

- **Focus**: 2×2 flip cards (`[perspective:900px]` outer, `preserve-3d` inner, back pre-rotated 180°): front = brand-color fill + oversized `CompetencyMotifShape` corner decoration (`stroke rgba(255,255,255,0.32)`) + title; hover flips to back = smaller watermark motif + title + "Explore" pill. Mirrors the homepage competency cards' motifs/colors.
- **Our Work**: deliberately _different_ mechanic: front = title + `FlairShape` pattern-tile watermark (`opacity-20`, brand tone); hover = link lifts `y:-4` + shadow AND an accent panel slides up from the bottom (`gsap.set(panel,{yPercent:100})` on mount, required because it mounts inside a height-0 clip; gotcha #6) showing title + "View" pill, while the watermark pops in (`scale 0.85 rotate -6 → identity`, `back.out(1.6)`). No z-10 on the front title (gotcha #7).

## Bottom block

- **"Let's Talk"**: `EmailReveal` with `hi@labmgm.org` (from `data/nav.ts`; do not hardcode). Hover opens an upward dropdown (`bottom-full`, since it sits at the panel bottom): "Copy email" (clipboard write → Check icon + "Copied!" for about 1.8 seconds) and "Open in Mail app" (`mailto:`). 150 ms delayed close on mouseleave, cancelled on re-enter.
- **Malang (ID) WIB clock**: hydration-safe (`"--:--"` SSR placeholder, `Intl.DateTimeFormat` with `timeZone: "Asia/Jakarta"` in effect, updates every 30 seconds).
- **Socials**: icon-only Instagram, LinkedIn, and Discord links from `data/nav.ts` (all real URLs), each with its own GSAP wiggle on hover (rotate -14 → rotate 14 + scale 1.25 + its brand accent color → settle, `back.out(3)`). Icons adapt to theme via `currentColor`.
- **Legal row**: real links to `/privacy-policy` and `/terms-of-services`.

## Sizing (the no-scroll guarantee)

**Hard requirement from the owner: the menu must never scroll.** All content fits in one view at any aspect ratio, scaling fluidly. Implementation: a single font-size anchor on the `<nav>`, `text-[clamp(1rem,2.7dvh,1.75rem)]`, and **everything else sized in `em` off it** (item text, gaps `0.7em`, paddings, icon sizes). The item text itself is larger below `lg` (`max-lg:text-[clamp(1.125rem,3.4dvh,2rem)]`) so the mobile menu reads bigger, paid for by tightening the panel/bottom-block spacing. Bento tiles: height `clamp(2rem,5.2dvh,3rem)`, text `clamp(0.65rem,1.7dvh,0.95rem)`. Bottom block: `clamp(0.7rem,1.7dvh,0.95rem)`.

When changing sizes: verify across viewports (1280×800, 1440×900, 1280×600, mobile 390×844) with **both dropdowns open**, checking no scrollbar appears. Extreme-landscape and ~600px-tall cases fall back to `overflow-y-auto` (documented, accepted). A quick-size change here has broken fit repeatedly. The gap between icons and text was tuned three times (settled: `0.7em`).
