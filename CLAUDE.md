# MGM Laboratory Website

Monorepo for the **MGM Laboratory** homepage and backend: a heavily animated, theme-aware Next.js marketing site (`apps/web`) plus a NestJS API (`apps/api`) and a shared workspace package (`packages/@repo/shared`). Live at `github.com/MGM-Laboratory/mgm-website`, published as Docker Hub images by CI and deployed on MGM infrastructure.

## If you're new here, read in this order

1. `DESIGN_SYSTEM.md` (repo root): brand philosophy, color tokens, typography, iconography. **The design source of truth.**
2. `docs/project-overview.md`: what the site is, all pages, content status.
3. `docs/architecture.md`: monorepo layout, component/data map, routing.
4. `docs/cms-admin.md`: CMS collections, the `/admin` workspace, signed sessions, RBAC, API proxy boundaries, and media storage.
5. `docs/animation-system.md`: GSAP setup, conventions, the homepage (hero play, magnets, reel and player, cursor flow), and the **gotchas that have already cost days** (read before touching any animation).
6. `docs/navigation-menu.md`: the full-screen nav menu system spec.
7. `docs/page-transition.md`: the full-screen navigation curtain played on every internal route change, and the related homepage-entrance-skip behavior.
8. `docs/projects-page.md`: the `/projects` index and the `/projects/[slug]` detail pages, the most animated pages (intro choreography, hero play, the WebGL cover stage, the horizontal themed detail page and its media stage, the project zoom transitions).
9. `docs/articles-page.md`: the `/articles` library, a persistent WebGL world the list and every article live in (the paper-card river, themed article pages, the in-world transitions, and the portal in and out of the rest of the site).
10. `docs/careers-cms.md`: job postings, application uploads, and the careers inbox.
11. `docs/shortlinks.md`: the link shortener (domains with Cloudflare setup, links with expiry and passphrases, the click path, per-link analytics).
12. `docs/forms.md`: the form builder (the Forms workspace in `/admin`, the form document and its logic, responses, analytics, and the immersive public form at `/forms/[slug]`).
13. `docs/mail-system.md`: the 3-provider mail abstraction (Resend/SMTP/SES). **Read this before touching mail config.** Some hosts block outbound SMTP, so the provider choice has to follow what the deployment allows.
14. `docs/ci-cd.md`: GitHub Actions, Docker Hub images and how they are deployed.
15. `docs/testing-verification.md`: how work is verified here (Playwright + dev server).
16. `docs/repo-history.md`: the 2026-09-12 migration and why git rules are strict.

## ⚠️ Next.js 16: not the Next.js in your training data

This project runs **Next.js 16.3.4** (App Router, React 19.2.8, Tailwind v4). APIs and conventions differ from older versions. `apps/web/AGENTS.md` (auto-managed by `next dev`, so don't edit it) points at the bundled guides: **before writing any Next-specific code, read the relevant guide in `apps/web/node_modules/next/dist/docs/`** (resolve from the file's directory, since in this monorepo `next` is not hoisted to the root).

## Hard rules (user-enforced, do not bend)

