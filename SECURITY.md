# Security Policy

## Supported scope

`MGM-Laboratory/mgm-website` is the only actively developed repository for the MGM Laboratory site (web + API). It is maintained by the owner and deployed on MGM infrastructure. `mgm-website-legacy` is a frozen, read-only backup and is not in scope for security reports.

## Reporting a vulnerability

If you find a security issue, such as an auth bypass, data exposure, injection vector, or anything that could compromise the production site or its data, please **do not open a public issue**.

Instead, email **hi@labmgm.org**, or use "Report a vulnerability" in the Security tab of the repository, with:

- A description of the issue and its impact.
- Steps to reproduce (or a proof of concept).
- Any relevant logs, requests, or screenshots.

You can expect an initial response within 7 days. We'll keep you updated as the issue is triaged and fixed, and we're happy to credit reporters who want it once a fix has shipped.

## How we respond

1. The maintainer reads the report and answers the reporter within 7 days.
2. The maintainer reproduces the problem and rates its impact, and tells the reporter the result.
3. The maintainer makes the fix in a private fork of a GitHub security advisory, or in a normal pull request when the change reveals little. It passes the same checks as any other change.
4. The fix ships in a release. The release notes say that a vulnerability was fixed, without detail that helps an attacker before the users can update.
5. The maintainer asks the reporter whether they want credit, and names them in the release notes after the fix has shipped if they do.

## Scope notes

- The production deployment of the site and its API is in scope.
- Automated scanning that could degrade production availability (load testing, aggressive fuzzing against the live site) is **not** authorized. Use a local `docker compose up` stack instead.
- Findings from the automated tooling in this repo (CodeQL, dependency review, secret scanning, Trivy, OSSF Scorecard) are triaged the same way as external reports.
