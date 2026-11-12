# Contributing to MGM Laboratory's website

Thanks for taking the time to contribute. This is a pnpm monorepo: a Next.js marketing site (`apps/web`) and a NestJS API (`apps/api`), sharing `packages/@repo/shared`. Read `docs/architecture.md` and `DESIGN_SYSTEM.md` before making UI changes.

## Workflow

There's no `dev` branch. Every change to `main` goes through a pull request:

1. Fork the repo (or branch directly if you're a collaborator).
2. Make your change, following the conventions in `docs/` (especially `docs/animation-system.md` if you're touching anything animated).
3. Open a PR against `main`. Keep PRs focused: one discrete change per PR is easier to review than a bundle of unrelated fixes.
4. Automated checks run on every PR (see below). All of them need to be green before a maintainer can merge, and no review approval is required beyond that.
5. A maintainer merges the PR with a merge commit (never squash or rebase) once the checks are green. See `GOVERNANCE.md` for how larger decisions get made.

## Required checks

Every PR runs:

- **CI**: lint, typecheck, `pnpm test` (API unit tests + coverage), build, for both workspaces.
- **Security**: CodeQL, dependency review, secret scanning (gitleaks), Trivy filesystem scan.
- **E2E**: Playwright across Chromium/Firefox/WebKit plus a Windows and a macOS job, including visual-regression screenshots for the primary browser.
- **Lighthouse**: performance, accessibility, SEO and best-practices budgets on `/`, `/about` and `/contact`, on pull requests.
- **Prose**: Vale lint of the hand-written Markdown.
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

See `docs/testing-verification.md` for how UI changes are verified in a real browser, not just with green tests, when a maintainer asks for it.

## Commit messages

Plain prose describing what changed and why, no AI-attribution trailers of any kind, please. Use a hyphen or a colon instead of an em dash. Never use an em dash in a commit message or PR title/body.
