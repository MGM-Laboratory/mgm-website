# Security

This page describes what the web app and the API protect, who they protect it from and which controls exist in the code. Each statement was checked against the code. To report a problem, follow [SECURITY.md](../SECURITY.md).

## What is protected

- The admin passphrase and the accounts of delegated editors.
- The personal data that visitors send, such as contact messages, job applications, event registrations and form responses. [Privacy](privacy.md) lists it.
- The files that editors and visitors upload.
- The availability of the public pages and of the public write routes.

## Who is a threat

| Actor                             | What they can try                                                      |
| --------------------------------- | ---------------------------------------------------------------------- |
| A visitor on the internet         | Guess a passphrase, flood a public route, send hostile bodies or files |
| A delegated editor                | Use a page or an action that the account does not have                 |
| A page of another site            | Make the browser of an editor send a request with the cookie           |
| Someone with a leaked link or key | Reuse a short link passphrase, a form unlock token or a storage key    |
| A supply chain attacker           | Slip a bad dependency, base image or workflow into the build           |

## Controls

### Admin access

- The environment variable `ADMIN_PASSPHRASE` is the passphrase of the superadmin. The settings loader refuses to start the API when it is empty.
- The admin login form posts to a route handler of the web app. A right passphrase writes the cookie `mgm_admin_session`. The cookie is `HttpOnly` and `SameSite=Lax`, it is `Secure` in production, and it lives for 12 hours. A browser does not send a `Lax` cookie on a cross-site POST, PUT or DELETE request.
- The cookie holds the account id, a session version, the issue time and an HMAC-SHA256 signature. The key of the HMAC is `ADMIN_PASSPHRASE`. The signature is compared in constant time. The cookie is not a copy of the passphrase.
- A delegated editor has a passphrase that is stored as a scrypt hash with a random 16 byte salt (`N` 16384, `r` 8, `p` 1, 64 byte key) and compared in constant time. A generated passphrase has 18 random bytes and is shown once.
- The web app checks a delegated session against the API on every request. It checks the active flag, the expiry and the session version. Every update of an account raises its session version, so the old cookie stops working at once. A superadmin session is trusted from the signed cookie alone.
- Every route handler under `/api/admin/**` runs a permission gate before it forwards the request. The gate answers 401 without a session and 403 without the permission for the page and the action. Only the superadmin can manage admin accounts. The permission pages are listed in [CMS and admin workspace](cms-admin.md).
- The web app adds the header `x-cms-passphrase` on the server side when it calls the API. The browser never sees the passphrase.
- Every admin route of the API compares the header `x-cms-passphrase` with `ADMIN_PASSPHRASE` in constant time and answers 401 when it differs.

### Public routes and rate limits

- The API registers the Nest throttler as a global guard. The default budget is `THROTTLE_LIMIT` requests (default 100) in `THROTTLE_TTL` milliseconds (default 60000) for each client address.
- Three public write routes have a budget of 5 requests a minute, namely the contact message, the job application and the event registration.
- The public form routes have a budget for each visitor and not for the web server. The limits for each minute are 10 for an unlock, 120 for events, 30 for uploads and 10 for responses. The API trusts the forwarded visitor address only when the request carries the admin passphrase.
- The admin routes of the forms workspace skip the global budget when the request carries the right passphrase. A wrong or missing passphrase stays under the budget.
- The media redirect routes skip the budget, and they accept only keys that match a fixed pattern. The public read routes of the link shortener and of the forms skip it too, because the web server calls them for every page render and every click.
- A blocked request answers 429 with the header `Retry-After`. [Errors](errors.md) lists the bodies.

### Request hardening

- The API uses `helmet` with its default headers and `compression`.
- CORS allows the origins in `CORS_ORIGIN`, a comma separated list, with credentials.
- Every body is validated with a zod schema before the code uses it. The shared schemas live in `packages/shared`.
- The API refuses a body above its limit. The JSON limit is 8 MB, and the form design media route takes 9 MB. The other limits are in the table under Uploads.
- Contact messages are HTML escaped before they go into the notification mail.
- The form rich text is rebuilt from a list of known nodes and marks. The public page renders it node by node, and the code stores no HTML string.
- A form pattern is a format mask that the code checks character by character, and it is never a regular expression. This stops an editor from running a slow expression against visitor input.
- The web app sets no content security policy in its own code. Headers that the platform in front of the site adds are outside this repository.

### Uploads

