# CI/CD

Every push to `main` on `github.com/MGM-Laboratory/mgm-website` triggers three things in parallel:

1. **GitHub Actions CI** (`ci.yaml`)
2. **Docker image build & push** (`publish-docker-image-latest.yml`)
3. **Railway auto-deploy** of the `web` and `api` services (~30s)

Every pull request additionally triggers a **staging Docker image build** (`publish-docker-image-staging.yml`), independent of the three above.

## GitHub Actions

### `ci.yaml`

Triggers: push to `main`, PRs to `main`, `workflow_dispatch` (manual). Runs on `ubuntu-latest` with a Postgres 17 service container; env `DATABASE_URL` (local postgres) and `NEXT_PUBLIC_API_URL` (`http://localhost:4000/api`). Steps: checkout → pnpm setup (`pnpm/action-setup@v6`) → Node from `.nvmrc` (22) → `pnpm install --frozen-lockfile` → **lint → typecheck → test → build** (turbo, all workspaces).

### Docker image workflows

Split into per-image reusable workflows plus thin caller workflows, mirroring the pattern in `rensa` — one file per image, invoked with a `tag` input rather than duplicating build logic per trigger:

- **`publish-docker-image-api.yml`** / **`publish-docker-image-web.yml`** (`workflow_call`, input: `tag`) — the actual build+push logic, one per image (`apps/api/Dockerfile` → `website-api`, `apps/web/Dockerfile` → `website-web`). Guard: `if: vars.DOCKERHUB_USERNAME != ''` — if the var is absent the job silently skips (this is how it behaves on forks/CI without creds). Each build is pushed under three tags: the base `tag` input, `<tag>-<UTC timestamp>`, and `<tag>-<short sha>`. `linux/amd64` only, GHA cache scoped per app, `NEXT_PUBLIC_API_URL` build-arg from vars (web only).
- **`publish-docker-image-latest.yml`** — caller, triggers on push to `main` + `workflow_dispatch`. Calls both image workflows with `tag: latest`.
- **`publish-docker-image-staging.yml`** — caller, triggers on any pull request (`branches: ["*"]`) + `workflow_dispatch`. Calls both image workflows with `tag: staging`.

Version-tag-triggered releases (pushing `v*.*.*`) aren't wired up in this split — the previous single-file workflow supported it, this one doesn't yet. Add a third caller workflow if that's needed again.

**Docker Hub credentials live at the GitHub org level** (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` variables/secrets) — nothing is stored per-repo, so new repos in the org inherit them automatically.

Verification commands:

```bash
gh run list -R MGM-Laboratory/mgm-website        # see runs
gh run watch -R MGM-Laboratory/mgm-website <id>  # follow one to completion
gh workflow run ci.yaml -R MGM-Laboratory/mgm-website --ref main   # manual run
```

### Historical: the workflow-rename incident (2026-09-12)

After the repo migration, push-triggered runs silently stopped firing on the fresh repo while `workflow_dispatch` kept working (everything read as enabled — the first-push workflow registration was stale). Renaming `ci.yml` → `ci.yaml` forced a fresh registration and restored push triggers instantly. If push-triggered Actions ever silently stop on a repo while dispatch works, try forcing re-registration (rename the workflow file) before suspecting anything deeper.

## Railway

- **Project:** `mgm-company-profile` — id `810d3a40-d9d2-410c-b117-289d2aff095f` (workspace "Shirasaka Ren")
- **Environment:** `production` — id `42acf786-e8f4-41f8-8d4f-715bee1655f8`
- **Services:**
  - `web` (id `4969778e-0bff-4200-9472-6b5a13f037da`) — source: `MGM-Laboratory/mgm-website`, branch `main`, deploy on push; public domain `web-production-589d3f.up.railway.app` (port 3000)
  - `api` (id `b401b859-90cb-44cf-9787-054cc14290fd`) — same repo/branch, deploy on push
  - `Postgres` (managed) + `mgm-storage` S3-compatible bucket (region `sin`)
- Deployments are **watch-path driven**: a push with no changes to a service's files skips it; normal pushes deploy both.

CLI checks (repo is linked to this project):

```bash
railway status --json                 # linked project context
railway deployment list --json        # newest-first; verify SUCCESS
railway logs --service web --lines 100
railway redeploy --service web --from-source --yes   # force pull latest commit
```

The Railway MCP tools are also available in agent sessions (`list-projects`, `describe-environment`, `list-deployments`, `get-logs`, …). Changing a service's source repo: `railway api` GraphQL `serviceConnect(id, {repo, branch})`, or the dashboard (Settings → Source).

## Local

`docker compose up` runs Postgres 17 + api (4000) + web (3000) with vars from `.env` / `.env.example`. `DOCKERHUB_NAMESPACE` in `.env.example` is the compose image namespace — CI uses the org-level GitHub vars instead.