1. **Git identity & attribution.** Commit as whatever identity `git config user.name`/`user.email` resolves to in this working copy: no repo-local override, and never impersonate another contributor's identity. **Never mention Claude, ChatGPT, or any AI agent anywhere in a commit message, trailer, PR description, or code comment: no `Co-Authored-By`, no "generated with," nothing.** The user once rewrote the entire 109-commit history over this. Details: `docs/repo-history.md`.
2. **Granular commits and PR flow.** One discrete working change per commit, pushed to the working branch immediately. Every change goes through a branch and a pull request, and the required checks must pass. Never push directly to `main`. A pull request is merged with a merge commit, never squash or rebase.
3. **Dev server only when the owner asks for it in that moment.** When asked, run it at `http://localhost:3000` (`pnpm dev:web`) and check that it responds before and after changes (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`).
4. **Browser verification only when the owner asks for it in that moment.** When asked, interact with the result in a real browser (Playwright screenshots and interaction scripts, see `docs/testing-verification.md`), then `open http://localhost:3000`. When fixing a bug, reproduce it first, then re-test the fix under the same conditions.
5. **Design discipline.** Use the `DESIGN_SYSTEM.md` tokens, not ad-hoc colors. Everything must be theme-aware (light/dark via `.dark` class) and reduced-motion safe (`prefers-reduced-motion`).
6. **Never let a static CSS class set `transform`/`translate-*`/`rotate-*`/`scale-*` on an element GSAP also animates**: GSAP stacks onto it instead of replacing it. This bug has shipped twice. See `docs/animation-system.md` §Gotchas.
7. **Merging.** Never merge a PR unless the user explicitly asks for it in that moment, and double-check that this is really what they want before acting, because a merge to `main` publishes new Docker Hub images. Merge with a merge commit (`gh pr merge <n> --merge`), never squash or rebase, so the individual commits of each PR stay on `main`. Required checks must pass first.
8. **Verified commits.** Every commit pushed from this working copy must be signed with the configured SSH signing key and verified by GitHub. Keep `commit.gpgsign=true`, `gpg.format=ssh`, and the repository signing key configured.

## Commands

| Command                                      | What it does                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:web` / `pnpm dev:api` | Run everything / web (localhost:3000) / api (localhost:4000)               |
| `pnpm build`                                 | Turbo build all workspaces                                                 |
| `pnpm lint`                                  | ESLint (web) + oxlint (api)                                                |
| `pnpm typecheck`                             | `next typegen && tsc --noEmit` (web), `tsc --noEmit` (api)                 |
| `pnpm test`                                  | vitest (api only, web has no test script)                                  |
| `pnpm format` / `pnpm format:check`          | Prettier over the repo (also runs on staged files via husky + lint-staged) |
| `docker compose up`                          | Local Postgres + api + web stack (see `.env.example`)                      |
| `gh run watch`                               | Follow a GitHub Actions run on the new repo                                |

Node **22** (`.nvmrc`), pnpm **11.3.0** (`packageManager`), Turbo 2.10.

## Repo map

```
apps/web/            Next.js 16 marketing site (the focus of most work)
  src/app/           29 page files: public pages, dynamic detail pages, and the admin workspace (plus API route handlers)
  src/components/    hero/ (interactions/ = desktop hero play, compact/ = the toy box under 880 px)
                     process/ (the fridge magnets) reel/ (the homepage reel, player/ = full-screen player)
                     cursor-distortion/ (site-wide cursor flow) home-extras/ (kinetic headings, finale,
                     3D mark) lab-notes/ nav/ transition/ (page-transition curtain) sections/
                     contact/ careers/ members/ articles/ (world/ list/ detail/ transitions/)
                     projects/ (all real, CMS-driven)
                     + admin/ (internal CMS workspace), site-header, smooth-scroll, theme-toggle,
                     social-icons, providers, api-status, app-boot-tracker
  src/data/          nav.ts (menu config), competencies.ts, process-magnets.ts, reel.ts, and other static page content
  src/lib/           env.ts (zod-validated), scroll-reveal.ts (fadeUpOnScroll), app-boot.ts, utils.ts,
                     gl-host.ts (cursor flow GL contract), reel-player.ts, lab-notes.ts, motion/ (pointer, magnetic, idle)
  src/hooks/         use-health.ts (API health polling); the WIB menu clock hook lives inside nav/nav-menu.tsx
  public/            logo.svg, patterns/*.svg (pattern tiles), logo/*.svg (dept logos, untracked)
apps/api/            NestJS + Prisma API (health, mail [3-provider: Resend/SMTP/SES], storage, shortlinks modules; port 4000)
packages/@repo/shared  shared workspace package (workspace:*)
.github/workflows/   ci.yaml (lint/typecheck/test/build), publish-docker-image-*.yml (Docker Hub)
DESIGN_SYSTEM.md     brand/design source of truth
docs/                deep-dive documentation (read them)
```

## Pages (apps/web/src/app)

`/` (hero, process magnets, reel, featured projects, competencies, Trusted By, publications, articles, footer finale) · `/about` · `/member` · `/careers` · `/contact` · `/articles` · `/events` · `/media` · Focus: `/game` `/website` `/mobile` `/ux` · Our Work: `/projects` `/publications` `/research` · `/privacy-policy` · `/terms-of-services` · `/forms/[slug]` (public forms built in the admin). `/admin` is the internal, signed-session CMS workspace and is deliberately outside the public menu. Only `/media`, `/privacy-policy`, and `/terms-of-services` are bare `PageBand` stubs; every other public route is real and CMS-driven where applicable. Full inventory: `docs/project-overview.md`; CMS detail: `docs/cms-admin.md`.

## CI/CD at a glance

- **GitHub Actions**: `ci.yaml` runs on push to `main` + PRs + manual dispatch; `publish-docker-image-latest.yml` (push to `main`) and `publish-docker-image-staging.yml` (any PR) call the reusable `publish-docker-image.yml` workflow (matrixed over api/web) to build & push `website-api`/`website-web` images to Docker Hub (Docker Hub creds live at org level).
- **Deployment**: the Docker Hub images are deployed on MGM infrastructure, outside this repository. No workflow here deploys or restarts anything.
- Every push to `main` therefore triggers GitHub Actions CI and the Docker image publish. Full details and verification commands are in `docs/ci-cd.md`.
