# Support

The website is maintained by its owner. There is no paid support and no promise of a reply time, except for vulnerability reports, which `SECURITY.md` covers. This page says where to look first and where each kind of question goes.

## Look here first

| You want to know                                                   | Read                                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| What the site is, how the repository is laid out and how to run it | [README.md](README.md) and the pages under `docs/`, starting with [docs/architecture.md](docs/architecture.md) |
| How to build, test and send a change                               | [CONTRIBUTING.md](CONTRIBUTING.md)                                                                             |
| What each workflow and required check does                         | [docs/ci-cd.md](docs/ci-cd.md)                                                                                 |
| What an API error means                                            | [docs/errors.md](docs/errors.md)                                                                               |
| What the database holds                                            | [docs/data-model.md](docs/data-model.md)                                                                       |
| What the site does to protect data                                 | [docs/security.md](docs/security.md)                                                                           |
| What personal data the site collects                               | [docs/privacy.md](docs/privacy.md)                                                                             |
| How decisions are made and who maintains the project               | [GOVERNANCE.md](GOVERNANCE.md) and [MAINTAINERS.md](MAINTAINERS.md)                                            |

## Where each question goes

- **A bug.** Open an issue with the [bug report form](https://github.com/MGM-Laboratory/mgm-website/issues/new?template=bug_report.yml). Say what happened, the steps to reproduce it, the page URL and your browser. Remove secrets and personal data from logs and screenshots.
- **An idea or a missing feature.** Open an issue with the [feature request form](https://github.com/MGM-Laboratory/mgm-website/issues/new?template=feature_request.yml). [ROADMAP.md](ROADMAP.md) says what the maintainer plans to work on.
- **A security problem.** Never open a public issue. Follow [SECURITY.md](SECURITY.md) and write to **hi@labmgm.org**.
- **A barrier for a person with a disability.** Follow [ACCESSIBILITY.md](ACCESSIBILITY.md).
- **A question for the lab.** Write to **hi@labmgm.org**.
- **A change you want to make.** Read [CONTRIBUTING.md](CONTRIBUTING.md) first. [GOVERNANCE.md](GOVERNANCE.md) says that larger changes should be discussed in an issue before a pull request is opened.

## What is not supported

Running and securing your own deployment is your responsibility, and an issue cannot replace that work. An issue is welcome when you find that the code itself has a bug. Only the `main` branch of this repository is maintained. The repository `mgm-website-legacy` is a frozen backup, as [SECURITY.md](SECURITY.md) says.
