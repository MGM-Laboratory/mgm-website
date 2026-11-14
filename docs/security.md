# Security

This page describes what the web app and the API protect, who they protect it from and which controls exist in the code. Each statement was checked against the code. To report a problem, follow [SECURITY.md](../SECURITY.md).

## What is protected

- The admin passphrase and the accounts of delegated editors.
- The personal data that visitors send, such as contact messages, job applications, event registrations and form responses. [Privacy](privacy.md) lists it.
- The files that editors and visitors upload.
- The availability of the public pages and of the public write routes.

## Who is a threat

| Actor                             | What they can try                                                   |
| --------------------------------- | ------------------------------------------------------------------- |
| A visitor on the internet         | Try passphrases, flood a public route, send hostile bodies or files |
| A delegated editor                | Use a page or an action that the account does not have              |
| A page of another site            | Make the browser of an editor send a request with the cookie        |
| Someone with a leaked link or key | Reuse a short link passphrase, a form unlock token or a storage key |
| A supply chain attacker           | Slip a bad dependency, base image or workflow into the build        |

## Controls

### Admin access

- The environment variable `ADMIN_PASSPHRASE` is the passphrase of the superadmin. The settings loader refuses to start the API when it is empty.
- The admin login form posts to a route handler of the web app. A right passphrase writes the cookie `mgm_admin_session`. The cookie is `HttpOnly` and `SameSite=Lax`, it is `Secure` in production, and it lives for 12 hours. A browser does not send a `Lax` cookie on a cross-site POST, PUT or DELETE request.
- The cookie holds the account id, a session version, the issue time and an HMAC-SHA256 signature. The key of the HMAC is `SESSION_SECRET`, a value of its own with at least 32 characters, and not the passphrase. The web app closes the sign in with a 503 when the secret is missing. The signature is compared in constant time. The cookie is not a copy of the passphrase.
- A delegated editor has a passphrase that is stored as a scrypt hash with a random 16 byte salt (`N` 16384, `r` 8, `p` 1, 64 byte key) and compared in constant time. A generated passphrase has 18 random bytes and is shown once.
- The web app checks a delegated session against the API on every request. It checks the active flag, the expiry and the session version. Every update of an account raises its session version, so the old cookie stops working at once. A superadmin session is trusted from the signed cookie alone.
- The route handlers under `/api/admin/**` run a permission gate before they forward a request. The login, logout and `me` routes handle the session themselves and are the only ones without that gate. The gate answers 401 without a session and 403 without the permission for the page and the action. Only the superadmin can manage admin accounts. The permission pages are listed in [CMS and admin workspace](cms-admin.md).
- The web app adds the header `x-cms-passphrase` on the server side when it calls the API. The browser never sees the passphrase.
- Every admin route of the API compares the header `x-cms-passphrase` with `ADMIN_PASSPHRASE` in constant time and answers 401 when it differs.

### Public routes and rate limits

- The API registers the Nest throttler as a global guard. The default budget is `THROTTLE_LIMIT` requests (default 100) in `THROTTLE_TTL` milliseconds (default 60000) for each route and each client. The client is the visitor address that the web server forwards when the request carries the admin passphrase, and the address of the peer otherwise.
- Three public write routes have a budget of 5 requests a minute, namely the contact message, the job application and the event registration.
- The public admin check `POST /api/cms/admins/verify` has a budget of 10 requests a minute for each visitor, because each try costs one password hash for every active account. The web sign in route also allows 10 sign in attempts a minute for each visitor, for the superadmin passphrase and for the delegated accounts, and sends the visitor back to the login page with a message from the eleventh. A right passphrase gives its attempt back, and a visitor who is over the limit is refused even with the right one. An IPv6 visitor counts under its /64 prefix, here and for the other limits of the API that count per visitor. That counter lives in the memory of each web copy.
- The public form routes have a budget for each visitor and not for the web server. The limits for each minute are 10 for an unlock, 120 for events, 30 for uploads and 10 for responses. For these form routes, the API uses the forwarded visitor address only when the request carries the admin passphrase.
- The admin routes of the forms workspace skip the global budget when the request carries the right passphrase. A wrong or missing passphrase stays under the budget.
- Most media redirect routes skip the budget, and so does the list of short link hosts. The short link routes `resolve` and `public/:slug` allow 300 requests a minute for each visitor, because every click writes a visit row. The public read routes of the forms skip the budget, because the web server calls them for every page render.
- A blocked request answers 429 with the header `Retry-After`. [Errors](errors.md) lists the bodies.

