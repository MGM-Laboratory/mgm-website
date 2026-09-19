# Repo History & Git Rules

## The 2026-09-12 migration

The repository was migrated from `github.com/MGM-Laboratory/mgm-website-legacy` (the original repo, renamed in place by the owner and kept as an untouched backup) to a fresh `github.com/MGM-Laboratory/mgm-website`. The owner's requirements, all met:

1. **Keep the full commit history** — all 109 commits on `main` (plus `dev` and `fix/ci-typecheck`) survived.
2. **Remove every AI mention** — 23 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer lines were stripped from commit bodies.
3. **Single contributor** — every commit's author AND committer was rewritten to one identity (the history previously mixed several spellings of the same person's name/email). GitHub shows exactly one contributor.
4. **CI/CD kept working** — GitHub Actions and Railway both re-verified (see `docs/ci-cd.md`).

How: `git filter-branch --env-filter` (unify identity) + `--msg-filter` (delete Claude/Anthropic lines) over the local branches, with a pre-rewrite backup at **`~/lab/website-migration-backup/`** (full git bundle of all refs + rsync of the working tree) on the owner's machine. Commit trees are byte-identical to before — only identities and message lines changed. The `dev` branch's history happened to already be fully clean and came out unchanged.

There is no repo-local git identity override; commits use whatever `user.name`/`user.email` the working copy's own git config resolves to.

## Why the git rules are strict

The owner has twice insisted, in escalating terms, that commits must not mention Claude or any AI agent — no `Co-Authored-By` trailers, no "generated with", no AI references in messages or PR descriptions. This is a hard rule (they had the entire history rewritten over it). Commit messages should read as ordinary human engineering notes: plain prose, what changed and why.

Other standing rules:

- **Granular commits**: one discrete working change per commit; push immediately after each commit (to the feature branch — see below for why it's no longer `origin main` directly) — the owner wants a large, granular history, not a few big batched commits.
- Only commit when the user has asked or it's clearly part of the ongoing task they're driving.
- Do not push new commits to the `legacy` remote — it's a frozen backup.

### `main` requires a PR — for everyone, including the owner/agent

`main` has a branch-protection ruleset requiring a PR + every required check to merge. The ruleset technically allows repo admins to bypass it with a direct push, but **as of 2026-09-15 the actual, established practice is not to** — the owner explicitly moved the owner/agent workflow to the same branch → PR → `/merge` path external contributors use (see `CONTRIBUTING.md`), just without needing a fork. A prior version of this doc described the owner/agent as keeping a direct-`git push origin main` workflow; that's stale — don't attempt a direct push to `main` on the strength of that old claim. In practice, every single change across many sessions since (dozens of PRs, up through #49 as of this writing) has gone through branch → commit → push → open PR → wait for every check green → confirm `CLEAN`/`MERGEABLE` → comment `/merge`, with **no exceptions for size** — even a one-line README fix or a docs-only change goes through the full flow. `/merge` itself is documented in `docs/ci-cd.md`.

Still unchanged: **granular commits** (one discrete working change per commit, push immediately after each) and **never merge a PR unless the user explicitly asks for it in that moment** — `/merge` ships to production in about 30 seconds, so that instruction is never assumed from context alone.

## Known loose ends

- `apps/web/public/logo/` (department logos: `curriculum.svg`, `hr.svg`, `infra.svg`, `media.svg`, `pr.svg`, `rnd.svg`) is **untracked** and has been deliberately left alone through past work. Ask before committing it.
- `.env` is local-only (gitignored); `.env.example` documents the docker-compose surface.
- `apps/web/src/components/admin/member-cms-studio.tsx` renders its sidebar preview and its main editor panel each as one giant `section === "x" ? (...) : section === "y" ? (...) : ...` ternary chain (~10 branches apiece). SonarCloud flags the two points where the "contact" branch was added (`typescript:S3358`, "Extract this nested ternary operation into an independent statement") as new issues, marked won't-fix for now — suppressed inline with `// NOSONAR` since fixing it properly means restructuring both chains (e.g. to a switch or a lookup-by-section map), which is a real refactor of shared admin-studio code, not a one-line fix, and out of scope for whatever PR happens to be the next one to touch a `section === ...` branch. Whoever adds the next section (or has spare time) should do that refactor and remove the `NOSONAR` markers.
- The 2026-09-12 session added four post-migration commits to `main`: `workflow_dispatch` triggers on both workflows, `pnpm/action-setup@v6` bump, the `ci.yml` → `ci.yaml` rename (which fixed push-triggered Actions — see `docs/ci-cd.md`), and this documentation set.
