# Governance

MGM Laboratory's website is currently maintained by a single maintainer, who has final say on architecture, design-system, and release decisions, and is the default reviewer for every pull request (see `.github/CODEOWNERS`).

## Decision-making

- Small fixes and clearly scoped contributions (bug fixes, docs, dependency bumps) are merged once they pass the required checks. A maintainer review isn't required, though the maintainer may still review, comment, or request changes before merging.
- Larger changes (new pages, data model changes, CI/CD or infrastructure changes) should be discussed in an issue before a PR is opened, so direction is agreed on before the work is done.
- Every change, including urgent maintainer fixes, follows the branch, pull request and required checks flow in `CONTRIBUTING.md`, and is merged with a merge commit. Only the maintainer can merge, and the pull request bypass of that rule covers the approval and the merge only. It never covers the checks, the signed commits or a direct push.

## Becoming a maintainer

There's no fixed process yet because this project is small. Consistent, high-quality contributions over time are the path; reach out at **hi@labmgm.org** if you're interested in taking on more responsibility.
