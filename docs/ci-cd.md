# CI/CD

Every push to `main` on `github.com/MGM-Laboratory/mgm-website` triggers CI, security scanning, e2e, the Docker build/publish/sign pipeline, and Railway auto-deploy. Every PR additionally gets all of that plus SonarCloud, three Harness checks, and a status comment. `main` is protected: PRs need every required check green to merge; repo admins can bypass for direct pushes.

## GitHub Actions workflows

| Workflow                                           | Triggers                                             | What it does                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yaml`                                          | push/PR to `main`, dispatch                          | pnpm install → format check → lint → typecheck → api test with coverage (uploaded to Codecov, flag `api`) → build, both workspaces, against a Postgres 17 service container                                                                               |
| `security.yaml`                                    | push/PR to `main`, weekly, dispatch                  | CodeQL (JS/TS), dependency review (PRs only, fails on new high/critical advisories), gitleaks secret scan (OSS CLI, not the licensed Action — see `.gitleaksignore`), Trivy filesystem scan, weekly OSSF Scorecard — all upload SARIF to the Security tab |
| `e2e.yaml`                                         | push/PR to `main`, dispatch                          | Playwright: chromium/firefox/webkit/mobile-chrome/mobile-safari on ubuntu, plus one Windows and one macOS job. Visual-regression baselines only on the primary ubuntu+chromium project                                                                    |
| `lighthouse.yaml`                                  | PR to `main`, dispatch                               | Lighthouse CI performance/accessibility/SEO/best-practices budget on `/`, `/about`, `/contact`                                                                                                                                                            |
| `publish-docker-image-latest.yml` / `-staging.yml` | push to `main` (latest) / any PR (staging), dispatch | Thin callers that invoke the per-image `publish-docker-image-api.yml`/`-web.yml` reusable workflows — build, push, Trivy scan, SBOM + attestation, keyless cosign signing. See "Docker image workflows" below                                             |
| `harness.yml`                                      | PR to `main` (`pull_request_target`), push to `main` | Triggers the three Harness pipelines below via API, polls, posts each as a GitHub commit status                                                                                                                                                           |
| `pr-bot.yml`                                       | `workflow_run` (CI/Security/E2E/Harness)             | Upserts one PR comment (as "ren-automation") summarizing every check-run + commit status for that SHA                                                                                                                                                     |
| `pr-commands.yml`                                  | PR comment created                                   | `LGTM`/`PTAL` → GIF, for anyone. `/check` (rerun latest checks) and `/preview` — gated to OWNER/MEMBER/COLLABORATOR                                                                                                                                       |
| `preview.yml`                                      | `workflow_dispatch` (from `/preview`)                | See "Preview environments" below                                                                                                                                                                                                                          |
| `preview-teardown.yml`                             | PR closed (`pull_request_target`)                    | Deletes that PR's preview environment                                                                                                                                                                                                                     |
| `preview-reaper.yml`                               | daily, dispatch                                      | Deletes any preview environment whose PR is no longer open, or that's older than 7 days regardless                                                                                                                                                        |
| `stale.yml`                                        | daily, dispatch                                      | Labels/closes inactive issues and PRs after 30/37 days                                                                                                                                                                                                    |

Renovate (not Dependabot — see the commit that swapped them) handles npm/Docker/GitHub Actions version updates; GitHub's native Dependabot security alerts stay on regardless.

### Docker image workflows

Split into per-image reusable workflows plus thin caller workflows, mirroring the pattern in `rensa` — one file per image, invoked with a `tag` input rather than duplicating build logic per trigger:

- **`publish-docker-image-api.yml`** / **`publish-docker-image-web.yml`** (`workflow_call`, input: `tag`) — the actual build+push logic, one per image (`apps/api/Dockerfile` → `website-api`, `apps/web/Dockerfile` → `website-web`). Guard: `if: vars.DOCKERHUB_USERNAME != ''` — if the var is absent the job silently skips (this is how it behaves on forks/CI without creds). Each build is pushed under three tags: the base `tag` input, `<tag>-<UTC timestamp>`, and `<tag>-<short sha>`. `linux/amd64` only, GHA cache scoped per app, `NEXT_PUBLIC_API_URL` build-arg from vars (web only).
- **`publish-docker-image-latest.yml`** — caller, triggers on push to `main` + `workflow_dispatch`. Calls both image workflows with `tag: latest`.
- **`publish-docker-image-staging.yml`** — caller, triggers on any pull request (`branches: ["*"]`) + `workflow_dispatch`. Calls both image workflows with `tag: staging`.

Version-tag-triggered releases (pushing `v*.*.*`) aren't wired up in this split — the previous single-file workflow supported it, this one doesn't yet. Add a third caller workflow if that's needed again.

**Docker Hub credentials live at the GitHub org level** (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` variables/secrets) — nothing is stored per-repo, so new repos in the org inherit them automatically.

### Fork-PR safety model

`/preview`'s `build` job is the only one that ever executes a PR's own code, and it holds zero secrets. Environment provisioning, image push, and data seeding are separate jobs that only ever touch artifacts that job produced — never the PR source directly. `preview-teardown.yml` and `harness.yml` use `pull_request_target` (not `pull_request`) because they need secrets but never run PR code at all — they only read the event payload (PR number, head SHA) and call an API.

### Verification commands