### Request hardening

- The API uses `helmet` with its default headers and `compression`.
- The production build of the web app sends a `Content-Security-Policy-Report-Only` header on every page. It blocks nothing. The browser reports each source that the policy would refuse to `/api/csp-report`, which writes one log line for each report with the page, the blocked source and the directive, without the query string. The route reads at most 8 KB of a body, whether or not the caller declares a length, and writes at most 60 lines a minute for each web process. The policy leaves out `frame-ancestors` and `form-action` for now, because the public forms are meant to be embedded on other sites and the short link gate is answered with a redirect to another site. Both are decided before the policy is enforced. The list in `apps/web/next.config.ts` is read against these reports and tightened before it becomes an enforced `Content-Security-Policy` header.
- CORS allows the origins in `CORS_ORIGIN`, a comma separated list, with credentials. Spaces around an entry and empty entries are ignored.
- Every body is validated with a zod schema before the code uses it. The shared schemas live in `packages/shared`.
- The API refuses a body above its limit. The JSON limit is 8 MB, and the form design media route takes 9 MB. The other limits are in the table under Uploads.
- Contact messages are HTML escaped before they go into the notification mail.
- The form rich text is rebuilt from a list of known nodes and marks. The public page renders it node by node, and the code stores no HTML string.
- A form pattern is a format mask that the code checks character by character, and it is never a regular expression. This stops an editor from running a slow expression against visitor input.
- The interactive API documentation is served at `/docs`, outside the `/api` prefix.
- The web app sends only the report only policy described above. Headers that the platform in front of the site adds are outside this repository.

### Uploads

| Upload                                                                       | Limit                                                                   | Check                                                                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Publication paper (PDF)                                                      | `CMS_MAX_PAPER_BYTES`, default 200 MB                                   | The bytes start with `%PDF-`                                                                            |
| Project, home and form video                                                 | `CMS_MAX_VIDEO_BYTES`, default 500 MB                                   | The type is MP4 or WebM, and the first bytes match the container                                        |
| Job application CV                                                           | `CMS_MAX_CV_BYTES`, default 100 MB                                      | The declared type is PDF, DOC or DOCX                                                                   |
| Contact attachment                                                           | 25 MB, with at most 5 for each message                                  | Any type is accepted, but a page, a script or an XML type is stored as plain bytes (`octet-stream`)     |
| Form respondent file                                                         | `FORMS_MAX_UPLOAD_BYTES`, default 100 MB, and the limit of the question | The question lists the accepted types. Images are checked by their bytes (PNG, JPEG, WebP or GIF)       |
| Article and research covers, event, job and project images, member portraits | 6 MB after compression                                                  | The data URL header must name PNG, JPEG or WebP                                                         |
| Author portraits of publications and contributor portraits of projects       | 6 MB after cropping                                                     | The data URL header must name PNG, JPEG, WebP or GIF. The API decodes the image and converts it to WebP |
| Form design images                                                           | 6 MB                                                                    | The data URL must be a base64 image, and the bytes must be PNG, JPEG, WebP or GIF                       |

- The admin uploads that arrive as raw bytes (publication papers, project videos and the home page video) are read only on their own routes, and only after the request carries the right `x-cms-passphrase`. A request without it answers 401 before the body is read. The public job application reads its CV with a size limit, so a body above `CMS_MAX_CV_BYTES` answers 413 while it arrives.
- The links of a member profile (`links[].url` and `certificates[].credentialUrl`) must start with `https://`, `http://`, `mailto:` or `tel:`, and a profile is capped at 200,000 characters of JSON. The save answers 400 with the reason for any other value, because the public member page renders the link as an `href`.
- A form respondent upload needs a declared size. The API answers 411 without one and 413 above the limit. At most 6 upload bodies are held in memory at once, and further requests get 503 with `Retry-After`.
- Storage keys are minted by the API with a random UUID.
- The media routes answer with a redirect to a signed download URL. The lifetime is 15 minutes for most files, one hour for papers and 7 days for the attachment links in the contact notification mail. These lifetimes hold when `REDIS_URL` is not set, because the cache of signed URLs is keyed by the object key alone.
- A publication paper is served only when its record says that the paper is visible. A draft or a hidden paper answers 404 even when its key is known.
- A respondent upload is served only through the admin route of the forms workspace. A respondent upload that no response claims is swept after one day, when the next upload to the same form runs the cleanup.
- Deleting a form, a job application, a project or a publication also deletes its stored files.
- The code does not scan uploaded files for malware.

