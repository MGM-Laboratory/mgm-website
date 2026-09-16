# CI/CD

Every push to `main` on `github.com/MGM-Laboratory/mgm-website` triggers CI, security scanning, e2e, the Docker build/publish/sign pipeline, and Railway auto-deploy. Every PR additionally gets all of that plus SonarCloud, pre-commit.ci, and a status comment. `main` is protected: PRs need every required check green to merge; repo admins can bypass for direct pushes.

## GitHub Actions workflows

| Workflow                                           | Triggers                                             | What it does                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yaml`                                          | push/PR to `main`, dispatch                          | pnpm install → format check → lint → typecheck → api test with coverage (uploaded to Codecov, flag `api`) → build, both workspaces, against a Postgres 17 service container                                                                               |
| `security.yaml`                                    | push/PR to `main`, weekly, dispatch                  | CodeQL (JS/TS), dependency review (PRs only, fails on new high/critical advisories), gitleaks secret scan (OSS CLI, not the licensed Action — see `.gitleaksignore`), Trivy filesystem scan, weekly OSSF Scorecard — all upload SARIF to the Security tab |
| `e2e.yaml`                                         | push/PR to `main`, dispatch                          | Playwright: chromium/firefox/webkit/mobile-chrome/mobile-safari on ubuntu, plus one Windows and one macOS job. Visual-regression baselines only on the primary ubuntu+chromium project                                                                    |
| `lighthouse.yaml`                                  | PR to `main`, dispatch                               | Lighthouse CI performance/accessibility/SEO/best-practices budget on `/`, `/about`, `/contact`                                                                                                                                                            |
| `publish-docker-image-latest.yml` / `-staging.yml` | push to `main` (latest) / any PR (staging), dispatch | Thin callers that invoke the `publish-docker-image.yml` reusable workflow (matrix over api/web) — build, push, Trivy scan, SBOM + attestation, keyless cosign signing. See "Docker image workflows" below                                                 |
| `pr-bot.yml`                                       | `workflow_run` (CI/Security/E2E)                     | Upserts one PR comment (as "ren-automation") summarizing every check-run + commit status for that SHA                                                                                                                                                     |
| `pr-commands.yml`                                  | PR comment created                                   | `LGTM` → GIF, for anyone, no side effects. `/check`, `/preview`, `/merge`, `/close` — gated to OWNER/MEMBER/COLLABORATOR or anyone listed in `CODEOWNERS`                                                                                                 |
| `preview.yml`                                      | `workflow_dispatch` (from `/preview`)                | See "Preview environments" below                                                                                                                                                                                                                          |
| `merge.yml`                                        | `workflow_dispatch` (from `/merge`)                  | See "Merging (`/merge`)" below                                                                                                                                                                                                                            |
| `close.yml`                                        | `workflow_dispatch` (from `/close`)                  | See "Closing (`/close`)" below                                                                                                                                                                                                                            |
| `preview-teardown.yml`                             | PR closed (`pull_request_target`)                    | Deletes that PR's preview environment                                                                                                                                                                                                                     |
| `preview-reaper.yml`                               | daily, dispatch                                      | Deletes any preview environment whose PR is no longer open, or that's older than 7 days regardless                                                                                                                                                        |
| `stale.yml`                                        | daily, dispatch                                      | Labels/closes inactive issues and PRs after 30/37 days                                                                                                                                                                                                    |

Renovate (not Dependabot — see the commit that swapped them) handles npm/Docker/GitHub Actions version updates; GitHub's native Dependabot security alerts stay on regardless.

**Action pinning convention:** every `uses:` in every workflow file is pinned to the latest available release, as a full commit SHA rather than a mutable version tag (`@v4` etc.), with a `# vX.Y.Z` comment noting the human-readable version — e.g. `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`. When adding a new workflow or a new step, pin it the same way rather than using a bare tag, and prefer whatever the action's actual latest release is over an older major you happen to be used to; Renovate's `github-actions` manager understands this format and bumps both the SHA and the comment together on updates.

