# Contributing to MGM Laboratory's website

Thanks for taking the time to contribute. This is a pnpm monorepo with the lab's Next.js website and CMS workspace (`apps/web`) and a NestJS API (`apps/api`), sharing `packages/shared`. Read `docs/architecture.md` and `DESIGN_SYSTEM.md` before making UI changes. The index of all docs is `docs/README.md`.

## Before you change code

- This is Next.js 16, which differs from older versions. Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before you write Next-specific code.
- Use the tokens of `DESIGN_SYSTEM.md` and no ad-hoc colors. Every element must work in the light and the dark theme (the `.dark` class) and with `prefers-reduced-motion`.
- Never let a static CSS class set `transform`, `translate-*`, `rotate-*` or `scale-*` on an element that GSAP also animates. GSAP stacks onto the class instead of replacing it. See `docs/animation-system.md`.
- Add tests with new functionality. A bug fix comes with a test that fails without it. Put web tests in Playwright specs under `apps/web/e2e`. When a change cannot be tested, say why in the pull request.
- Heavy work runs in CI. Push the branch and read the results there. Run a single narrow check locally only when CI cannot explain a failure.

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
- **Conventional commits** and **PR format**: the commit messages, the title, the branch name, the label, the assignee and the body of the pull request.
- **pre-commit.ci**: runs repository hygiene checks and Prettier on every pull-request commit; it reports a formatting problem and does not push a fix, because the ruleset only accepts signed commits. Run Prettier yourself and commit the result.

All of these need to actually succeed, not just avoid failing outright. A lint warning, a deprecation notice, or any other non-blocking annotation in a check's output is still something to fix before the PR is done, even if it doesn't turn the check red.

These are the same commands that CI runs, listed in the table under Local setup. Run one locally only when CI cannot explain a failure.

To run the same focused checks before committing, install [pre-commit](https://pre-commit.com/) and run `pre-commit install` once, then use `pre-commit run --all-files` when needed. The existing Husky hook continues to format staged files.

## Local setup

```bash
pnpm install
pnpm dev            # web on :3000, api on :4000
# or, for the full stack including Postgres:
docker compose up
```

| Command                                    | What it does                                                        |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm dev`, `pnpm dev:web`, `pnpm dev:api` | Run everything, the web app (port 3000) or the API (port 4000).     |
| `pnpm build`                               | Build all workspaces with Turbo.                                    |
| `pnpm lint`                                | ESLint for the web app and oxlint for the API.                      |
| `pnpm typecheck`                           | Type check both workspaces.                                         |
| `pnpm test`                                | Run the API unit tests with vitest. The web app has no test script. |
| `pnpm format`, `pnpm format:check`         | Run Prettier over the repo. A hook also runs it on staged files.    |
| `docker compose up`                        | Start the local Postgres, API and web stack. See `.env.example`.    |

Node 22 (`.nvmrc`) and pnpm 11.3.0 (`packageManager`) are required.

See `docs/testing-verification.md` for how UI changes are verified in a real browser, not just with green tests, when a maintainer asks for it.

## Commit messages

Use Conventional Commits (`type(scope): summary`) in English. Name the branch `type/short-description`, and use the same type as the commits. Sign every commit so that GitHub shows it as verified. Do not mention an AI tool in a commit message, trailer, PR text or code comment. Keep the PR body to one bullet for each commit.

## Pull requests

- Name the branch `type/short-description`, for example `fix/contact-form-error`. The type is the same as the type of the commits.
- Write the title as a Conventional Commit, for example `fix(contact): show the error of the form`.
- The body is only the list of commits, one bullet for each commit.
- Add one label, `bug` for a fix, `enhancement` for a feature and `documentation` for docs only, and assign the pull request to yourself.
- The check "Conventional commits" reads every commit message and the title. The check "PR format" reads the branch, the label, the assignee and the body. A bad commit message needs a rebase that rewords it and a force push to your own branch. For a missing label or assignee, add it and rerun the failed check.
- The maintainer merges with a merge commit, never a squash or a rebase.
