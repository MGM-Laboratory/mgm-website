# MGM Laboratory

Monorepo for the MGM Laboratory company site: a Next.js marketing site (`apps/web`) and a NestJS API (`apps/api`), deployed on Railway.

[![CI](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/ci.yaml/badge.svg)](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/ci.yaml)
[![Security](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/security.yaml/badge.svg)](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/security.yaml)
[![E2E](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/e2e.yaml/badge.svg)](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/e2e.yaml)
[![Lighthouse](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/lighthouse.yaml/badge.svg)](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/lighthouse.yaml)
[![Docker](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/publish-docker-image-latest.yml/badge.svg)](https://github.com/MGM-Laboratory/mgm-website/actions/workflows/publish-docker-image-latest.yml)
[![codecov](https://codecov.io/gh/MGM-Laboratory/mgm-website/branch/main/graph/badge.svg)](https://codecov.io/gh/MGM-Laboratory/mgm-website)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=MGM-Laboratory_mgm-website3&metric=alert_status)](https://sonarcloud.io/project/overview?id=MGM-Laboratory_mgm-website3)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/MGM-Laboratory/mgm-website/badge)](https://securityscorecards.dev/viewer/?uri=github.com/MGM-Laboratory/mgm-website)
[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/MGM-Laboratory/mgm-website/main.svg)](https://results.pre-commit.ci/latest/github/MGM-Laboratory/mgm-website/main)

<img width="1454" src=".github/screenshots/1.png" />
<img width="1454" src=".github/screenshots/2.png" />
<img width="1454" src=".github/screenshots/3.png" />
<img width="1454" src=".github/screenshots/4.png" />
<img width="1454" src=".github/screenshots/5.png" />
<img width="1454" src=".github/screenshots/6.png" />
<img width="1454" src=".github/screenshots/7.png" />
<img width="1454" src=".github/screenshots/8.png" />
<img width="1454" src=".github/screenshots/9.png" />
<img width="1454" src=".github/screenshots/10.png" />
<img width="1454" src=".github/screenshots/11.png" />

## Docs

Start with [`CLAUDE.md`](CLAUDE.md): it is the maintained handoff memory and reading order for contributors and coding agents. The principal references are [`docs/project-overview.md`](docs/project-overview.md), [`docs/architecture.md`](docs/architecture.md), and [`docs/cms-admin.md`](docs/cms-admin.md). Design, animation, verification, CI/CD, mail, and collection-specific guides live in [`docs/`](docs/).

## Local development

Requires Node 22 and pnpm 11.3.0.

```bash
pnpm install
pnpm dev:web # http://localhost:3000
pnpm dev:api # http://localhost:4000
```

Copy the workspace examples to local `.env` files before using the API or `/admin`; `docker compose up` starts Postgres, web, and API together. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm format:check` before opening a PR. All changes use the branch → PR → required checks → `/merge` workflow in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the PR workflow, local setup, and what the required checks are. Security issues go to [`SECURITY.md`](SECURITY.md) instead of a public issue.