**Naming convention:** every workflow's top-level `name:` is a proper Title Case display name (`CI`, `Publish Docker Image`), never lowercase or kebab-case (`ci`, `publish-docker-image`) — the file's own kebab-case name is enough of an identifier on disk. Every `jobs.<id>` also has its own explicit `name:` rather than relying on the bare job id showing up in the Actions UI.

### Docker image workflows

One reusable workflow matrixed over both images, plus thin caller workflows, invoked with a `tag` input rather than duplicating build logic per trigger:

- **`publish-docker-image.yml`** (`workflow_call`, input: `tag`) — the actual build+push logic, `strategy.matrix` over `api`/`web` (`apps/api/Dockerfile` → `website-api`, `apps/web/Dockerfile` → `website-web`), which run as two parallel job instances rather than two separate files. Guard: `if: vars.DOCKERHUB_USERNAME != ''` — if the var is absent the job silently skips (this is how it behaves on forks/CI without creds). Each build is pushed under three tags: the base `tag` input, `<tag>-<UTC timestamp>`, and `<tag>-<short sha>`. `linux/amd64` only, GHA cache scoped per matrix entry, `NEXT_PUBLIC_API_URL` build-arg from vars (web only, via a per-entry `matrix.build-args`).
- **`publish-docker-image-latest.yml`** — caller, triggers on push to `main` + `workflow_dispatch`. Calls the image workflow with `tag: latest`, using the local `./...` reference.
- **`publish-docker-image-staging.yml`** — caller, triggers on any pull request (`branches: ["*"]`) + `workflow_dispatch`. Calls the image workflow with `tag: pr-<PR number>` (falls back to the run number under `workflow_dispatch`, which has no PR number), using the same local `./...` reference. A reusable workflow that has never been merged to the default branch can't be resolved by a `pull_request`-triggered run yet — regardless of local vs. remote-pinned syntax — so this fails on its first PR (the one introducing `publish-docker-image.yml` itself) until that PR merges once; after that it resolves normally, including picking up any future in-PR edits to `publish-docker-image.yml` itself, which a version-pinned remote reference never would.

Version-tag-triggered releases (pushing `v*.*.*`) aren't wired up here — the original single-file workflow supported it, this one doesn't yet. Add a third caller workflow if that's needed again.

