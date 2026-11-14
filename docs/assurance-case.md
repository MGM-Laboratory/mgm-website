# Assurance case

This page argues why the security requirements of the website are met. It names the threat model, the trust boundaries, the secure design principles that the code follows and the common weaknesses that it counters. [Security](security.md) lists each control in detail, and each claim below points to the control or to the code that backs it. To report a problem, follow [SECURITY.md](../SECURITY.md).

## Security requirements

1. Only the superadmin and the delegated editors with the right permission can change content or read stored visitor data.
2. Data that a visitor sends is validated, stored without running as code and shown without running as code.
3. Files that people upload are limited in size and type, and are served only when the record allows it.
4. The public pages and the public write routes stay available when one client sends too much.
5. A secret never reaches the browser, the repository or the logs.
6. A release is built from reviewed code, and its image can be traced to that build.

## Threat model

The actors are the same as in [Security](security.md#who-is-a-threat). They are a visitor on the internet, a delegated editor, a page of another site, someone with a leaked link or key, and a supply chain attacker. The assets are the admin passphrase and sessions, the personal data of visitors, the uploaded files and the availability of the public routes.

The model has these limits. It assumes that the host, the database, the object storage and the account of the maintainers are not compromised. It does not defend against a maintainer who is malicious. [Security](security.md#limits-of-the-design) lists what the design does not cover.

## Trust boundaries

| Boundary                                  | What crosses it                                           | What guards it                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Browser to the web app                    | Page requests, the admin login, the session cookie        | A signed `HttpOnly` cookie, `SameSite=Lax`, a permission gate on every admin route handler, rate limits on sign in  |
| Browser to the API (public routes)        | Contact messages, applications, registrations, form data  | A zod schema for every body, the throttler, size limits, honeypot and minimum time checks on forms                  |
| Web app to the API                        | Admin calls with the header `x-cms-passphrase`            | The header is added on the server side, the API compares it in constant time, and answers 401 when it differs       |
| API to the database                       | Queries and one boot time schema step                     | Prisma with parameters, advisory locks for races, and only the database role of the app                             |
| API to object storage and the mail sender | Uploads, signed download links, outgoing mail             | Storage keys that the API mints, short lived signed links, HTML escaped mail bodies                                 |
| API to a target of a short link           | A health check request to a host that an editor typed     | The API resolves the host itself and refuses private and reserved addresses at connection time                      |
| The build to the running image            | Source, dependencies, base image, workflow files          | Pull request review, pinned actions and digest pinned base images, dependency review, CodeQL, gitleaks, Trivy, SBOM and signed images  |

## Secure design principles

| Principle                | How the code applies it                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Economy of mechanism     | One shared schema package (`packages/shared`) defines every body, so the web app and the API validate with the same rules. One permission gate covers every admin route handler.                                  |
| Fail safe defaults       | The API refuses to start without `ADMIN_PASSPHRASE`, and the web sign in answers 503 without `SESSION_SECRET`. A draft form, a hidden paper and a form without a valid token answer 404 or 401 and never open.   |
| Complete mediation       | The web app checks a delegated session against the API on every request. Every admin route of the API compares the passphrase. Raising the session version of an account ends its old cookies at once.           |
| Open design              | The source, the controls and the limits are public. No control depends on a secret algorithm. The keys are the secrets.                                                                                           |
| Separation of privilege  | The cookie signing key (`SESSION_SECRET`) is not the passphrase. A delegated editor holds only the pages and actions that were granted to the account. Only the superadmin manages admin accounts.    |
| Least privilege          | The containers run as a user that is not root. The admin passphrase stays on the server side. A CI job declares the permissions that it needs, and the default token of Actions is read only.                                 |
| Least common mechanism   | The form unlock token is signed over the stored passphrase hash of that form, so a token of one form does not open another. A short link passphrase is a separate hash from the admin passphrases.                |
| Psychological acceptability | The admin login is one passphrase field. A generated passphrase for an editor is shown once. Error answers have one documented body shape in [Errors](errors.md).                                              |

## Common weaknesses and how they are countered

| Weakness                         | Counter                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection                    | The API reads and writes through Prisma, which sends values as parameters. Raw SQL is written as tagged templates. The two places that send raw text (the boot schema step and a `SET LOCAL` time limit) send constants that the code owns and no visitor input. |
| Cross site scripting             | Contact messages are HTML escaped before they go into mail. The form rich text is rebuilt from known nodes and marks and rendered node by node. The code stores no HTML string and uses no `dangerouslySetInnerHTML`. Member profile links must start with an allowed scheme. |
| Cross site request forgery       | The session cookie is `SameSite=Lax`, so a browser does not send it on a cross site POST, PUT or DELETE. The API call from the web app needs a header that only the server side holds.                                                          |
| Broken authentication            | Passphrases of editors are stored as scrypt hashes with a random salt and compared in constant time. The cookie carries an HMAC signature that is compared in constant time. The login is rate limited for each visitor.                         |
| Broken access control            | The permission gate answers 401 without a session and 403 without the permission for the page and the action. A paper is served only when its record says that it is visible.                                                                   |
| Server side request forgery      | The health check of a short link target resolves the host itself and checks every address when it connects, so a changed DNS answer cannot redirect the request to a private address.                                                            |
| Unrestricted file upload         | Each upload has a size limit and a type check, and some check the first bytes. Contact attachments of a risky type are stored as plain bytes. Storage keys are random UUIDs that the API mints. The code does not scan files for malware.        |
| Denial of service                | A global throttler, tighter budgets for the public write routes, size limits that answer 413 while the body arrives, and a cap on upload bodies held in memory (503 with `Retry-After` above it).                                                |
| Race conditions                  | A form submission takes a database advisory lock for that form, so parallel submissions cannot pass the response limit. A save of a record carries the version that the editor loaded, and a stale save answers 409.                           |
| Sensitive data exposure          | Secrets are environment variables that a zod schema validates at start. The repository holds placeholders only, and gitleaks scans the full history. The access log line of the CSP report route leaves out the query string.                   |
| Vulnerable dependencies          | Renovate updates dependencies, dependency review blocks a new high or critical advisory on a pull request, and Trivy and CodeQL scan the code and the images. Every workflow action is pinned to a full commit SHA, and the base image of both Dockerfiles is pinned by digest.                              |
| Insecure transport               | The session cookie is `Secure` in production. The TLS endpoint is a proxy that is outside this repository.                                                                                                                                      |

## Where the argument is weaker

The case has gaps, and the gaps are the ones that [Security](security.md#limits-of-the-design) already states. There is no account lockout and no second factor. The API trusts the shared passphrase, so the permissions of a delegated editor are enforced by the web app. Rate limit counters live in the memory of each API process. The content security policy is report only for now. Uploaded files are not scanned.

## Keeping the case current

- A pull request that changes a control updates [Security](security.md) and this page in the same change.
- A review of such a pull request checks each claim here against the code, as the review agent does for any docs change.
- Tool findings from CodeQL, Trivy, gitleaks and Scorecard are triaged like external reports, as [SECURITY.md](../SECURITY.md) says.
