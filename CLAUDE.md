# MGM Laboratory Website

Monorepo for the **MGM Laboratory** homepage and backend: a heavily animated, theme-aware Next.js marketing site (`apps/web`) plus a NestJS API (`apps/api`) and a shared workspace package (`packages/@repo/shared`). Live at `github.com/MGM-Laboratory/mgm-website`, deployed on Railway (auto-deploy on every push to `main`).

## If you're new here, read in this order

1. `DESIGN_SYSTEM.md` (repo root) — brand philosophy, color tokens, typography, iconography. **The design source of truth.**
2. `docs/project-overview.md` — what the site is, all pages, content status.
3. `docs/architecture.md` — monorepo layout, component/data map, routing.
4. `docs/animation-system.md` — GSAP setup, conventions, and the **gotchas that have already cost days** (read before touching any animation).
5. `docs/navigation-menu.md` — the full-screen nav menu system spec.
6. `docs/ci-cd.md` — GitHub Actions + Docker Hub + Railway wiring.
7. `docs/testing-verification.md` — how work is verified here (Playwright + dev server).
8. `docs/repo-history.md` — the 2026-09-12 migration and why git rules are strict.

## ⚠️ Next.js 16 — not the Next.js in your training data

This project runs **Next.js 16.3.4** (App Router, React 19.2.8, Tailwind v4). APIs and conventions differ from older versions. `apps/web/AGENTS.md` (auto-managed by `next dev` — don't edit it) points at the bundled guides: **before writing any Next-specific code, read the relevant guide in `apps/web/node_modules/next/dist/docs/`** (resolve from the file's directory — in this monorepo `next` is not hoisted to the root).

## Hard rules (user-enforced — do not bend)

1. **Git identity & attribution.** Every commit must be authored AND committed as `shirasakaren <ren@shirasaka.ren>` (already set in repo-local git config — never override). **Never mention Claude, ChatGPT, or any AI agent anywhere in a commit message, trailer, PR description, or code comment — no `Co-Authored-By`, no "generated with", nothing.** The user once rewrote the entire 109-commit history over this. Details: `docs/repo-history.md`.
2. **Granular commits.** One discrete working change per commit; `git push origin main` immediately after each commit — don't batch unrelated fixes.
3. **Keep the dev server running** at `http://localhost:3000` at all times (`pnpm dev:web`). Check it responds before and after changes (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`).
4. **Verify before declaring done.** Interact with the result in a real browser (Playwright screenshots + interaction scripts; see `docs/testing-verification.md`), then `open http://localhost:3000`. Fixing a bug = reproducing it first, then re-testing the fix under the same conditions.
5. **Design discipline.** Use the `DESIGN_SYSTEM.md` tokens, not ad-hoc colors. Everything must be theme-aware (light/dark via `.dark` class) and reduced-motion safe (`prefers-reduced-motion`).
6. **Never let a static CSS class set `transform`/`translate-*`/`rotate-*`/`scale-*` on an element GSAP also animates** — GSAP stacks onto it instead of replacing it. This bug has shipped twice. See `docs/animation-system.md` §Gotchas.

## Commands

| Command                                      | What it does                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:web` / `pnpm dev:api` | Run everything / web (localhost:3000) / api (localhost:4000)               |
| `pnpm build`                                 | Turbo build all workspaces                                                 |
| `pnpm lint`                                  | ESLint (web) + oxlint (api)                                                |
| `pnpm typecheck`                             | `next typegen && tsc --noEmit` (web), `tsc --noEmit` (api)                 |
| `pnpm test`                                  | vitest (api only — web has no test script)                                 |
| `pnpm format` / `pnpm format:check`          | Prettier over the repo (also runs on staged files via husky + lint-staged) |
| `docker compose up`                          | Local Postgres + api + web stack (see `.env.example`)                      |
| `gh run watch`                               | Follow a GitHub Actions run on the new repo                                |

Node **22** (`.nvmrc`), pnpm **11.3.0** (`packageManager`), Turbo 2.10.

## Repo map

```
apps/web/            Next.js 16 marketing site (the focus of most work)
  src/app/           route groups — one folder per page (18 pages)
  src/components/    hero/ nav/ process/ sections/ + site-header, smooth-scroll,
                     theme-toggle, social-icons, providers, api-status
  src/data/          nav.ts (menu config), competencies.ts, projects.ts
  src/lib/           env.ts (zod-validated), scroll-reveal.ts (fadeUpOnScroll), utils.ts
  src/hooks/         use-health.ts (API health polling); the WIB menu clock hook lives inside nav/nav-menu.tsx
  public/            logo.svg, patterns/*.svg (pattern tiles), logo/*.svg (dept logos, untracked)
apps/api/            NestJS + Prisma API (health, mail, storage modules; port 4000)
packages/@repo/shared  shared workspace package (workspace:*)
.github/workflows/   ci.yaml (lint/typecheck/test/build), publish-docker-image-*.yml (Docker Hub)
DESIGN_SYSTEM.md     brand/design source of truth
docs/                deep-dive documentation (read them)
```

## Pages (apps/web/src/app)

`/` (hero + competencies + process + showcase) · `/about` · `/member` · `/careers` · `/contact` · `/articles` · `/events` · `/media` · Focus: `/game` `/website` `/mobile` `/ux` · Our Work: `/projects` `/publications` `/research` · `/privacy-policy` · `/terms-of-services`. Most standalone pages are `PageBand` stubs (hero band + CTA footer). Full inventory: `docs/project-overview.md`.

## CI/CD at a glance

- **GitHub Actions**: `ci.yaml` runs on push to `main` + PRs + manual dispatch; `publish-docker-image-latest.yml` (push to `main`) and `publish-docker-image-staging.yml` (any PR) call the reusable `publish-docker-image-api.yml`/`publish-docker-image-web.yml` workflows to build & push `website-api`/`website-web` images to Docker Hub (Docker Hub creds live at org level).
- **Railway**: project `mgm-company-profile` (`810d3a40-d9d2-410c-b117-289d2aff095f`), production env `42acf786-e8f4-41f8-8d4f-715bee1655f8`. Services `web` + `api` source from this repo's `main` and **auto-deploy on every push** (~30s). Postgres + `mgm-storage` bucket attached.
- Every push to `main` therefore triggers: GitHub Actions CI → Docker images → Railway deploys. Full details + verification commands: `docs/ci-cd.md`.
