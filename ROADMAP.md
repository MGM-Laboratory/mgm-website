# Roadmap

The website is in maintenance. This page says what the maintainer does now. A roadmap is a plan and not a promise, and the maintainer decides the order of the work.

## What happens now

- Dependency updates. Renovate opens pull requests on a weekly schedule and at any time for a known vulnerability. The maintainer reviews them and merges the ones that pass the required checks.
- Security fixes. A report that follows [SECURITY.md](SECURITY.md) gets a fix, and the automated scans described in [docs/ci-cd.md](docs/ci-cd.md) run on every change and every week.
- Content through the CMS. Editors change articles, projects, publications, research, events, job openings, members, links and forms in the admin workspace, as [docs/cms-admin.md](docs/cms-admin.md) describes. These changes need no code change.
- Bug fixes. The maintainer fixes a bug that someone reports with the [bug report form](https://github.com/MGM-Laboratory/mgm-website/issues/new?template=bug_report.yml).
- Documentation. The pages under `docs/` follow the code, and a change to the code updates its page in the same pull request.

## The next 12 months

The maintainer plans to keep the site running and current, and to take no new direction beyond that.

- Keep the dependencies, the base images and the pnpm version current through Renovate, and keep Node current within version 22.
- Fix every security report and every confirmed bug that follows the rules above.
- Keep the documentation and the automated checks in step with the code.
- Decide larger changes through feature requests, as [GOVERNANCE.md](GOVERNANCE.md) describes.

## Not planned

- Support for older releases. Only the `main` branch is maintained, as [SUPPORT.md](SUPPORT.md) says.
- Help with running or securing your own deployment of the site.
- Work on the frozen `mgm-website-legacy` repository.

## Requests

This page lists the work that is under way and the plan for the next year. A person who wants a change to the site can open a [feature request](https://github.com/MGM-Laboratory/mgm-website/issues/new?template=feature_request.yml), and [GOVERNANCE.md](GOVERNANCE.md) explains how larger changes are decided.
