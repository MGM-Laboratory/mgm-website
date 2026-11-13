# Repo History & Git Rules

## The 2026-09-12 migration

The repository was migrated from `github.com/MGM-Laboratory/mgm-website-legacy` (the original repo, renamed in place by the owner and kept as an untouched backup) to a fresh `github.com/MGM-Laboratory/mgm-website`. The owner's requirements, all met:

1. **Keep the full commit history**: all 109 commits on `main` (plus `dev` and `fix/ci-typecheck`) survived.
2. **Remove every AI mention**: 23 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer lines were stripped from commit bodies.
3. **Single contributor**: every commit's author AND committer was rewritten to one identity (the history previously mixed several spellings of the same person's name/email). GitHub shows exactly one contributor.
4. **CI/CD kept working**: GitHub Actions and Railway both re-verified (see `docs/ci-cd.md`).

How: `git filter-branch --env-filter` (unify identity) + `--msg-filter` (delete Claude/Anthropic lines) over the local branches, with a pre-rewrite backup at **`~/lab/website-migration-backup/`** (full git bundle of all refs + rsync of the working tree) on the owner's machine. Commit trees are byte-identical to before. Only identities and message lines changed. The `dev` branch's history happened to already be fully clean and came out unchanged.

There is no repo-local git identity override; commits use whatever `user.name`/`user.email` the working copy's own git config resolves to.

## Why the git rules are strict

The owner has twice insisted, in escalating terms, that commits must not mention Claude or any AI agent: no `Co-Authored-By` trailers, no "generated with," no AI references in messages or PR descriptions. This is a hard rule (they had the entire history rewritten over it). Commit messages should read as ordinary human engineering notes: plain prose, what changed and why.

Other standing rules:

- **Granular commits**: one discrete working change per commit; push immediately after each commit (to the feature branch, see below for why it's no longer `origin main` directly): the owner wants a large, granular history, not a few big batched commits.
- Only commit when the user has asked or it's clearly part of the ongoing task they're driving.
- Do not push new commits to the `legacy` remote: it's a frozen backup.

### `main` requires a PR: for everyone, including the owner/agent

`main` has a branch-protection ruleset requiring a PR + every required check to merge. Nobody can push to `main` directly, because the ruleset has no bypass for a push. **As of 2026-09-15 the established practice is also to use a pull request for every change.** The owner explicitly moved the owner/agent workflow to the same branch → PR path external contributors use (see `CONTRIBUTING.md`), just without needing a fork. A prior version of this doc described the owner/agent as keeping a direct-`git push origin main` workflow; that's stale: don't attempt a direct push to `main` on the strength of that old claim. In practice, every single change across many sessions since (dozens of PRs, up through #49 as of this writing) has gone through branch → commit → push → open PR → wait for every check green → confirm `CLEAN`/`MERGEABLE` → merge with a merge commit, with **no exceptions for size**: even a one-line README fix or a docs-only change goes through the full flow.

Still unchanged: **granular commits** (one discrete working change per commit, push immediately after each). The older rule that a PR was merged only through the `/merge` comment, on the owner's explicit request, was retired on 2026-11-13 together with the custom automation.

## Known loose ends

- `apps/web/public/logo/` (department logos: `curriculum.svg`, `hr.svg`, `infra.svg`, `media.svg`, `pr.svg`, `rnd.svg`) is **untracked** and has been deliberately left alone through past work. Ask before committing it.
- `.env` is local-only (gitignored); `.env.example` documents the docker-compose surface.
- `apps/web/src/components/admin/member-cms-studio.tsx` renders its sidebar preview and its main editor panel each as one giant `section === "x" ? (...) : section === "y" ? (...) : ...` ternary chain (~10 branches apiece). The two points where the "contact" branch was added are nested ternaries (`typescript:S3358`, extract the nested ternary operation into an independent statement). They were left as they are for now, because fixing it properly means restructuring both chains (for example, to a switch or a lookup-by-section map), which is a real refactor of shared admin-studio code and not a one-line fix. It is out of scope for whatever PR happens to be the next one to touch a `section === ...` branch. Whoever adds the next section (or has spare time) should do that refactor.
- The 2026-09-12 session added four post-migration commits to `main`: `workflow_dispatch` triggers on both workflows, `pnpm/action-setup@v6` bump, the `ci.yml` → `ci.yaml` rename (which fixed push-triggered Actions, see `docs/ci-cd.md`), and this documentation set.