**Docker Hub credentials live at the GitHub org level** (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` variables/secrets) — nothing is stored per-repo, so new repos in the org inherit them automatically.

## pre-commit.ci

The pre-commit.ci GitHub App runs `.pre-commit-config.yaml` on every pull-request commit. The configuration covers repository hygiene (valid structured files, merge-conflict markers, private keys, line endings, whitespace, and large additions) and runs the repo's pinned Prettier version over supported source and documentation files. Safe formatting fixes are committed back to same-repository pull requests automatically; dependency revisions in the configuration are updated weekly.

### Fork-PR safety model

`/preview`'s `build` job is the only one that ever executes a PR's own code, and it holds zero secrets. Environment provisioning, image push, and data seeding are separate jobs that only ever touch artifacts that job produced — never the PR source directly. `preview-teardown.yml` uses `pull_request_target` (not `pull_request`) because it needs secrets but never runs PR code at all — it only reads the event payload (PR number) and calls an API.

### Verification commands

```bash
gh run list -R MGM-Laboratory/mgm-website
gh run watch -R MGM-Laboratory/mgm-website <id>
gh workflow run ci.yaml -R MGM-Laboratory/mgm-website --ref main
cosign verify --certificate-identity-regexp '.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com docker.io/labmgm/website-api:latest
```

## SonarCloud

Wired via SonarCloud's own GitHub App (Automatic Analysis), project `MGM-Laboratory_mgm-website2` — posts its own "SonarCloud Code Analysis" check on every push/PR with no workflow file needed.

## Security-scanner suppressions

Known false positives get suppressed at the source (an inline comment next to the flagged code), never by clicking "dismiss" through a scanner's own web UI/API — that way the reasoning ships with the diff and survives independently of any alert database.

- **CodeQL** — `js/type-confusion-through-parameter-tampering` fires on `body.length`/`buffer.length` in `cms-publications.controller.ts` and `cms-projects.controller.ts`. The query treats any read off `request.body` as possibly array-shaped (from duplicate query/body parameters), but these routes get a real `Buffer` from `main.ts`'s route-scoped `express.raw()` middleware, already guarded with `Buffer.isBuffer()` — the query has no visibility into that route-specific middleware wiring. Suppressed with GitHub's supported inline syntax, `// codeql[js/type-confusion-through-parameter-tampering]` on the line directly above each flagged line.
- **SonarCloud** — `githubactions:S7631` ("Forked repository code should not be checked out in privileged workflow contexts") fires on `preview-teardown.yml`'s checkout step. The rule is a blanket flag on any checkout inside a `pull_request_target` job; it can't see that the ref is hardcoded to `main` and never the fork's head, which is GitHub's own documented safe pattern for that trigger (see "Fork-PR safety model" above). Suppressed with a trailing `NOSONAR` comment on the checkout line. Because this project uses SonarCloud's Automatic Analysis, `sonar.issue.ignore.multicriteria` in a properties file is a no-op here, so `NOSONAR` is the only in-repo suppression available; if a given scanner version doesn't honor it, the fallback is SonarCloud's own "Resolve as → False Positive" transition on sonarcloud.io — still not GitHub's UI.

## Preview environments (`/preview`)

Commenting `/preview` on a PR (maintainers/collaborators only) deploys a throwaway copy of the full stack:

1. **provision** (secrets, no PR code) — forks a `preview-pr-<n>` Railway environment from `production` (`environmentCreate` with `sourceEnvironmentId`, which clones service/database topology without copying any data), generates api/web domains, creates a dedicated bucket, overrides the vars that came over as literal values rather than references (bucket credentials, admin passphrase).
2. **build** (no secrets, runs the PR's own code) — builds both Docker images from the PR head.
3. **push-and-deploy** (secrets) — pushes the images Job 2 built to Docker Hub, points the preview environment's services at them (scoped to that environment only — verified this never affects production), then watches both deployments strictly: checked every minute, up to 3 automatic retries with the crash's log excerpt posted to the PR on each one, a one-time CODEOWNERS-mention comment if it's still not up after 10 minutes (without giving up), and a hard 1 hour ceiling. A single upserted status comment tracks the live state throughout.
4. **seed-and-announce** (secrets) — seeds published content into the preview by reading production's own public `/api/cms/*` endpoints (drafts and admin-only fields are already filtered server-side there — no database credential is used for either environment) and POSTing it to the preview api's `/bootstrap` endpoints, copies only the bucket objects actually referenced, mints a fresh superadmin via the preview api, comments the links + a seeded-content table + credentials on the PR.

`CmsAdmin` (password hashes) and `CmsJobApplication` (applicant PII/CVs) have no public endpoint and are never read. Torn down automatically on PR close (or on `/merge`), with a daily reaper as a backstop.

**Needs a credit card equivalent for Railway**: this is real infrastructure spend per run — it's deliberately not triggered automatically, only by an explicit `/preview` comment from a maintainer or CODEOWNERS reviewer, who can also re-run it any time.

## Merging (`/merge`)

Commenting `/merge` on a PR (maintainers/CODEOWNERS only) runs `merge.yml`, entirely API-driven — no PR code is ever checked out:

1. Checks every check-run and commit status against the PR's head commit, plus GitHub's own `mergeable` flag. Anything failing, still running, or a merge conflict → replies with what's blocking it and stops. Nothing is changed.
2. If everything's green: posts one combined comment thanking the contributor by name (with a small stats table and the check results), then the LGTM GIF.
3. Merges with a merge commit (not squash — this repo keeps granular history, see `docs/repo-history.md`).
4. Deletes the head branch only if it's genuinely safe: same repo (not a fork), not the default branch, and no other open PR still points at it.
5. Tears down that PR's `preview-pr-<n>` Railway environment if one exists — the lookup is asserted against the production environment id first, so it can never touch the real deployment.
6. Dispatches `ci.yaml` and `publish-docker-image-latest.yml` against the merge commit for the record, then watches production's post-merge deployment (Railway's GitHub integration deploys independently of this workflow — the signal watched is the production service instances' `latestDeployment` actually changing, not just going back to `SUCCESS`) for up to 10 minutes, and posts a final success comment or a CODEOWNERS-mention if the deploy came back unhealthy.

The dispatch in step 6, rather than watching for a push-triggered run on the merge commit, is deliberate: the merge itself is made with the Actions-provided `GITHUB_TOKEN`, and GitHub does not cascade-trigger other workflows from pushes made by that token (an anti-loop rule) — confirmed live, a merge commit never got a push-triggered CI or Docker publish run at all. `workflow_dispatch` via the API isn't subject to that rule, so this gets them running against the merge commit, but their result isn't waited on or gated on here — Railway's own deployment status is the only thing in this step that's actually watched to completion.

## Closing (`/close`)

Commenting `/close` on a PR (maintainers/CODEOWNERS only) runs `close.yml`, entirely API-driven — no PR code is ever checked out, and unlike `/merge` there's no readiness gate since closing doesn't ship anything:

1. Closes the PR (`state: closed`) — the code is **not** merged into `main`.
2. Leaves the head branch alone entirely — nothing is deleted, so the branch can be reopened or pushed to again later.
3. Tears down that PR's `preview-pr-<n>` Railway environment if one exists, using the exact same production-id-asserted lookup `/merge` uses (shared in `railway-api.mjs`'s `tearDownPreviewEnvironment`), so a closed PR's preview never keeps running or billing after the fact.

Note: `preview-teardown.yml`'s `pull_request_target: closed` backstop (row in the table above) never actually fires for a PR closed or merged through `/close` or `/merge` — same `GITHUB_TOKEN`-authored-action limitation as above; GitHub doesn't cascade-trigger it. Harmless here because both `/close` and `/merge` already tear down the preview environment explicitly and don't rely on it. It still fires normally for a PR a human closes through the GitHub UI. `preview-reaper.yml`'s daily sweep is schedule-triggered, unaffected either way, and remains the real backstop for anything either path missed.

## Railway

- **Project:** `mgm-company-profile` — id `810d3a40-d9d2-410c-b117-289d2aff095f`
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

## Historical: Harness removed (2026-09-15)

This repo used to run a second CI platform on Harness Cloud (three checks: `harness-ci`, `harness-security`, `harness-supply-chain`, triggered via `harness.yml` and `.harness/*.yaml`). It was removed entirely — the account needed a credit card on file to run anything at all, and rather than leave a permanently-red, unfixable check gating `/merge`, the whole integration (workflow, trigger script, pipeline YAML, secret) was deleted. CodeQL, gitleaks, Trivy, and SonarCloud remain as the security/quality coverage.

## Historical: /merge and /close live verification (2026-09-15)

After migrating to this repo, `/check`, `/preview`, `/merge`, and `/close` were each exercised end-to-end against real PRs (this very note landed via one of them) to confirm the full pipeline — readiness gating, the thank-you comment, the actual merge, safe branch deletion, preview teardown, and post-merge production verification — still works unchanged on the new repo.

## Historical: /merge post-merge dispatch fix verified (2026-09-15)

A second live `/merge` run (this note) confirmed the dispatch-based post-merge verification (see "Merging" above) actually works: `ci.yaml` and `docker-publish.yml` were dispatched against this merge commit and the report correctly labeled them as dispatched rather than claiming a result it never checked.
