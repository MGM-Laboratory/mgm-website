# Architecture

## Monorepo layout

pnpm workspaces (pnpm 11.3.0, Node 22, Turbo 2.10):

```
apps/web/              Next.js 16.3.4 marketing site (React 19.2.8, Tailwind v4, GSAP 3.15)
apps/api/              NestJS API (ESM, Prisma, oxlint, vitest) — port 4000
packages/@repo/shared  shared code consumed via workspace:*
.github/workflows/     ci.yaml + publish-docker-image.yml + publish-docker-image-{latest,staging}.yml
```

`apps/web/package.json` carries most of the interesting dependencies: `gsap`, `lucide-react`, `next-themes`, `framer-motion`, `@tanstack/react-query`, `react-hook-form` + `zod`, `zustand`, `sonner`, `tiptap`, `class-variance-authority` + `tailwind-merge` + `clsx`, `pdfjs-dist` (the publications PDF viewer, worker bundled via `new URL(..., import.meta.url)`). Note: `framer-motion` and some of the form/table/editor libs are installed but the current site is animated entirely with **GSAP** — check actual usage before assuming a lib is in play.

## apps/web structure

### Root layout chain

`src/app/layout.tsx`:

1. Loads **Geist Sans / Geist Mono / Hanken Grotesk** via `next/font` into CSS variables (`--font-geist-sans`, `--font-geist-mono`, `--font-hanken`).
2. `<Providers>` (`src/components/providers.tsx`) — `next-themes` ThemeProvider (`attribute="class"` → `.dark` on `<html>`) plus other global providers.
3. `<SiteHeader>` (`src/components/site-header.tsx`) — fixed, `h-16`, z-50. Left: `<LogoMark />` (animated MGM mark). Right: ID/EN language switch (hidden on mobile), `<ThemeToggle />`, `<NavMenu />` hamburger. The center navbar was deliberately removed — the menu is the only navigation.
4. `<SmoothScroll>` (`src/components/smooth-scroll.tsx`) — GSAP ScrollSmoother wrapper around all page content. **Not created under `prefers-reduced-motion`.** Scroll locking (menu open) = `ScrollSmoother.get()?.paused(true/false)` + `document.documentElement.style.overflow` fallback. In dev, the instance is exposed as `window.__smoother`.

Theme implementation: Tailwind v4 `@custom-variant dark (&:where(.dark, .dark *))` in `src/app/globals.css`; CSS variables for light values on `:root` and dark overrides on `.dark`. See `docs/design-system.md`.

### Components