| Upload                                   | Limit                                                                   | Check                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publication paper (PDF)                  | `CMS_MAX_PAPER_BYTES`, default 200 MB                                   | The bytes start with `%PDF-`                                                                                                                                |
| Project, home and form video             | `CMS_MAX_VIDEO_BYTES`, default 500 MB                                   | The type is MP4 or WebM, and the first bytes match the container                                                                                            |
| Job application CV                       | `CMS_MAX_CV_BYTES`, default 100 MB                                      | The declared type is PDF, DOC or DOCX                                                                                                                       |
| Contact attachment                       | 25 MB, with at most 5 for each message                                  | The code stores any file type                                                                                                                               |
| Form respondent file                     | `FORMS_MAX_UPLOAD_BYTES`, default 100 MB, and the limit of the question | The question lists the accepted types. Images are checked by their bytes (PNG, JPEG, WebP or GIF)                                                           |
| Editor images (covers, portraits, media) | 6 MB after compression                                                  | The data URL type must be PNG, JPEG or WebP. Author and contributor portraits are decoded and converted to WebP, and form images are checked by their bytes |

- A form respondent upload needs a declared size. The API answers 411 without one and 413 above the limit. At most 6 upload bodies are held in memory at once, and further requests get 503 with `Retry-After`.
- Storage keys are minted by the API with a random UUID. A key must match a fixed pattern before the API signs a download for it.
- The API serves files by a redirect to a signed download URL. The lifetime is 15 minutes for most files, one hour for papers and 7 days for the attachment links in the contact notification mail.
- A publication paper is served only when its record says that the paper is visible. A draft or a hidden paper answers 404 even when its key is known.
- A respondent upload is served only through the admin route of the forms workspace. A respondent upload that no response claims is swept after one day, when the next upload to the same form runs the cleanup.
- Deleting a form, a job application, a project or a publication also deletes its stored files.
- The code does not scan uploaded files for malware.

### Link shortener

- A link target must be an `http` or `https` URL of at most 2000 characters.
- The health check of a target refuses private and reserved addresses. The API resolves the host name itself and checks every address at connection time, so a DNS answer cannot change the target between the check and the connection.
- The passphrase of a link is stored as a scrypt hash with a random salt. The gate page is the only place that asks for it.
- A link with the "once" expiry counts its click in an atomic update, so two parallel clicks cannot both succeed.
- A custom domain serves links only after its TXT record and a marker probe prove that it points at the site.

### Forms

- A form with a passphrase answers visitors with a locked state until they unlock it. A right passphrase returns a token and sets the cookie `mgm_form_<slug>`. The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production and valid for 12 hours.
- The token is an HMAC-SHA256 signature over the form id, the expiry and the stored passphrase hash. Changing or removing the passphrase invalidates every token.
- Drafts answer 404 on the public routes. The schedule, the response limit and the rule of one response for each device are checked by the API, and not only by the page.
- The API takes a form submission under a database advisory lock for that form, so parallel submissions cannot go past the response limit.
- A filled honeypot input, or a submission that arrives faster than the minimum time of the form, is stored but marked as spam, and it sends no mail.

### Secrets and configuration

- The API reads its settings from environment variables and validates them with a zod schema at start. The repository holds `.env.example` with placeholders and no real secret.
- Set `ADMIN_PASSPHRASE` to a long random value in every real deployment. The settings loader checks only that the value is not empty.
- Mail provider keys, the storage keys and the database URL are environment variables.

### Containers

- The API and web images run as a user that is not root (`nestjs` and `nextjs`).
- The API image has a health check that calls `/api/health`.
- The route `/api/health` runs `SELECT 1` and answers 503 when the database does not respond.

## What CI scans

[CI/CD](ci-cd.md) describes each workflow. The security related checks are the following.

| Check             | What it covers                                                        |
| ----------------- | --------------------------------------------------------------------- |
| CodeQL            | JavaScript and TypeScript, when code changes and every week           |
| Dependency review | New dependencies with a high or critical advisory, on pull requests   |
| gitleaks          | The full history for secrets, on every change                         |
| Trivy             | The file system, and the built images, for critical and high findings |
| OSSF Scorecard    | The repository posture, every week                                    |
| Image publishing  | An SBOM attestation and a keyless cosign signature for each image     |
| Renovate          | Dependency updates, and updates for known vulnerabilities at any time |

Every action in a workflow is pinned to a full commit SHA.

## Limits of the design

- The admin workspace has one shared credential model. The permissions of a delegated editor are enforced by the web app. The API checks only the shared passphrase, so anyone who holds that passphrase has every permission, and the API must be reachable only through trusted callers where that matters.
- There is no account lockout and no second factor for the admin workspace. The login relies on the rate limits and on the strength of the passphrase.
- The rate limit counters live in the memory of each API process. Each copy of the API counts on its own, and a restart empties the counters.
- The rate limit tracks the client address that Express reports. A deployment that sits behind a proxy has to make sure that this address is the address of the client.
- A superadmin session is valid until its cookie expires. Changing `ADMIN_PASSPHRASE` ends every admin session at once, because it is also the signing key of the cookie.
- The web app sets no content security policy of its own.
- Uploaded files are stored as sent, within the checks above, and are not scanned.
- The code keeps contact messages, applications, registrations, form responses and visit logs until an editor deletes them. [Privacy](privacy.md) has the details.
- Nobody outside the maintainers has audited the code, and the automated scans find only known classes of faults.
