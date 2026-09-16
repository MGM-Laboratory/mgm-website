# Repo History & Git Rules

## The 2026-09-12 migration

The repository was migrated from `github.com/MGM-Laboratory/mgm-website-legacy` (the original repo, renamed in place by the owner and kept as an untouched backup) to a fresh `github.com/MGM-Laboratory/mgm-website`. The owner's requirements, all met:

1. **Keep the full commit history** — all 109 commits on `main` (plus `dev` and `fix/ci-typecheck`) survived.
2. **Remove every AI mention** — 23 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer lines were stripped from commit bodies.
3. **Single contributor** — every commit's author AND committer was rewritten to `shirasakaren <ren@shirasaka.ren>` (the history previously mixed `Idham <idham@monarchintiteknologi.com>`, `shirasakaren`, and `Shirasaka Ren` spellings). GitHub shows exactly one contributor.
4. **CI/CD kept working** — GitHub Actions and Railway both re-verified (see `docs/ci-cd.md`).

How: `git filter-branch --env-filter` (unify identity) + `--msg-filter` (delete Claude/Anthropic lines) over the local branches, with a pre-rewrite backup at **`~/lab/website-migration-backup/`** (full git bundle of all refs + rsync of the working tree) on the owner's machine. Commit trees are byte-identical to before — only identities and message lines changed. The `dev` branch's history happened to already be fully clean and came out unchanged.

**Local remotes** (in this working copy): `origin` → `git@ren:MGM-Laboratory/mgm-website.git` (the live repo; `ren` is an SSH alias for github.com), `legacy` → the backup repo.

`shirasakaren <ren@shirasaka.ren>` was the single identity this migration unified history to at the time — a coworker's identity, not the repo owner's. There is no repo-local git identity override; commits use whatever `user.name`/`user.email` the working copy's own git config resolves to.

## Why the git rules are strict

The owner has twice insisted, in escalating terms, that commits must not mention Claude or any AI agent — no `Co-Authored-By` trailers, no "generated with", no AI references in messages or PR descriptions. This is a hard rule (they had the entire history rewritten over it). Commit messages should read as ordinary human engineering notes: plain prose, what changed and why.

Other standing rules:

- **Granular commits**: one discrete working change per commit; push to `origin main` immediately after each commit — the owner wants a large, granular history, not a few big batched commits.
- Only commit when the user has asked or it's clearly part of the ongoing task they're driving.
- Do not push new commits to the `legacy` remote — it's a frozen backup.

### Two paths to `main` since the 2026-09-15 CI/CD build-out

`main` now has a branch-protection ruleset requiring a PR + every required check for anyone to merge — but repo admins bypass it. In practice that means:

- **External contributors** go through `CONTRIBUTING.md`'s full fork → branch → PR flow, and need CI/security/e2e/Sonar/Harness all green before a maintainer merges.
- **The owner (and this agent, working as the owner)** keeps the granular-commit, direct-`git push origin main` workflow described above, unchanged. The ruleset's bypass exists specifically so this doesn't have to change.

## Known loose ends

- `apps/web/public/logo/` (department logos: `curriculum.svg`, `hr.svg`, `infra.svg`, `media.svg`, `pr.svg`, `rnd.svg`) is **untracked** and has been deliberately left alone through past work. Ask before committing it.
- `.env` is local-only (gitignored); `.env.example` documents the docker-compose surface.
- The 2026-09-12 session added four post-migration commits to `main`: `workflow_dispatch` triggers on both workflows, `pnpm/action-setup@v6` bump, the `ci.yml` → `ci.yaml` rename (which fixed push-triggered Actions — see `docs/ci-cd.md`), and this documentation set.
