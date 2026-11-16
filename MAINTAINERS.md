# Maintainers

This file lists who looks after the website and what that person can do. [GOVERNANCE.md](GOVERNANCE.md) explains how decisions are made, and this file follows it.

| GitHub account                                 | Role                 | Looks after                                                                        |
| ---------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| [@SyafaHadyan](https://github.com/SyafaHadyan) | Owner and maintainer | Merging, releases, deployment, repository settings, secrets and security reports   |
| [@BangNopall](https://github.com/BangNopall)   | Repository admin     | Repository settings, secrets, releases and deployment, when the maintainer is away |

## What the role means

The maintainer has the final say on architecture, the design system and releases, as [GOVERNANCE.md](GOVERNANCE.md) says. The maintainer merges pull requests, runs the deployment of the Docker images that CI builds, and manages the repository settings and the secrets of the repository.

A contributor opens a pull request like anyone else. Every change to `main` goes through a pull request and passes the required checks. [CONTRIBUTING.md](CONTRIBUTING.md) lists the checks.

## Reaching the maintainer

- Use an issue for a bug or an idea. [SUPPORT.md](SUPPORT.md) says which form to use.
- Report a vulnerability by email as [SECURITY.md](SECURITY.md) describes, and never in a public issue.
- Report a barrier in the site as [ACCESSIBILITY.md](ACCESSIBILITY.md) describes.
- Send a question for the lab, or a report about behavior in the community, to **hi@labmgm.org**. The [Code of Conduct](CODE_OF_CONDUCT.md) explains what happens next.

## Continuity

The repository has two named admins, @SyafaHadyan and @BangNopall. Both can manage the repository settings, the rulesets and the secrets. The maintainer says that both have access to the accounts and credentials that the releases and the deployment need, including the container registries. The organization has four owners, so the access does not depend on one person.

The ruleset bypass team `mgm-website-maintainer` has three accounts, and both named admins are in it. A member of the team can merge a pull request without the code owner approval once the required checks pass. If the maintainer is not available, the other admin can triage issues, merge pull requests and release, and then deploy by following [docs/deployment.md](docs/deployment.md) and [docs/ci-cd.md](docs/ci-cd.md).

## Known limit

The project has one maintainer who decides, as [GOVERNANCE.md](GOVERNANCE.md) says, and a second admin who can merge and step in. That file also says that becoming a maintainer has no fixed process yet. This file changes the day a second maintainer is added.
