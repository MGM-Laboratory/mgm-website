# AGENTS.md — entry point for AI agents working in this repo

This is the **MGM Laboratory** website monorepo (Next.js 16 marketing site + NestJS API), live at `github.com/MGM-Laboratory/mgm-website`.

**Read `CLAUDE.md` (repo root) first** — it contains the hard rules every agent must follow (git identity, commit granularity, no AI attribution in commits, verification workflow) and the reading order. The deep-dive documentation lives in `docs/`:

- `docs/project-overview.md` — product context, all pages, content status
- `docs/architecture.md` — monorepo layout, components, data, routing
- `docs/animation-system.md` — GSAP conventions and known gotchas (read before touching animations)
- `docs/navigation-menu.md` — the full-screen menu system
- `docs/ci-cd.md` — GitHub Actions / Docker Hub / Railway
- `docs/testing-verification.md` — Playwright verification methodology
- `docs/repo-history.md` — the repo migration and why the git rules exist

Design decisions must follow `DESIGN_SYSTEM.md` (repo root).

**Next.js 16 warning:** this is not the Next.js from older training data — APIs and file conventions differ. Before writing Next-specific code, read the relevant guide in `apps/web/node_modules/next/dist/docs/` (resolved from `apps/web/`; see also `apps/web/AGENTS.md`, which is auto-managed by `next dev` — do not edit it).
