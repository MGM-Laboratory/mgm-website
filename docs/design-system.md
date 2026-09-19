# Design System — as implemented

The brand philosophy, color rationale, typography scale, and icon rules live in **`DESIGN_SYSTEM.md` (repo root) — that file is the source of truth.** This doc covers how the system is actually wired into the code, including the few deliberate deviations.

## Tokens (`apps/web/src/app/globals.css`)

Tailwind v4 CSS-first theming. Raw values on `:root`, dark overrides on `.dark` (the `next-themes` class), and a `@theme inline` block mapping them to Tailwind utilities:

```css
:root {
  --background: #ffffff;
  --foreground: #0e1116;
  --brand-blue: #3a6dc5;
  --brand-yellow: #f7bf33;
  --brand-red: #f94141;
  --brand-green: #0f8657;
  --brand-blue-50: #ecf1fa;
  --brand-yellow-50: #fef6e0;
  --brand-red-50: #fee5e5;
  --brand-green-50: #e2f1ea;
  --ink-2: #3b4150;
  --ink-3: #6b7280;
  --line: #ececea;
  --surface-muted: #f7f7f5;
  --surface-inverse: #0e1116;
  --pattern-canvas: var(--surface-muted);
}
.dark {
  --background: #0e1116;
  --foreground: #ededed;
  --line: #262a33;
  --surface-muted: #15181e;
}
```

`@theme inline` maps: `--color-background`, `--color-foreground`, `--color-brand-*` (4 colors + 4 tints), `--font-sans/-mono/-display` from the next/font variables. Utilities in use: `bg-brand-blue`, `text-foreground`, `bg-[var(--surface-muted)]` (for values not in `@theme`), `font-display`, etc.

**`--pattern-canvas`**: the "white" half of every pattern tile (`public/patterns/*.svg`) is this variable, not literal white, so tiles never render as white squares on dark surfaces.

### Deliberate deviations from DESIGN_SYSTEM.md

- **Core Competencies card yellow**: `#FFBC00` (more saturated one-off) instead of `--brand-yellow #f7bf33`. Defined locally in `core-competencies.tsx` (`CARD_BG.yellow`), with a comment explaining why — the reference design uses this shade only on that card. Don't "fix" it to the token.
- **Menu sizing** is a separate fluid system (dvh-clamped, em-based) — see `docs/navigation-menu.md` §Sizing.

## Fonts

Geist Sans / Geist Mono / Hanken Grotesk via `next/font` in `layout.tsx` (variables `--font-geist-sans`, `--font-geist-mono`, `--font-hanken`). Display headings use `font-display` (Hanken), everything else `font-sans` (Geist).

## Pattern & motif assets

- `apps/web/public/patterns/` — pattern tiles as SVGs (`arcs-<color>-on-<color>.svg` etc.), referenced by DESIGN_SYSTEM.md ("generate patterns randomly from ./patterns") and rendered by `process/pattern-tile.tsx`.
- `apps/web/public/logo.svg` — the MGM logo.
- `apps/web/public/logo/` — department logos (`curriculum.svg`, `hr.svg`, `infra.svg`, `media.svg`, `pr.svg`, `rnd.svg`). ⚠️ **This directory is currently untracked** (`?? apps/web/public/logo/` in git status); it was deliberately left alone during past work. If a change should ship these, confirm with the owner first.
- Note: DESIGN_SYSTEM.md's relative paths (`./logo.svg`, `./patterns`) resolve to `apps/web/public/`.

## Motif system (Core Competencies + nav bento)

`components/sections/competency-motif.tsx` exports the geometric shapes used across cards and menu tiles. Two consumers with different styling:

- `CompetencyCardShape` — full-card background motif on competency card fronts (clipped by the card's rounded edge; it is **scale-animated only, never rotated**, because its cut corners/ring gap would swing to broken-looking positions).
- `CompetencyMotifShape` — small watermark motifs, `stroke` prop for translucent white (`rgba(255,255,255,0.32)` / `0.16`) on colored fills.

Nav bento tiles pair each item with a `motif` (`ring | bracket | cross | chevron`) and/or a `pattern` tile (`PatternKind`) plus a `tone` (`PatternTone` = one of the 4 brand colors). The Focus dropdown's four tiles mirror the homepage competency cards' motifs and colors (Game & New Media = chevron/green, Website = ring/blue, Mobile = bracket/red, HCI/UX = cross/yellow) for continuity.

## Responsive conventions

- **Page-content side gutters**: `px-6 sm:px-10 lg:px-[55px]` (24px mobile → 40px tablet → 55px desktop) is the established tiering for a page's main content column (contact, careers, articles, publications all follow it). A handful of older sections use a coarser two-tier `px-6 sm:px-[55px]` (24px → 55px, no tablet step) — both exist in the codebase; if a page has multiple content sections, make sure they all use the **same** tiering, or they'll visibly mis-align at tablet widths (a real bug once — the article detail page's "Other articles" section used the two-tier version while the article body above it used three-tier, giving it noticeably wider gutters at tablet width until fixed).
- **`placeholder-shown:truncate` for search-input placeholders**: a bare `truncate` (⇒ `overflow-hidden` + `text-overflow: ellipsis` + `white-space: nowrap`) on an `<input>` applies to the _typed value_ too, not just the placeholder — which can fight the input's native "scroll to keep the cursor visible while typing a long value" behavior (`text-overflow: ellipsis` on an input is a known browser quirk here). Scope it to only the empty state with the `placeholder-shown:` variant instead: `placeholder-shown:truncate`. Verified: `text-overflow` reads `ellipsis` while the placeholder shows and reverts to the native `clip` the moment a value is typed, with the input's `scrollLeft` still advancing normally to keep the cursor in view.
- **Decorative motifs must stay clear of text at every breakpoint they're visible at**, not just desktop — several `FlairShape`/`BauhausField` placements were tuned assuming a desktop-only gutter between the shape and a centered text column, and silently started overlapping headings once that gutter didn't exist below `lg:`. When adding a decorative shape near text, check it at the narrowest width it's visible at, not just where it was designed.
- **GSAP animation setup should be scoped to the breakpoint its target is actually visible at**, using `gsap.matchMedia()` — a `hidden lg:block` element (or any element hidden by a CSS class) still gets its transforms computed if a mount effect sets up a ScrollTrigger/tween/rAF loop for it unconditionally. `gsap.matchMedia(); mm.add("(min-width: 1024px)", () => { ...setup...; return cleanup; })` scopes both the setup and its cleanup to the query, and re-runs automatically on a resize across the breakpoint — see `about/bauhaus-field.tsx` for the pattern (it was previously running its scroll-triggered entrance, idle loops, and a mousemove parallax listener on every mobile visit for shapes that were `display: none` the whole time).

## Theme awareness rules

- Never hardcode a color that should follow theme — use tokens/utilities. Surfaces: `--surface-muted` for panels (menu), `--background` for pages.
- Elements hidden pre-hydration must use **opacity/visibility classes only** (`invisible opacity-0`), never transform classes GSAP owns (see `docs/animation-system.md` §Gotcha 1).
- Dark-mode regressions are a known failure class — always test both themes (Playwright `colorScheme: "dark"`).

## Social glyphs

`components/social-icons.tsx` — hand-drawn brand glyphs (Instagram, LinkedIn, X, YouTube, Discord), all `currentColor` so they adapt to theme text color. Each accepts a `ref` (React 19 ref-as-prop) so the nav can run GSAP hover timelines on the SVG element itself.
