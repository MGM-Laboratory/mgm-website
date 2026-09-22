# CI/CD

Every merged change to `main` on `github.com/MGM-Laboratory/mgm-website` triggers CI, security scanning, e2e, the Docker build/publish/sign pipeline, and Railway auto-deploy. Every PR additionally gets all of that plus SonarCloud, pre-commit.ci, and a status comment. `main` is protected: every change uses the branch → PR → required checks → `/merge` flow; an administrative bypass exists but is not routine practice.

## GitHub Actions workflows

| Workflow                                           | Triggers                                              | What it does                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yaml`                                          | push/PR to `main`, dispatch                           | Three independently scoped jobs: `api` (lint → typecheck → test with coverage, uploaded to Codecov, flag `api` → build, against a Postgres 17 service container), `web` (lint → typecheck → build), `hygiene` (repo-wide format check, unconditional, plus automation-script tests gated on the `automation` scope). Aggregate gate: `Lint, typecheck, test & build` |
| `security.yaml`                                    | push/PR to `main`, weekly, dispatch                   | CodeQL (JS/TS), dependency review (PRs only, fails on new high/critical advisories), gitleaks secret scan (OSS CLI, not the licensed Action, see `.gitleaksignore`), Trivy filesystem scan, weekly OSSF Scorecard: all upload SARIF to the Security tab                                                                                                              |
| `e2e.yaml`                                         | push/PR to `main`, dispatch                           | Playwright: chromium/firefox/webkit/mobile-chrome/mobile-safari on ubuntu, plus one Windows and one macOS job. Visual-regression baselines only on the primary ubuntu+chromium project                                                                                                                                                                               |
| `lighthouse.yaml`                                  | PR to `main`, dispatch                                | Lighthouse CI performance/accessibility/SEO/best-practices budget on `/`, `/about`, `/contact`                                                                                                                                                                                                                                                                       |
| `vale.yaml`                                        | push/PR to `main`, dispatch                           | Prose lint over the repo's hand-written Markdown (Vale + the Google style package + a custom `MGM` style). See "Prose linting (Vale)" below                                                                                                                                                                                                                          |
| `publish-docker-image-latest.yml` / `-staging.yml` | push to `main` (latest) / any PR (staging), dispatch  | Thin callers that invoke the `publish-docker-image.yml` reusable workflow (matrix over api/web): build, push, Trivy scan, SBOM + attestation, keyless cosign signing. See "Docker image workflows" below                                                                                                                                                             |
| `detect-changes.yml`                               | `workflow_call` only                                  | Reusable: classifies every changed file into one or more of eleven independent scopes (api/web/e2e/lighthouse/prose/dependencies/codeql/trivy/docker_api/docker_web/automation). See "Skipping CI on docs-only changes" below                                                                                                                                        |
| `pr-bot.yml`                                       | `workflow_run` (checks and the trusted review signal) | Upserts one PR status comment for each completed check workflow; reads submitted reviews through the API and replies to a bare `LGTM` with the GIF. It runs from the default branch, never from PR code.                                                                                                                                                             |
| `pr-review.yml`                                    | `pull_request_review` (submitted)                     | Secret-free signal workflow. It does not comment or check out code; `pr-bot.yml` performs the privileged API read and reply.                                                                                                                                                                                                                                         |
| `pr-commands.yml`                                  | PR comment created                                    | A bare `LGTM` (light formatting, punctuation, or a common emoji allowed) → GIF, for anyone, no side effects. `/check`, `/preview`, `/merge`, `/close`, gated to OWNER/MEMBER/COLLABORATOR or anyone listed in `CODEOWNERS`.                                                                                                                                          |
| `preview.yml`                                      | `workflow_dispatch` (from `/preview`)                 | See "Preview environments" below                                                                                                                                                                                                                                                                                                                                     |
| `merge.yml`                                        | `workflow_dispatch` (from `/merge`)                   | See "Merging (`/merge`)" below                                                                                                                                                                                                                                                                                                                                       |
| `close.yml`                                        | `workflow_dispatch` (from `/close`)                   | See "Closing (`/close`)" below                                                                                                                                                                                                                                                                                                                                       |
| `preview-teardown.yml`                             | PR closed (`pull_request_target`)                     | Deletes that PR's preview environment                                                                                                                                                                                                                                                                                                                                |
| `preview-reaper.yml`                               | daily, dispatch                                       | Deletes any preview environment whose PR is no longer open, or that's older than 7 days regardless                                                                                                                                                                                                                                                                   |
| `stale.yml`                                        | daily, dispatch                                       | Labels/closes inactive issues and PRs after 30/37 days                                                                                                                                                                                                                                                                                                               |

Renovate (not Dependabot, see the commit that swapped them) handles npm/Docker/GitHub Actions version updates; GitHub's native Dependabot security alerts stay on regardless.

**Action pinning convention:** every `uses:` in every workflow file is pinned to the latest available release, as a full commit SHA rather than a mutable version tag (`@v4` etc.), with a `# vX.Y.Z` comment noting the human-readable version, for example `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`. When adding a new workflow or a new step, pin it the same way rather than using a bare tag, and prefer whatever the action's actual latest release is over an older major you happen to be used to; Renovate's `github-actions` manager understands this format and bumps both the SHA and the comment together on updates.

