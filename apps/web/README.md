# MGM Laboratory Web

The public MGM Laboratory site and its internal CMS workspace. It is a Next.js 16.3.4 App Router application using React 19, Tailwind v4, GSAP, and `next-themes`; it lives beside the NestJS API in this pnpm monorepo.

Read [`../../CLAUDE.md`](../../CLAUDE.md) before changing the app. In particular, this Next version has conventions that differ from older releases: consult the relevant bundled guide in `node_modules/next/dist/docs/` before writing Next-specific code. The design source of truth is [`../../DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md).

## Local development

From the repository root:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env
pnpm dev:web
```

The site runs at `http://localhost:3000`. Set `NEXT_PUBLIC_API_URL` and `CMS_API_URL` to the API (`http://localhost:4000/api` locally); `ADMIN_PASSPHRASE` must match the API when using `/admin`. `docker compose up` starts the complete local stack including Postgres.

Useful root commands:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm --filter web test:e2e
```

Keep the development server running while working on the UI and verify changes in a browser. [`../../docs/testing-verification.md`](../../docs/testing-verification.md) records the expected Playwright and manual checks.

## Application map

- Public routes: homepage, About, Members, Careers, Contact, Articles, Events, four Focus pages, Projects, Publications, Research, and the three remaining `PageBand` stubs (`/media`, `/privacy-policy`, `/terms-of-services`). Dynamic detail and application routes sit under their collections.
- `/admin` and `/admin/login`: the internal editorial workspace. It uses signed HTTP-only sessions, per-collection RBAC, and Next route handlers that proxy CMS requests to the API; it is not part of the public navigation. See [`../../docs/cms-admin.md`](../../docs/cms-admin.md).
- `src/components/`: page sections, CMS views, full-screen navigation, route-transition curtain, and the admin workspace.
- `src/data/`: static homepage/focus/navigation content. CMS-backed public content has matching helpers in `src/lib/` and API proxy routes under `src/app/api/`.

The complete public-page inventory is in [`../../docs/project-overview.md`](../../docs/project-overview.md); architecture and ownership boundaries are in [`../../docs/architecture.md`](../../docs/architecture.md).

## Design and animation constraints

Everything must work in light and dark themes and under `prefers-reduced-motion`. GSAP owns any transform it animates: never add a static Tailwind `transform`, `translate-*`, `rotate-*`, or `scale-*` class to the same element. The detailed patterns and established failure modes are in [`../../docs/animation-system.md`](../../docs/animation-system.md). The navigation menu and route curtain each have their own specifications in [`../../docs/navigation-menu.md`](../../docs/navigation-menu.md) and [`../../docs/page-transition.md`](../../docs/page-transition.md).

## Deployment

`next.config.ts` uses standalone output so `Dockerfile` can build a compact non-root runtime image from the monorepo root. Railway deploys the production web service from merged `main` changes. See [`../../docs/ci-cd.md`](../../docs/ci-cd.md) for the pull-request, Docker, preview, and production flow.
