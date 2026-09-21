# Contributing to MGM Laboratory's website

Thanks for taking the time to contribute. This is a pnpm monorepo: a Next.js marketing site (`apps/web`) and a NestJS API (`apps/api`), sharing `packages/@repo/shared`. Read `docs/architecture.md` and `DESIGN_SYSTEM.md` before making UI changes.

## Workflow

There's no `dev` branch. Every change to `main` goes through a pull request:

1. Fork the repo (or branch directly if you're a collaborator).
2. Make your change, following the conventions in `docs/` (especially `docs/animation-system.md` if you're touching anything animated).
3. Open a PR against `main`. Keep PRs focused: one discrete change per PR is easier to review than a bundle of unrelated fixes.
4. Automated checks run on every PR (see below). All of them need to be green before a maintainer can merge.
5. A maintainer reviews and merges. See `GOVERNANCE.md` for how larger decisions get made.

## Required checks

Every PR runs:

- **CI**: lint, typecheck, `pnpm test` (API unit tests + coverage), build, for both workspaces.
- **Security**: CodeQL, dependency review, secret scanning (gitleaks), Trivy filesystem scan.
- **E2E**: Playwright across Chromium/Firefox/WebKit plus a Windows and a macOS job, including visual-regression screenshots for the primary browser.
- **SonarCloud Code Analysis**: posted automatically by SonarCloud's own GitHub App; no local setup needed.
- **pre-commit.ci**: runs repository hygiene checks and Prettier on every pull-request commit; formatting fixes are committed back to same-repository PRs automatically.

All of these need to actually succeed, not just avoid failing outright. A lint warning, a deprecation notice, or any other non-blocking annotation in a check's output is still something to fix before the PR is done, even if it doesn't turn the check red.

Run the fast ones locally before pushing: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`.

To run the same focused checks before committing, install [pre-commit](https://pre-commit.com/) and run `pre-commit install` once, then use `pre-commit run --all-files` when needed. The existing Husky hook continues to format staged files.

## Local setup

```bash
pnpm install
pnpm dev            # web on :3000, api on :4000
# or, for the full stack including Postgres:
docker compose up
```

See `docs/testing-verification.md` for how UI changes are expected to be verified (a real browser, not just green tests) before you consider something done.

## PR comment commands

Once a PR is open, anyone can comment:

- **`LGTM`**: in either a PR conversation comment or submitted review, gets a GIF reply. It doesn't do anything else: see `/merge` below for the command that actually ships a PR.

Maintainers, or anyone listed in `CODEOWNERS`, can also run:

- **`/check`**: re-runs the latest CI run for the PR's current commit.
- **`/preview`**: builds the PR's code into Docker images and deploys a throwaway Railway environment (web + api + Postgres + Redis + bucket) seeded with sanitized public production content, then comments the preview URL and its freshly rotated Railway superadmin password. The deploy is watched strictly (checked every minute, retried automatically on a crash, escalated to CODEOWNERS after 10 minutes without giving up, capped at 1 hour) with progress posted to the PR throughout. Torn down automatically when the PR closes, or safe to re-run any time.
- **`/merge`**: checks that every required check is green and there are no conflicts, merges with a merge commit, then thanks and tags every GitHub-linked contributor from the PR's commits, deletes the branch if it's safe to, tears down the PR's preview environment, and confirms the resulting production deploy actually succeeds before calling it done. If anything's not ready, it says what and does nothing else.
- **`/close`**: closes the PR without merging it. The branch is left alone (nothing is deleted), but any preview environment running for the PR is torn down immediately rather than left sitting around.

## Commit messages

Plain prose describing what changed and why, no AI-attribution trailers of any kind, please. Use a hyphen or a colon instead of an em dash. Never use an em dash in a commit message or PR title/body.
