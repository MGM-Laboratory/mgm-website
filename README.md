# website

A pnpm-workspace monorepo with a Next.js frontend and a NestJS API.

## Stack

**Frontend** (`apps/web`) — Next.js 16 (App Router, Turbopack), Tailwind CSS v4, Zod,
TanStack Query & Table, Tiptap, Framer Motion, GSAP, next-themes, Zustand, React Hook
Form, shadcn-style utils (`clsx` + `tailwind-merge` + `class-variance-authority`).

**Backend** (`apps/api`) — NestJS 12 on Express, PostgreSQL via Prisma 7 (driver
adapters, no native engine binary), class-validator/class-transformer, Swagger,
rate limiting (`@nestjs/throttler`), structured logging (`nestjs-pino`), Helmet,
compression, and AWS SDK v3 clients for S3 and SES.

**Shared** (`packages/shared`) — Zod schemas shared between both apps (`@repo/shared`).

**Tooling** — Turborepo, TypeScript, ESLint/oxlint, Prettier, Husky + lint-staged,
Docker (multi-stage builds via `turbo prune`), GitHub Actions (CI + DockerHub publish).

## Getting started

Requires Node 22+ and pnpm (see `packageManager` in `package.json`).

```bash
pnpm install        # also generates the Prisma client and builds @repo/shared
docker compose up -d postgres   # or point DATABASE_URL at your own Postgres
pnpm --filter api prisma:migrate   # apply migrations (create your first one first: prisma migrate dev)
pnpm dev            # runs web (:3000) and api (:4000) in parallel via Turborepo
```

Env files: copy `.env.example` → `.env` at the root and inside `apps/api`, and
`apps/web/.env.example` → `apps/web/.env.local`. Local dev already ships a working
`.env`/`.env.local` pointing at `localhost`.

- Web: http://localhost:3000
- API: http://localhost:4000/api — health check at `/api/health`, Swagger docs at `/docs`

## Common scripts (run from the repo root, orchestrated by Turborepo)

| Script           | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| `pnpm dev`       | Start `web` and `api` in watch mode                     |
| `pnpm build`     | Build all apps/packages (respects the dependency graph) |
| `pnpm lint`      | Lint every workspace package                            |
| `pnpm typecheck` | Type-check every workspace package                      |
| `pnpm test`      | Run tests                                               |
| `pnpm format`    | Format the repo with Prettier                           |

Use `--filter <name>` (e.g. `pnpm --filter api add <pkg>`) to target a single
workspace package, or the shortcuts `pnpm dev:web` / `pnpm dev:api`.

## Project layout

```
apps/
  web/      Next.js app
  api/      NestJS app
    prisma/schema.prisma   Prisma schema (models go here)
    prisma.config.ts       Prisma 7 datasource config (connection URL lives here, not schema.prisma)
packages/
  shared/   @repo/shared — Zod schemas shared by web and api (must be built: `pnpm --filter @repo/shared build`)
```

## Database (Prisma 7)

Prisma 7 uses driver adapters instead of a native query engine binary. The
generated client lives at `apps/api/src/generated/prisma` (gitignored, regenerated
via the `postinstall` script). Key commands, run from `apps/api`:

```bash
pnpm prisma:migrate   # prisma migrate dev && prisma generate
pnpm prisma:deploy    # prisma migrate deploy (production)
pnpm prisma:studio    # Prisma Studio
```

## Docker

Each app has its own multi-stage `Dockerfile` that uses `turbo prune` to build a
minimal image (no monorepo devDependencies bleed into the runtime image, and the
Next.js image ships Next's standalone output).

```bash
docker compose up --build   # postgres + api + web, wired together
```

To build/push images to Docker Hub, set the `DOCKERHUB_USERNAME` repository
**variable** and `DOCKERHUB_TOKEN` repository **secret** in GitHub — the
`docker-publish` workflow then builds and pushes `api`/`web` images on every push
to `main` (tag `latest`) and on `v*.*.*` tags.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, tests, and a full build against a
real Postgres service container on every push/PR to `main`.

## Notes

- AWS S3/SES (`apps/api/src/storage`, `apps/api/src/mail`) work out of the box
  once `AWS_S3_BUCKET` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
  `SES_FROM_EMAIL` are set — they're optional locally and only throw if a
  storage/mail method is actually called without them configured.
- Environment variables for the API are validated at startup with Zod
  (`apps/api/src/config/env.validation.ts`) — invalid/missing required vars fail
  fast instead of surfacing as a runtime error later.