### Link shortener

- A link target must be an `http` or `https` URL of at most 2000 characters.
- The health check of a target refuses the private address ranges that the code lists. The API resolves the host name itself and checks the address at connection time, so a DNS answer cannot change the target between the check and the connection.
- The passphrase of a link is stored as a scrypt hash with a random salt. The gate page is the only place that asks for it.
- A link with the "once" expiry counts its click in an atomic update, so two parallel clicks cannot both succeed.
- A custom domain serves links only after its TXT record and a marker probe prove that it points at the site.

### Forms

- A form with a passphrase answers visitors with a locked state until they unlock it. The read route answers 200 with that state, and the events, uploads and responses routes answer 401 without a valid token. A right passphrase returns a token and sets the cookie `mgm_form_<slug>`. The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production and valid for 12 hours.
- The token is an HMAC-SHA256 signature over the form id, the expiry and the stored passphrase hash. Changing or removing the passphrase invalidates every token.
- Drafts answer 404 on the public routes. The schedule, the response limit and the rule of one response for each device are checked by the API, and not only by the page.
- The API takes a form submission under a database advisory lock for that form, so parallel submissions cannot go past the response limit.
- A filled honeypot input, or a submission that arrives faster than the minimum time of the form, is stored but marked as spam, and it sends no mail.

### Secrets and configuration

- The API reads its settings from environment variables and validates them with a zod schema at start. The repository holds `.env.example` with placeholders and no real secret.
- Set `ADMIN_PASSPHRASE` and `SESSION_SECRET` to long random values in every real deployment. The settings loader checks that the passphrase is not empty and that the session secret has at least 32 characters.
- These settings hold secrets and are environment variables. `ADMIN_PASSPHRASE`, `SESSION_SECRET`, `DATABASE_URL`, `REDIS_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `SMTP_USER`, `SMTP_PASSWORD`, `DOMAIN_CONNECT_PRIVATE_KEY`, the API token for the hosting platform and `SHORTLINKS_ENCRYPTION_KEY`. The loader in `apps/api/src/config/env.validation.ts` validates them.
- `SHORTLINKS_ENCRYPTION_KEY` is validated as 64 hex characters and is listed in `.env.example`. This page makes no claim that it protects any stored value.

### Containers

- The API and web images run as a user that is not root (`nestjs` and `nextjs`).
- The API image has a health check that calls `/api/health`.
- The route `/api/health` runs `SELECT 1` and answers 503 when the database does not respond.
- The web image has a health check that calls `/healthz`. That route makes no call to the API, so a slow API does not mark a web copy as unhealthy.

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
- There is no account lockout and no second factor for the admin workspace. The login relies on the strength of the passphrase, and a generated passphrase has 18 random bytes.
- The rate limit counters live in the memory of each API process. Each copy of the API counts on its own, and a restart empties the counters.
- The rate limit tracks the visitor address that the web server forwards with the admin passphrase, and the address that Express reports for every other caller. The API trusts no proxy by default, so a browser that reaches the API through a reverse proxy, as the contact form does, shares the address of the proxy until `TRUST_PROXY` names that proxy. The setting refuses `true`, because that makes any `x-forwarded-for` believable.
- A superadmin session is valid until its cookie expires. Changing `SESSION_SECRET` ends every admin session at once, because it is the signing key of the cookie. Changing `ADMIN_PASSPHRASE` does not end a session that is already signed in, so after a suspected leak of the passphrase change `SESSION_SECRET` as well, and then the sessions that an intruder opened end too.
- The web app sends its content security policy as a report only header for now, so it blocks nothing, and the policy still allows inline scripts and styles.
- Uploaded files are stored as sent, within the checks above, and are not scanned.
- The code keeps contact messages, applications, registrations, form responses and visit logs until an editor deletes them. [Privacy](privacy.md) has the details.
- Nobody outside the maintainers has audited the code, and the automated scans find only known classes of faults.