**Naming convention:** every workflow's top-level `name:` is a proper Title Case display name (`CI`, `Publish Docker Image`), never lowercase or kebab-case (`ci`, `publish-docker-image`), since the file's own kebab-case name is enough of an identifier on disk. Every `jobs.<id>` also has its own explicit `name:` rather than relying on the bare job id showing up in the Actions UI.

### Skipping CI on docs-only changes

`ci.yaml`, `e2e.yaml`, `lighthouse.yaml`, `security.yaml`, `vale.yaml`, and both `publish-docker-image-*.yml` callers all start with a `changes` job that calls the reusable `detect-changes.yml`. The classifier in `.github/scripts/change-scope.mjs` emits independent `api`, `web`, `e2e`, `lighthouse`, `prose`, `dependencies`, `codeql`, `trivy`, `docker_api`, `docker_web`, and `automation` scopes, one boolean per changed file's classification, merged across every file in the diff (a PR touching both `apps/api/` and `docs/` sets both `api` and `prose`). Each expensive job is gated on whichever scopes it actually needs, for example `apps/api/**` sets `api`/`codeql`/`trivy`/`docker_api` but never `web`/`docker_web`, and vice versa for `apps/web/**`; a change to `packages/` or the root lockfile sets every app-relevant scope, since shared code affects both; an unrecognized path forces every scope on rather than being silently treated as safe to skip.

**The gate pattern:** every one of those workflows ends with a `gate` job that turns however many real jobs it contains into one stable required-check name, the thing the ruleset actually requires. It always runs (`if: always()`, overriding the default that a job only runs once everything in `needs` has succeeded), lists every job in the workflow under `needs`, and inspects each one's outcome through `toJSON(needs)`:

```yaml
gate:
  name: E2E gate
  if: always()
  needs: [changes, e2e]
  runs-on: ubuntu-latest
  steps:
    - name: Require selected checks
      env:
        RESULTS: ${{ toJSON(needs) }}
      run: |
        node -e 'const jobs = JSON.parse(process.env.RESULTS);
        if (jobs.changes.result !== "success" ||
            Object.values(jobs).some(j => !["success","skipped"].includes(j.result)))
          process.exit(1)'
```

A real failure anywhere in the group fails the gate. A job that correctly skipped because nothing relevant changed still counts as passing. This is what lets the ruleset require one name per workflow (`Lint, typecheck, test & build`, `Security gate`, `E2E gate`, `Lighthouse gate`, `Prose gate`, `Docker staging gate`, `Docker latest gate`) instead of every individual job or matrix leg inside it, which matters because a matrix job skipped at the job level never expands, so GitHub posts one check-run under the raw unexpanded name instead of one per matrix combination: fine for a gate that only needs the job's overall result, but it would leave any individually required matrix-leg name permanently unsatisfiable.

Two jobs are deliberately **not** gated:

- **`secret-scan` (gitleaks)**: a secret can be pasted into a markdown file as easily as into source, so it has to scan doc-only diffs too.
- **`scorecard`**: restricted to the weekly schedule or an explicit dispatch on `main`; it scores the whole repo's posture, not a diff.

`hygiene`'s format-check step is unconditional for the same reason: `prettier --check .` covers the whole repo, not just automation scripts, so it needs to catch a formatting regression in any workspace regardless of scope. Only that job's other step, testing the automation scripts themselves, is gated on the `automation` scope.

Safety notes:

- `detect-changes.yml` only attempts the actual diff on `push`/`pull_request`. Every other trigger (`workflow_dispatch`, the weekly `schedule` on `security.yaml`) forces every scope on, so a manual run or the `/merge` post-merge dispatch is never silently skipped.
- A job skipped via `if:` reports conclusion `skipped`, and GitHub's required-status-checks treat a skipped required check as passing: this is why gating with `if:` on the downstream job is safe, whereas putting `paths-ignore` on the workflow's own `on:` trigger would **not** be (the check would never run at all, and a required check that never runs blocks the PR forever). Don't swap this for `paths-ignore` without changing that.
- CodeRabbit and SonarCloud are separate GitHub Apps, not workflow files in this repo, so they're unaffected by this and keep reviewing every PR (including docs-only ones) as before.

<!-- vale Google.Headings = NO -->

### Prose linting (Vale)

<!-- vale Google.Headings = YES -->

`vale.yaml` runs [Vale](https://vale.sh) over the repo's hand-written Markdown, not the generated or vendored kind: `README.md`, `AGENTS.md`, `CLAUDE.md`, `DESIGN_SYSTEM.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `GOVERNANCE.md`, `SECURITY.md`, `.github/pull_request_template.md`, `apps/api/README.md`, `apps/web/README.md`, and everything under `docs/`. `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` are deliberately excluded: `next dev` regenerates the first, and the second is a one-line include.

The `.vale.ini` at the repo root wires three style sources together:

- **`Vale`**: the base style bundled with the command-line tool itself, no download needed.
- **`Google`**: the Google developer-documentation style package, fetched via `vale sync` (the `Packages = Google` line) on every run.
- **`MGM`** (`.github/vale/styles/MGM/`): a small custom style that encodes this repo's own writing rules. `EmDash.yml` flags any em-dash. `Semicolon.yml` flags every semicolon, since Vale's `existence`/`raw` checks can't actually parse clause boundaries to tell a real splice from a legitimate list separator, and the message says so rather than overclaiming precision it doesn't have. Vale's Markdown tokenizer already skips fenced code blocks and inline code spans, so neither rule fires on code samples.

The job uses `vale-cli/vale-action` with `reporter: github-check` so it posts a dedicated check on both `push` and `pull_request` (reviewdog's PR-only reporters need a pull request to attach to, and `github-check` doesn't). `filter_mode: nofilter` and `fail_on_error: true` mean every run, on every trigger, scans every configured file in full and fails the job if Vale finds even one `error`-level alert anywhere in that scan, not only on lines a PR's diff happens to touch.

`EmDash` sits at `error` because the docs tree's entire pre-existing backlog, roughly 380 em-dashes across 17 files (written before the house style was consistently enforced by hand), was cleaned out in one pass rather than left to trickle away diff by diff. Before that cleanup, `filter_mode` stayed at its default `added` and `fail_on_error` was gated to `pull_request` events only, so the check graded only lines a PR's diff actually touched, and the untouched backlog couldn't block unrelated work. reviewdog's own `github-check` handling (`cmd/reviewdog/main.go`) checks whether the triggering event carries PR context, and if it doesn't (`push`, `workflow_dispatch`) it unconditionally overrides `filter_mode` to `nofilter` regardless of the action's own inputs, which is why the old `pull_request`-only `fail_on_error` gate existed in the first place: it kept that forced full-repo scan from failing every push to `main` against the backlog. Once the backlog reached zero, both settings were tightened to their current, unconditional form: a single new em-dash anywhere in a configured file now fails the check on any push, PR, or manual run. `Semicolon` stays `warning` because semicolons are a "should avoid," not a hard "never," per the house style, so it annotates without failing the check either way.

`.vale.ini` turns off a few rules from the bundled styles because they misfired against this repo's own content on the very first run:

- **`Vale.Spelling`**: the base style's spell checker, `error` by default, flags any word outside its small built-in English dictionary. It failed on ordinary technical terms in this repo's own docs, `reviewdog`, `tokenizer`, `vendored`, plus possessives like `repo's` and `PR's`. A generic dictionary isn't a good fit for a repo full of tool names and jargon. A dedicated spellchecker with a real technical vocabulary (`cspell`, for example) would be a better fit if the team wants real typo-catching later.
- **`Google.EmDash`**: only checks the spacing around a dash (`error`, message "Don't put a space before or after a dash"), which is redundant once `MGM.EmDash` already bans the character outright. Leaving both on just double-reports the same match.
- **`Google.Parens`** ("Use parentheses judiciously"): this repo's docs lean heavily on parenthetical asides as a deliberate, established voice, visible throughout this very file. Turned off globally rather than fighting an existing convention for a suggestion-level nit.

`Google.Headings` is also turned off for one specific heading, this section's own, via inline Vale markup (`<!-- vale Google.Headings = NO -->` / `= YES` around it) rather than a global `.vale.ini` line: its built-in exceptions list doesn't know the product name "Vale," so it reads "Prose linting (Vale)" as two capitalized words and flags it for title-case capitalization. "Vale" is a proper noun here, same as "Docker" or "Kubernetes," which are already in that list.

**Gotcha: `separator: "\n"` on a multi-line `files:` list silently disables the file scoping.** `@actions/core`'s `getInput()` trims all whitespace, including newlines, from every input by default. A `"\n"` separator therefore arrives as `""` at runtime, `vale-action` can't split the `files:` list on it, and it falls back to scanning the whole working directory instead of the curated `files:` list (Vale still respects `.gitignore`, so this doesn't pull in `node_modules`, but it does pull in every other first-party Markdown file, including the two deliberately excluded ones). The job's own check run posts a `warning` annotation describing the invalid path when this happens. `files:` is a single comma-separated string with `separator: ","` instead: commas survive the trim.

**Gotcha: the separate `vale` check can exceed GitHub's output limit.** `vale-action` posts two independent things: the Actions job's own pass/fail (correct, and the one that actually gates a PR), and a second, separately named GitHub Check Run (`vale`) that `reviewdog` creates to carry inline annotations. A full scan can produce hundreds of non-blocking suggestions and warnings, which exceed GitHub's 65,535-character check-output limit and cause reviewdog to fail while posting results. `min_alert_level: error` limits the action's output to the gate level, keeping the full scan strict while preventing that overflow. `level: warning` keeps reviewdog's own conclusion based on each annotation's severity.

### Docker image workflows

One reusable workflow matrixed over both images, plus thin caller workflows, invoked with a `tag` input rather than duplicating build logic per trigger:

- **`publish-docker-image.yml`** (`workflow_call`, input: `tag`): the actual build+push logic, `strategy.matrix` over `api`/`web` (`apps/api/Dockerfile` → `website-api`, `apps/web/Dockerfile` → `website-web`). The caller itself is gated by the classifier's Docker scopes, so docs-only changes do not invoke it; once invoked, the paired images are built together to keep the published tag coherent. Guard: `if: vars.DOCKERHUB_USERNAME != ''`; on forks without credentials the build skips and the caller's aggregate gate remains green.
- **`publish-docker-image-latest.yml`**: caller, triggers on push to `main` + `workflow_dispatch`. Calls the image workflow with `tag: latest`, using the local `./...` reference.
- **`publish-docker-image-staging.yml`**: caller, triggers on any pull request (`branches: ["*"]`) + `workflow_dispatch`. Calls the image workflow with `tag: pr-<PR number>` (falls back to the run number under `workflow_dispatch`, which has no PR number), using the same local `./...` reference. GitHub resolves that local reusable-workflow reference from the same commit as the caller, so the first PR introducing these files can invoke `publish-docker-image.yml` and future in-PR edits to the reusable workflow are picked up automatically.

Version-tag-triggered releases (pushing `v*.*.*`) aren't wired up here: the original single-file workflow supported it, this one doesn't yet. Add a third caller workflow if that's needed again. See "Releases" below for how releases are actually cut today (manually, no automation).

**Docker Hub credentials live at the GitHub org level** (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` variables/secrets), nothing is stored per-repo, so new repos in the org inherit them automatically.

## pre-commit.ci

The pre-commit.ci GitHub App runs `.pre-commit-config.yaml` on every pull-request commit. The configuration covers repository hygiene (valid structured files, merge-conflict markers, private keys, line endings, whitespace, and large additions) and runs the repo's pinned Prettier version over supported source and documentation files. Safe formatting fixes are committed back to same-repository pull requests automatically; dependency revisions in the configuration are updated weekly.

### Fork-PR safety model

`/preview`'s `build` job is the only one that ever executes a PR's own code, and it holds zero secrets. Environment provisioning, image push, and data seeding are separate jobs that only ever touch artifacts that job produced, never the PR source directly. `preview-teardown.yml` uses `pull_request_target` (not `pull_request`) because it needs secrets but never runs PR code at all: it only reads the event payload (PR number) and calls an API.

### Verification commands

```bash
gh run list -R MGM-Laboratory/mgm-website
gh run watch -R MGM-Laboratory/mgm-website <id>
gh workflow run ci.yaml -R MGM-Laboratory/mgm-website --ref main
cosign verify --certificate-identity-regexp '.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com docker.io/labmgm/website-api:latest
```

## Releases

Entirely manual: no workflow watches for or reacts to a `v*.*.*` tag (see the note above). To cut one:

```bash
git checkout main && git pull origin main
git tag -a v1.0.0 -m "v1.0.0" <commit-sha-or-omit-for-current-HEAD>
git push origin v1.0.0
gh release create v1.0.0 --title "v1.0.0" --generate-notes --target main
```

`--generate-notes` builds the changelog from merged PR titles since the previous tag (or from the beginning of history, for the first release). Before tagging, confirm CI is green and production is healthy on the exact commit being tagged (`gh run list --branch main --limit 5`, then `curl` both the web and api health endpoints): a release should represent something already verified working, not just "whatever main happens to be." v1.0.0 was cut this way from the tip of `main` after PR #48 merged.

## SonarCloud

Wired via SonarCloud's own GitHub App (Automatic Analysis), project `MGM-Laboratory_mgm-website3`, posts its own "SonarCloud Code Analysis" check on every push/PR with no workflow file needed.

## Security-scanner suppressions

Known false positives get suppressed at the source (an inline comment next to the flagged code), never by clicking "dismiss" through a scanner's own web UI/API, that way the reasoning ships with the diff and survives independently of any alert database.

- **CodeQL**: `js/type-confusion-through-parameter-tampering` fires on `body.length`/`buffer.length` in `cms-publications.controller.ts` and `cms-projects.controller.ts`. The query treats any read off `request.body` as possibly array-shaped (from duplicate query/body parameters), but these routes get a real `Buffer` from `main.ts`'s route-scoped `express.raw()` middleware, already guarded with `Buffer.isBuffer()`. The query has no visibility into that route-specific middleware wiring. Suppressed with GitHub's supported inline syntax, `// codeql[js/type-confusion-through-parameter-tampering]` on the line directly above each flagged line.
- **SonarCloud**: `githubactions:S7631` ("Forked repository code should not be checked out in privileged workflow contexts") fires on `preview-teardown.yml`'s checkout step. The rule is a blanket flag on any checkout inside a `pull_request_target` job; it can't see that the ref is hardcoded to `main` and never the fork's head, which is GitHub's own documented safe pattern for that trigger (see "Fork-PR safety model" above). Suppressed with a trailing `NOSONAR` comment on the checkout line. Because this project uses SonarCloud's Automatic Analysis, `sonar.issue.ignore.multicriteria` in a properties file is a no-op here, so `NOSONAR` is the only in-repo suppression available; if a given scanner version doesn't honor it, the fallback is SonarCloud's own "Resolve as → False Positive" transition on sonarcloud.io, still not GitHub's UI.

## Preview environments (`/preview`)

Commenting `/preview` on a PR (maintainers/collaborators only) deploys a throwaway copy of the full stack:

1. **provision** (secrets, no PR code): forks a `preview-pr-<n>` Railway environment from `production` (`environmentCreate` with `sourceEnvironmentId`, which clones service topology without copying database/Redis data), then replaces the cloned Postgres, Redis, API, and web variables before any application deploy. A new environment gets fresh Postgres/Redis passwords; a re-run reuses the deployed environment's current passwords, because rotating them would leave the running database holding the old password while the api is handed the new one. All connection strings are private references local to the preview environment; production `DATABASE_URL`, `REDIS_URL`, mail credentials, and storage credentials are never retained. Environments left broken by a failed prior attempt (missing topology, pre-isolation credentials, or a non-successful api deployment) are recreated from scratch. It generates api/web domains, creates a dedicated bucket, and rotates a fresh `ADMIN_PASSPHRASE` for the actual superadmin.
2. **build** (no secrets, runs the PR's own code): builds both Docker images from the PR head.
3. **push-and-deploy** (secrets): pushes the images Job 2 built to Docker Hub, points the preview environment's services at them (scoped to that environment only, verified this never affects production), then watches both deployments strictly: checked every minute, up to 3 automatic retries with the crash's log excerpt posted to the PR on each one, a one-time CODEOWNERS-mention comment if it's still not up after 10 minutes (without giving up), and a hard 1 hour ceiling. A single upserted status comment tracks the live state throughout.
4. **seed-and-announce** (secrets): reads only published production content over HTTPS, strips the one free-form member field that could contain a phone number, POSTs it to the preview api's `/bootstrap` endpoints, and copies only referenced public bucket objects. It never reads either database. It then verifies the preview's superadmin login and comments the links, seeded-content table, and freshly rotated Railway superadmin password on the PR. The credential is intentionally public because this is sanitized preview data, and it is replaced on every `/preview` run.

`CmsAdmin` (password hashes) and `CmsJobApplication` (applicant PII/CVs) have no public endpoint and are never read. Torn down automatically on PR close (or on `/merge`), with a daily reaper as a backstop.

**Needs a credit card equivalent for Railway**: this is real infrastructure spend per run. It's deliberately not triggered automatically, only by an explicit `/preview` comment from a maintainer or CODEOWNERS reviewer, who can also re-run it any time.

## Merging (`/merge`)

Commenting `/merge` on a PR (maintainers/CODEOWNERS only) runs `merge.yml`, entirely API-driven, no PR code is ever checked out:

1. Checks every check-run and commit status against the PR's head commit, plus GitHub's own `mergeable` flag. Anything failing, still running, or a merge conflict → replies with what's blocking it and stops. Nothing is changed.
2. If everything's green: merges with a merge commit (not squash: this repo keeps granular history, see `docs/repo-history.md`), pinned to the exact head SHA it just checked.
3. Only after GitHub confirms the merge, posts one combined comment thanking and tagging every GitHub-linked contributor represented in the PR commits (a small stats table, then the LGTM GIF).
4. Deletes the head branch only if it's genuinely safe: same repo (not a fork), not the default branch, and no other open PR still points at it.
5. Tears down that PR's `preview-pr-<n>` Railway environment if one exists: the lookup is asserted against the production environment id first, so it can never touch the real deployment.
6. Dispatches `ci.yaml` and `publish-docker-image-latest.yml` against the merge commit for the record, then watches production's post-merge deployment (Railway's GitHub integration deploys independently of this workflow: the signal watched is the production service instances' `latestDeployment` actually changing, not just going back to `SUCCESS`) for up to 10 minutes, and posts a final success comment or a CODEOWNERS-mention if the deploy came back unhealthy.

The dispatch in step 6, rather than watching for a push-triggered run on the merge commit, is deliberate: the merge itself is made with the Actions-provided `GITHUB_TOKEN`, and GitHub does not cascade-trigger other workflows from pushes made by that token (an anti-loop rule): confirmed live, a merge commit never got a push-triggered CI or Docker publish run at all. `workflow_dispatch` via the API isn't subject to that rule, so this gets them running against the merge commit, but their result isn't waited on or gated on here: Railway's own deployment status is the only thing in this step that's actually watched to completion.

## Closing (`/close`)

Commenting `/close` on a PR (maintainers/CODEOWNERS only) runs `close.yml`, entirely API-driven, no PR code is ever checked out, and unlike `/merge` there's no readiness gate since closing doesn't ship anything:

1. Closes the PR (`state: closed`): the code is **not** merged into `main`.
2. Leaves the head branch alone entirely: nothing is deleted, so the branch can be reopened or pushed to again later.
3. Tears down that PR's `preview-pr-<n>` Railway environment if one exists, using the exact same production-id-asserted lookup `/merge` uses (shared in `railway-api.mjs`'s `tearDownPreviewEnvironment`), so a closed PR's preview never keeps running or billing after the fact.

Note: `preview-teardown.yml`'s `pull_request_target: closed` backstop (row in the table above) never actually fires for a PR closed or merged through `/close` or `/merge`: same `GITHUB_TOKEN`-authored-action limitation as above; GitHub doesn't cascade-trigger it. Harmless here because both `/close` and `/merge` already tear down the preview environment explicitly and don't rely on it. It still fires normally for a PR a human closes through the GitHub UI. `preview-reaper.yml`'s daily sweep is schedule-triggered, unaffected either way, and remains the real backstop for anything either path missed.

## Railway

- **Project:** `mgm-company-profile`, id `810d3a40-d9d2-410c-b117-289d2aff095f`
- **Environment:** `production`, id `42acf786-e8f4-41f8-8d4f-715bee1655f8`
- **Services:**
  - `web` (id `4969778e-0bff-4200-9472-6b5a13f037da`), source: `MGM-Laboratory/mgm-website`, branch `main`, deploy on push; public domain `web-production-589d3f.up.railway.app` (port 3000)
  - `api` (id `b401b859-90cb-44cf-9787-054cc14290fd`), same repo/branch, deploy on push
  - `Postgres` + `Redis` (managed) + `mgm-storage` S3-compatible bucket
- Deployments are **watch-path driven**: a push with no changes to a service's files skips it; normal pushes deploy both.

CLI checks (repo is linked to this project):

```bash
railway status --json                 # linked project context
railway deployment list --json        # newest-first; verify SUCCESS
railway logs --service web --lines 100
railway redeploy --service web --from-source --yes   # force pull latest commit
```

The Railway MCP tools are also available in agent sessions (`list-projects`, `describe-environment`, `list-deployments`, `get-logs`, …). Note: the `RAILWAY_TOKEN` secret used by the preview pipeline is a **project token** (scoped to `mgm-company-profile`, not the full account): it can create/delete environments and services within this project via the public GraphQL API, but account-level queries like `me` fail for it by design.

### Uptime monitoring

A self-hosted [Gatus](https://github.com/twin/gatus) instance at `status.labmgm.org` watches the live site (`labmgm.org`) alongside the rest of the company's internal services, under the endpoint key `core_mgm-website`. It's separate infrastructure, not part of this repo or its CI, so there's nothing here to run or configure. The README's "Status" section reads Gatus's own badge endpoints directly and links each one to that endpoint's detail page (`status.labmgm.org/endpoints/core_mgm-website`):

```
https://status.labmgm.org/api/v1/endpoints/core_mgm-website/health/badge.svg
https://status.labmgm.org/api/v1/endpoints/core_mgm-website/uptimes/30d/badge.svg
```

Gatus also exposes a response-time badge (`.../response-times/:duration/badge.svg`, color-coded by threshold) and a shields.io-compatible variant of the health badge (`.../health/badge.shields`, a `{schemaVersion, label, message, color}` JSON blob) for a future badge that needs to visually match the shields.io ones in the README's badge rows instead of Gatus's own native SVG style. Neither is wired up yet.

## Governance

`main` requires an up-to-date PR, signed commits, resolved review threads, and the selected first-party gates below.

Pull request reviews: 0 approvals are numerically required, but the ruleset separately requires a Code Owner review, resolved via `CODEOWNERS` (currently `* @shirasakaren`, every file routes to the same owner). Combined with "require approval of the most recent reviewable push," the approval has to come from someone other than whoever pushed last, so self-push-then-approve doesn't satisfy it, and pushing new commits dismisses any stale prior approval. This doesn't create the single-maintainer deadlock a numeric approval requirement would (GitHub blocks a PR author from approving their own pull request): the code owner is a distinct identity from the usual PR author, so a real approval is always obtainable. External contributors, maintainers, and agents all follow the full PR flow described in `CONTRIBUTING.md`. Do not use an administrative bypass for routine work.

The ruleset also allows all three merge strategies (merge commit, squash, rebase) at the GitHub level, but `/merge`'s own automation always merges with a merge commit specifically (see "Merging" below). The broader allowance only matters for a manual merge through GitHub's own UI.

The `main-protection` ruleset (id `23450743`) deliberately requires only stable, repository-owned checks rather than every check reported by installed apps. This keeps the branch rule strict without allowing an unrelated or renamed third-party check to block every merge:

- CI: `Lint, typecheck, test & build`
- Security: `Security gate` (which includes gitleaks on every change and conditionally runs CodeQL, dependency review, and Trivy)
- Browser coverage: `E2E gate` (the seven Playwright projects run when browser-facing paths change)
- Quality: `Lighthouse gate` and `Prose gate`

All other workflows still run on their explicit triggers: staging Docker builds validate PR images, production Docker publishing runs after `main` changes, scheduled security and cleanup workflows run independently, and external apps may report their own checks. They are not merge requirements because their availability and check names are outside this repository's control.

**Update (2026-09-21):** all required checks on the `main-protection` ruleset except `security/snyk (MGM Laboratory)` are now pinned to their actual source app via `integration_id`, not left on the default "Any source." "Any source" means a same-named status or check run posted by anything, not just the app that's actually supposed to produce it, would satisfy that required check: pinning closes that. `security/snyk (MGM Laboratory)` is the one check left unpinned: it's posted from a user account (`shirasakaren`), not a GitHub App, and `integration_id` pinning only applies to Apps, so it has nothing to pin to until that integration moves behind a proper App installation.

**Hard rule going forward: treat the ruleset as something you edit deliberately, never as a casual re-save.** The recurring reset problem above came from exactly that: the Settings → Rules web UI resubmitting the whole form, stale pre-filled values included, on every save. Prefer a direct API read-modify-write (`gh api repos/MGM-Laboratory/mgm-website/rulesets/23450743`, edit only the field that needs to change, `PUT` the corrected payload back) over clicking through the web UI. Whenever a new check gets added to the required list, pin it to its real source immediately rather than leaving "Any source": look up the producing app first (`gh api repos/MGM-Laboratory/mgm-website/commits/<sha>/check-runs --jq '.check_runs[] | "\(.name) \(.app.slug) \(.app.id)"'` for Checks API entries). For a check run this gives the app id directly; the equivalent `.../statuses` endpoint for legacy commit statuses only returns `.creator` (a user or bot account, not an app), so map that provider to its app id independently (for example, `gh api apps/<slug>`) before pinning, and if the poster turns out to be a user account rather than an App, leave `integration_id` unset and record the exception here, the way `security/snyk` is documented above. Current app ids for this repo's checks:

| App                                                      | `integration_id` |
| -------------------------------------------------------- | ---------------- |
| GitHub Actions                                           | 15368            |
| GitHub Advanced Security (Trivy and gitleaks check-runs) | 57789            |
| SonarCloud                                               | 12526            |
| Codecov                                                  | 254              |
| DeepSource                                               | 16372            |
| pre-commit.ci                                            | 68672            |
| GitGuardian                                              | 46505            |
| Semgrep                                                  | 4965759          |

## Local

`docker compose up` runs Postgres 17 + api (4000) + web (3000) with vars from `.env` / `.env.example`. `DOCKERHUB_NAMESPACE` in `.env.example` is the compose image namespace, but CI uses repo-level GitHub vars instead.

## Historical: PR automation live verification (2026-09-21)

After the contributor-thanks, review-LGTM, and preview-isolation work (PR #75), the automation surface was exercised end-to-end: `/preview` twice in a row on PR #78 (a fresh provision, then a re-run that reused the deployed environment without rotating its database passwords, with all 209 articles seeding after the bootstrap caps were raised), an emoji-decorated `LGTM` conversation comment and a submitted `LGTM` review each received their GIF reply, and closing PR #78 tore the preview environment down automatically. This note itself landed via `/merge`, which tagged every GitHub-linked contributor in the thank-you comment and watched the production deployment come up.

## Historical: the workflow-rename incident (2026-09-12)

After the repo migration, push-triggered runs silently stopped firing on the fresh repo while `workflow_dispatch` kept working (everything read as enabled: the first-push workflow registration was stale). Renaming `ci.yml` → `ci.yaml` forced a fresh registration and restored push triggers instantly. If push-triggered Actions ever silently stop on a repo while dispatch works, try forcing re-registration (rename the workflow file) before suspecting anything deeper.

## Historical: Harness removed (2026-09-15)

This repo used to run a second CI platform on Harness Cloud (three checks: `harness-ci`, `harness-security`, `harness-supply-chain`, triggered via `harness.yml` and `.harness/*.yaml`). It was removed entirely: the account needed a credit card on file to run anything at all, and rather than leave a permanently red, unfixable check gating `/merge`, the whole integration (workflow, trigger script, pipeline YAML, secret) was deleted. CodeQL, gitleaks, Trivy, and SonarCloud remain as the security/quality coverage.

## Historical: /merge and /close live verification (2026-09-15)

After migrating to this repo, `/check`, `/preview`, `/merge`, and `/close` were each exercised end-to-end against real PRs (this very note landed via one of them) to confirm the full pipeline: readiness gating, the thank-you comment, the actual merge, safe branch deletion, preview teardown, and post-merge production verification, still works unchanged on the new repo.

## Historical: /merge post-merge dispatch fix verified (2026-09-15)

A second live `/merge` run (this note) confirmed the dispatch-based post-merge verification (see "Merging" above) actually works: `ci.yaml` and `publish-docker-image-latest.yml` were dispatched against this merge commit and the report correctly labeled them as dispatched rather than claiming a result it never checked.
