# Project Overview — MGM Laboratory Website

## What this is

The **MGM Laboratory** company-profile site: a single marketing homepage with a heavily animated, theme-aware design, plus standalone informational pages. MGM Laboratory's identity is "playful, geometric, primary-colored, and human" — Bauhaus-style vocabulary (circles, X's, plus signs, leaves, arcs) quoted as a calm premium surface. The full brand philosophy is in `DESIGN_SYSTEM.md` (repo root); the design was built from a pixel-exact mockup the owner keeps locally at `~/lab/tmp/website.svg` (machine-specific — not in the repo).

- **Public contact email:** `hi@labmgm.org`
- **Timezone displayed in the menu:** Malang, Indonesia (WIB, `Asia/Jakarta`)
- **Socials (placeholder links for now):** Instagram, X (Formerly Twitter), YouTube, LinkedIn, Discord — configured in `apps/web/src/data/nav.ts`

## Pages

All routes live in `apps/web/src/app/` (one folder per route, App Router).

| Route                | Page                                                                                                                                                                                          | Status                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `/`                  | Homepage: hero ("MGM Laboratory / & Mobile Laboratory" split-character reveal + logo shard assembly), Core Competencies (4 flip cards), process/mosaic sections, project showcase, CTA footer | Complete, fully animated                                    |
| `/about`             | About Us                                                                                                                                                                                      | `PageBand` stub (hero band + CTA footer)                    |
| `/member`            | Member                                                                                                                                                                                        | `PageBand` stub                                             |
| `/careers`           | Careers                                                                                                                                                                                       | `PageBand` stub                                             |
| `/contact`           | Contact                                                                                                                                                                                       | `PageBand` stub                                             |
| `/articles`          | Articles                                                                                                                                                                                      | `PageBand` stub                                             |
| `/events`            | Events                                                                                                                                                                                        | `PageBand` stub — **not in the nav menu**                   |
| `/media`             | Media                                                                                                                                                                                         | `PageBand` stub — **not in the nav menu**                   |
| `/game`              | Focus: Game & New Media                                                                                                                                                                       | Competency page                                             |
| `/website`           | Focus: Website                                                                                                                                                                                | `PageBand` stub                                             |
| `/mobile`            | Focus: Mobile                                                                                                                                                                                 | `PageBand` stub                                             |
| `/ux`                | Focus: HCI/UX                                                                                                                                                                                 | `PageBand` stub                                             |
| `/projects`          | Our Work: Projects                                                                                                                                                                            | `PageBand` stub (homepage showcase uses `data/projects.ts`) |
| `/publications`      | Our Work: Publications                                                                                                                                                                        | `PageBand` stub                                             |
| `/research`          | Our Work: Research                                                                                                                                                                            | `PageBand` stub                                             |
| `/privacy-policy`    | Privacy Policy                                                                                                                                                                                | `PageBand` stub                                             |
| `/terms-of-services` | Terms of Service                                                                                                                                                                              | `PageBand` stub                                             |

`PageBand` (`apps/web/src/components/sections/page-band.tsx`) is the generic standalone-page scaffold: eyebrow + title + description over a brand-toned hero band with a motif shape, followed by `<CtaFooter />`.

## Nav menu content (source of truth: `apps/web/src/data/nav.ts`)

- **Home** → `/`
- **About Us** → `/about`
- **Focus** (dropdown, 2×2 bento cards) → Game & New Media `/game`, Website `/website`, Mobile `/mobile`, HCI/UX `/ux`
- **Our Work** (dropdown, bento: Projects 2×1 + Publications/Research 1×1) → Projects `/projects`, Publications `/publications`, Research `/research`
- **Member** → `/member` · **Articles** → `/articles` · **Careers** → `/careers` · **Contact** → `/contact`
- Bottom block: email widget (`hi@labmgm.org`, copy / open mail client) + Malang (ID) WIB clock · icon-only socials · Privacy Policy / Terms of Service links

Full behavior spec: `docs/navigation-menu.md`.

## Design references

- **Menu interaction model:** `https://kaizin.framer.website` — the hamburger, hover animations, and single-view (no-scroll) menu layout were studied from this site and adapted (not copied) to the MGM design system.
- **Hero / logo animation:** the shard-assembly logo animation used in the hero (after "& Mobile Laboratory") and reused when the nav menu opens.
- **Full mockup:** `~/lab/tmp/website.svg` on the owner's machine (local-only).

## What's placeholder vs. real

- **Real:** homepage hero, Core Competencies, nav/menu system, theme toggle, smooth scrolling, all page scaffolding, CI/CD.
- **Placeholder:** social media hrefs (`#`), page-band content on standalone pages, and the departments' actual copy. The API (`apps/api`) has working health/mail/storage modules but the web pages don't yet consume them beyond an API-status indicator.
