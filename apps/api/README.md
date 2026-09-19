# MGM Laboratory API

The NestJS 12 API behind the MGM Laboratory website. It serves health checks, the public contact form, CMS collections, authenticated admin operations, S3-compatible media storage, and transactional mail. It is an ESM workspace in the pnpm monorepo; the web application lives in `../web` and shared schemas live in `../../packages/shared`.

For the system-level picture, start with [`../../docs/architecture.md`](../../docs/architecture.md). CMS and administrator operations are documented in [`../../docs/cms-admin.md`](../../docs/cms-admin.md); mail configuration is in [`../../docs/mail-system.md`](../../docs/mail-system.md).

## Local development

From the repository root:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev:api
```

The API listens on `http://localhost:4000`, with Swagger at `http://localhost:4000/docs` and the health check at `http://localhost:4000/api/health`. A running Postgres database and `DATABASE_URL` are required; `docker compose up` starts Postgres, API, and web together.

Use the root scripts for normal work:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter api test:e2e
pnpm build
```

## API surface

All application routes are prefixed with `/api`. The public surface includes:

- `GET /api/health` — verifies the API and its database connection.
- `POST /api/contact` and `/api/contact/attachments` — submit a contact inquiry and optional uploaded files.
- `GET /api/cms/{members,articles,publications,projects,research,events,jobs}` — published CMS content. Collection-specific media, papers, videos, calendar, registration, and application routes live beneath the same collection path.
- `GET /api/cms/contact-settings` and `GET /api/cms/home` — public singleton site settings.

CMS mutations use `x-cms-passphrase` at the API boundary. The browser never receives that secret: `/admin` uses signed, HTTP-only sessions and Next route handlers proxy the authorized requests. See [`../../docs/cms-admin.md`](../../docs/cms-admin.md) before changing authentication, permissions, or a collection contract.

## Configuration

[`./.env.example`](.env.example) lists every API variable. The required runtime values are `DATABASE_URL` and `ADMIN_PASSPHRASE`; all mail, Redis, and object-storage values are optional until their related feature is used. Keep production values in Railway service variables, never in the repository.

Media uses the AWS S3 SDK and also supports S3-compatible endpoints through `AWS_ENDPOINT_URL` and `AWS_S3_FORCE_PATH_STYLE`. Mail can route through Resend, SMTP, or AWS SES; Railway blocks production SMTP on plans below Pro, so Resend's HTTPS API is the practical production choice.

## Database and deployment

Prisma owns the schema and migrations in `prisma/`. `prisma generate` runs after installation; use `pnpm --filter api prisma:migrate` for local schema changes and `pnpm --filter api prisma:deploy` for a deployed database. `PrismaService` also creates the slug-keyed CMS tables idempotently at startup so an existing deployment can boot safely while incremental migrations catch up.

`Dockerfile` builds from the monorepo root with Turbo pruning and produces a non-root Node 22 Alpine image. Railway deploys the `main` branch automatically after a merged pull request; CI and image publishing are described in [`../../docs/ci-cd.md`](../../docs/ci-cd.md).
