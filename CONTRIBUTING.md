# Contributing to MGM Laboratory's website

Thanks for taking the time to contribute. This is a pnpm monorepo with the lab's Next.js website and CMS workspace (`apps/web`) and a NestJS API (`apps/api`), sharing `packages/shared`. Read `docs/architecture.md` and `DESIGN_SYSTEM.md` before making UI changes. The index of all docs is `docs/README.md`.

## Before you change code

- This is Next.js 16, which differs from older versions. Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before you write Next-specific code.
- Use the tokens of `DESIGN_SYSTEM.md` and no ad-hoc colors. Every element must work in the light and the dark theme (the `.dark` class) and with `prefers-reduced-motion`.
- Never let a static CSS class set `transform`, `translate-*`, `rotate-*` or `scale-*` on an element that GSAP also animates. GSAP stacks onto the class instead of replacing it. See `docs/animation-system.md`.
- Add tests with new functionality. A bug fix comes with a test that fails without it. Put API and web logic tests in vitest specs next to the code (`*.spec.ts`), and browser tests in Playwright specs under `apps/web/e2e`. When a change cannot be tested, say why in the pull request.
- This is the test policy of the project. A pull request that adds major new functionality must add tests for it to the automated test suite. The maintainer does not merge one that does not. CI runs the suite on every pull request that changes code and reports the result.
- Follow the coding standards. TypeScript runs in strict mode. ESLint (`apps/web/eslint.config.mjs`) and oxlint check the code, and Prettier sets the format. CI fails a pull request on a lint error, a type error or a formatting difference, so every contribution has to comply. An inline disable comment names the rule, and gives the reason where it is not obvious.
- Heavy work runs in CI. Push the branch and read the results there. Run a single narrow check locally only when CI cannot explain a failure.

## Workflow

There's no `dev` branch. Every change to `main` goes through a pull request:

1. Fork the repo (or branch directly if you're a collaborator).
2. Make your change, following the conventions in `docs/` (especially `docs/animation-system.md` if you're touching anything animated).
3. Open a PR against `main`. Keep PRs focused: one discrete change per PR is easier to review than a bundle of unrelated fixes.
4. Automated checks run on every PR (see below). All of them need to be green before the PR can merge, and the code owner has to approve it. This holds for every PR that a contributor opens. A member of the maintainer team can merge without the approval, as the Code review section says.
5. Only a member of the maintainer team merges the PR, with a merge commit (never squash or rebase), once the checks are green and, for a contributor PR, the approval is given. Nobody can push to `main` directly, and every commit has to be signed. See `GOVERNANCE.md` for how larger decisions get made.

## Required checks

Every PR runs the checks below. The ruleset requires all of them except pre-commit.ci.

- **CI**: lint, typecheck, `pnpm test` (API and web unit tests, both with coverage), build, for both workspaces. Coverage counts every source file of `apps/api/src`, and in the web app the files of `src/lib` and `src/app/api`, whether a test loads them or not.
- **Security**: CodeQL, dependency review, secret scanning (gitleaks), Trivy filesystem scan.
- **E2E**: Playwright across Chromium/Firefox/WebKit plus a Windows and a macOS job, including visual-regression screenshots for the primary browser.
- **Lighthouse**: performance, accessibility, SEO and best-practices budgets on `/`, `/about` and `/contact`, on pull requests.
- **Prose**: Vale lint of the hand-written Markdown.
- **Config**: actionlint, Zizmor, Hadolint, dotenv-linter, `docker compose config`, ShellCheck, ls-lint for file names and the Renovate validator.
- **Images**: the amd64 build of the API image and of the web image, so a change that breaks a Dockerfile cannot merge.
- **Conventional commits** and **PR format**: the commit messages, the title, the branch name, the label, the assignee and the body of the pull request.
- **pre-commit.ci** is not required by the ruleset, but its report should be clean. It runs repository hygiene checks and Prettier on every pull-request commit. It reports a formatting problem and does not push a fix, because the ruleset only accepts signed commits. Run Prettier yourself and commit the result.

All of these need to actually succeed, not just avoid failing outright. A lint warning, a deprecation notice, or any other non-blocking annotation in a check's output is still something to fix before the PR is done, even if it doesn't turn the check red.

These are the same commands that CI runs, listed in the table under Local setup. Run one locally only when CI cannot explain a failure.

To run the same focused checks before committing, install [pre-commit](https://pre-commit.com/) and run `pre-commit install` once, then use `pre-commit run --all-files` when needed. The existing Husky hook continues to format staged files.

## Code review

Every change goes through a pull request and the required checks. This section says how a change is reviewed, and it also says what the rules do not guarantee.

### How a review is done

- The code owner named in `.github/CODEOWNERS` reviews each pull request from a contributor and has to approve it before it can merge.
- A member of the maintainer team can merge a pull request without that approval, through the ruleset bypass. The required checks and the signed commits still apply in full. The ruleset does not guarantee a second person for such a pull request, so a maintainer may ask another member of the team to look at a larger change.
- An automated review bot, CodeRabbit, comments on pull requests from people. It does not replace the review of a person.
- The reviewer reads the whole diff, reads the result of every check, and runs the change when it touches behavior that the checks do not cover.
- A new push dismisses an earlier approval, so the reviewer looks at the new commits again.
- The author answers or fixes every review thread. A thread is resolved only when it is handled, and the ruleset blocks the merge while a thread is open.

### What the reviewer checks

- The pull request is one change with one purpose, and the commits, the branch, the label and the body follow the rules above.
- A new feature comes with tests, and a bug fix comes with a test that fails without the fix. Code that depends on how PostgreSQL behaves has a test in a `.db.spec.ts` file, which CI runs on a real database.
- A change to a route updates the API reference in `docs-site/openapi.yaml`, and a change of behavior updates the matching page in `docs/`. A claim in a doc is true against the code.
- Inputs are validated on the server, no secret or token is added, and nothing in a public text names an unfixed weakness.
- A change to the interface follows the design system in `DESIGN_SYSTEM.md` and the accessibility rules in `ACCESSIBILITY.md`.
- The change adds no deprecated API and no dependency without a reason.

### When a change is acceptable

A pull request is acceptable when every required check is green, no review thread is open, and the code owner has approved it or a member of the maintainer team merges it under the ruleset bypass. A reviewer who asks for changes says in a comment what is wrong and why, and nobody should merge the pull request while that request is open.

## Local setup

```bash
pnpm install
pnpm dev            # web on :3000, api on :4000
# or, for the full stack including Postgres:
docker compose up
```

| Command                                    | What it does                                                     |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `pnpm dev`, `pnpm dev:web`, `pnpm dev:api` | Run everything, the web app (port 3000) or the API (port 4000).  |
| `pnpm build`                               | Build all workspaces with Turbo.                                 |
| `pnpm lint`                                | ESLint for the web app and oxlint for the API.                   |
| `pnpm typecheck`                           | Type check both workspaces.                                      |
| `pnpm test`                                | Run the unit tests of the API and the web app with vitest.       |
| `pnpm format`, `pnpm format:check`         | Run Prettier over the repo. A hook also runs it on staged files. |
| `docker compose up`                        | Start the local Postgres, API and web stack. See `.env.example`. |

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
