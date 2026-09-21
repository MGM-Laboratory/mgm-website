# Security Policy

## Supported scope

`MGM-Laboratory/mgm-website` is the only actively developed repository for the MGM Laboratory site (web + API). `mgm-website-legacy` is a frozen, read-only backup and is not in scope for security reports.

## Reporting a vulnerability

If you find a security issue, such as an auth bypass, data exposure, injection vector, or anything that could compromise the production site or its data, please **do not open a public issue**.

Instead, email **hi@labmgm.org** with:

- A description of the issue and its impact.
- Steps to reproduce (or a proof of concept).
- Any relevant logs, requests, or screenshots.

You can expect an initial response within a few business days. We'll keep you updated as the issue is triaged and fixed, and we're happy to credit reporters who want it once a fix has shipped.

## Scope notes

- The production deployment (`web-production-589d3f.up.railway.app` and its API) is in scope.
- Automated scanning that could degrade production availability (load testing, aggressive fuzzing against the live site) is **not** authorized. Use a local `docker compose up` stack instead.
- Findings from the automated tooling in this repo (CodeQL, dependency review, secret scanning, Trivy, OSSF Scorecard) are triaged the same way as external reports.