| Path                                        | What it does                                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/hero/hero.tsx`                  | Split-character reveal ("MGM Laboratory" / "& Mobile Laboratory"), ShardLogo assembly, parallax shapes                                                                                 |
| `components/hero/shapes.tsx`                | `ShardLogo` + brand-colored geometric shapes (reused by the nav logo animation)                                                                                                        |
| `components/hero/see-work-button.tsx`       | "See our work" pill with the rotating gradient rim (`cta-ring-spin` CSS)                                                                                                               |
| `components/nav/nav-menu.tsx`               | **The** full-screen menu (toggle, overlay, staggered brand prelayers, panel, items, bento dropdowns, bottom block) — ~the largest file in the app. Spec: `docs/navigation-menu.md`     |
| `components/nav/focus-bento.tsx`            | 2×2 flip-card dropdown for Focus                                                                                                                                                       |
| `components/nav/work-bento.tsx`             | Projects 2×1 + Publications/Research 1×1 slide-reveal dropdown for Our Work                                                                                                            |
| `components/nav/email-reveal.tsx`           | Email widget (hover dropdown: copy to clipboard with "Copied!" state / `mailto:`)                                                                                                      |
| `components/nav/logo-mark.tsx`              | Animated MGM mark (header left) with hover burst                                                                                                                                       |
| `components/sections/core-competencies.tsx` | 4 flip cards (blue/red/yellow/green) — homepage section with the famous hover-vs-entrance race fix                                                                                     |
| `components/sections/competency-motif.tsx`  | `CompetencyCardShape` / `CompetencyMotifShape` — the geometric motifs on the cards                                                                                                     |
| `components/sections/process-section.tsx`   | Process section using `pattern-tile.tsx` + `mosaic-marquee.tsx`                                                                                                                        |
| `components/sections/showcase-section.tsx`  | Project showcase driven by `data/projects.ts`                                                                                                                                          |
| `components/sections/articles-section.tsx`  | Articles teaser section                                                                                                                                                                |
| `components/sections/page-band.tsx`         | Generic standalone-page hero band (used by all non-home pages)                                                                                                                         |
| `components/publications/`                  | Publication index filter, journal-style author block, citation box, first-page preview, and the full-screen PDF viewer (zoom / fit-width / page jumps / download, lazy page rendering) |
| `components/sections/cta-footer.tsx`        | Shared CTA/footer (socials reuse `social-icons.tsx`)                                                                                                                                   |
| `components/social-icons.tsx`               | Hand-drawn brand glyphs (Instagram, LinkedIn, X, YouTube, Discord) — `currentColor` SVGs, React 19 ref-as-prop (`ref?: Ref<SVGSVGElement>`) so GSAP can animate them                   |
| `components/theme-toggle.tsx`               | Light/dark toggle (next-themes)                                                                                                                                                        |
| `components/api-status.tsx`                 | API health indicator (uses `hooks/use-health.ts`)                                                                                                                                      |

### Data

- `src/data/nav.ts` — `NAV_ITEMS` (label, href, brand tone, bento motif/pattern per item), `CONTACT_EMAIL = "hi@labmgm.org"`, `LEGAL_LINKS`, `NAV_SOCIALS`. The menu renders **everything** from here.
- `src/data/competencies.ts` — `COMPETENCIES` (title, description, href, `CompetencyColor`, motif) for the homepage cards.
- `src/data/projects.ts` — showcase projects.

### Lib / hooks

- `src/lib/env.ts` — zod-validated `NEXT_PUBLIC_API_URL` (empty string → `http://localhost:4000/api` default; CI build-args can pass empty).
- `src/lib/scroll-reveal.ts` — `fadeUpOnScroll(root, selector, {start, stagger, y})`: timeline-level ScrollTrigger (deliberately not tween-level — see gotcha #4 in `docs/animation-system.md`); under reduced motion it synchronously `gsap.set`s targets visible and returns null.
- `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge).
- `src/hooks/use-health.ts` — API health polling for the status chip.
- The menu clock hook (WIB) returns `string | null` and renders `"--:--"` server-side, then `Intl.DateTimeFormat(..., { timeZone: "Asia/Jakarta" })` in a mount effect — hydration-safe client clock pattern.

## apps/api

NestJS (ESM, `type: "module"`), port 4000, Prisma ORM (`postinstall: prisma generate`, generated client ignored at `apps/api/src/generated/`). Modules: `health` (used by the web status chip), `mail` (AWS SES), `storage` (AWS S3), `prisma`, `config`, and `cms` (members / articles / publications / jobs / research controllers + services — cache-backed records in a `slug` + `data JSONB` table each). Publication papers are raw `application/pdf` uploads (raw body parser registered in `main.ts`, size ceiling from `CMS_MAX_PAPER_BYTES`, default 200 MB) served through signed storage URLs; draft papers stay unservable via an ownership check. Tests: vitest (unit + e2e configs). Lint: oxlint. `docker compose` runs Postgres + api + web locally with env from `.env.example`.

## Environments & secrets

- `.env.example` documents docker-compose vars: `POSTGRES_*`, `DOCKERHUB_NAMESPACE`, plus compose-injected `CORS_ORIGIN`, `THROTTLE_*`, `AWS_*`, `SES_FROM_EMAIL`, `NEXT_PUBLIC_API_URL`.
- Real secrets live in **GitHub org-level** vars/secrets (Docker Hub) and Railway service variables — never in the repo. `.env` is gitignored.