```bash
gh run list -R MGM-Laboratory/mgm-website
gh run watch -R MGM-Laboratory/mgm-website <id>
gh workflow run ci.yaml -R MGM-Laboratory/mgm-website --ref main
cosign verify --certificate-identity-regexp '.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com docker.io/labmgm/website-api:latest
```

## SonarCloud

Wired via SonarCloud's own GitHub App (Automatic Analysis), project `MGM-Laboratory_mgm-website2` — posts its own "SonarCloud Code Analysis" check on every push/PR with no workflow file needed.

## Harness

A second CI platform, independent of GitHub Actions:

1. **`harness-ci`** — build/lint/typecheck/test as a cross-platform second opinion.
2. **`harness-security`** — Semgrep SAST (distinct coverage from CodeQL).
3. **`harness-supply-chain`** — syft SBOM + a grype critical-CVE policy gate (distinct from the cosign/attest-sbom path).

Account `zpdJUsWiSYeXsnoCY8whvg`, org `default`, project `default_project`. Pipeline YAML lives in `.harness/`. There's deliberately no Harness-side GitHub connector or webhook trigger — the repo is public, so each pipeline just `git clone`s it directly, and `harness.yml` (GitHub Actions side) triggers executions via the Harness API and posts results back as commit statuses. This also sidesteps a connector-creation schema issue on this account that had no discoverable fix.

**Harness Cloud needs a credit card on file to run anything** ("To use Harness Cloud, you must provide a credit card to validate your account") — a one-time step in Harness account settings. Until then, all three checks fail at the billing gate before any real work runs.

## Preview environments (`/preview`)

Commenting `/preview` on a PR (maintainers/collaborators only) deploys a throwaway copy of the full stack:

1. **provision** (secrets, no PR code) — forks a `preview-pr-<n>` Railway environment from `production` (`environmentCreate` with `sourceEnvironmentId`, which clones service/database topology without copying any data), generates api/web domains, creates a dedicated bucket, overrides the vars that came over as literal values rather than references (bucket credentials, admin passphrase).
2. **build** (no secrets, runs the PR's own code) — builds both Docker images from the PR head.
3. **push-and-deploy** (secrets) — pushes the images Job 2 built to Docker Hub, points the preview environment's services at them (scoped to that environment only — verified this never affects production).
4. **seed-and-announce** (secrets) — copies `CmsArticle`/`Publication`/`Project`/`ResearchInitiative`/`Member` from production (read-only), strips draft/unpublished records and member phone numbers, copies only the bucket objects actually referenced, mints a fresh superadmin via the running preview api's own bootstrap endpoint, comments the links + credentials on the PR.

`CmsAdmin` (password hashes) and `CmsJobApplication` (applicant PII/CVs) are never read. Torn down automatically on PR close, with a daily reaper as a backstop.

**Needs a credit card equivalent for Railway**: this is real infrastructure spend per run — it's deliberately not triggered automatically, only by an explicit `/preview` comment from a maintainer.

## Railway

- **Project:** `mgm-company-profile` — id `810d3a40-d9d2-410c-b117-289d2aff095f` (workspace "Shirasaka Ren")
- **Environment:** `production` — id `42acf786-e8f4-41f8-8d4f-715bee1655f8`
- **Services:**
  - `web` (id `4969778e-0bff-4200-9472-6b5a13f037da`) — source: `MGM-Laboratory/mgm-website`, branch `main`, deploy on push; public domain `web-production-589d3f.up.railway.app` (port 3000)
  - `api` (id `b401b859-90cb-44cf-9787-054cc14290fd`) — same repo/branch, deploy on push
  - `Postgres` + `Redis` (managed) + `mgm-storage` S3-compatible bucket
- Deployments are **watch-path driven**: a push with no changes to a service's files skips it; normal pushes deploy both.

CLI checks (repo is linked to this project):

```bash
railway status --json                 # linked project context
railway deployment list --json        # newest-first; verify SUCCESS
railway logs --service web --lines 100
railway redeploy --service web --from-source --yes   # force pull latest commit
```

The Railway MCP tools are also available in agent sessions (`list-projects`, `describe-environment`, `list-deployments`, `get-logs`, …). Note: the `RAILWAY_TOKEN` secret used by the preview pipeline is a **project token** (scoped to `mgm-company-profile`, not the full account) — it can create/delete environments and services within this project via the public GraphQL API, but account-level queries like `me` fail for it by design.

## Governance

`main` requires a PR + every required status check to merge; repo admins can bypass (Settings → Rules → Rulesets). External contributors go through the full PR flow described in `CONTRIBUTING.md`; the owner/agent workflow of committing and pushing directly to `main` for routine work is unaffected.

## Local

`docker compose up` runs Postgres 17 + api (4000) + web (3000) with vars from `.env` / `.env.example`. `DOCKERHUB_NAMESPACE` in `.env.example` is the compose image namespace — CI uses repo-level GitHub vars instead.

## Historical: the workflow-rename incident (2026-09-12)

After the repo migration, push-triggered runs silently stopped firing on the fresh repo while `workflow_dispatch` kept working (everything read as enabled — the first-push workflow registration was stale). Renaming `ci.yml` → `ci.yaml` forced a fresh registration and restored push triggers instantly. If push-triggered Actions ever silently stop on a repo while dispatch works, try forcing re-registration (rename the workflow file) before suspecting anything deeper.
