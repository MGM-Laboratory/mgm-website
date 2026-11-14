# Mail System

The API sends transactional email (contact-form admin notifications + visitor confirmations, event/job-application confirmations) through a single abstraction, `apps/api/src/mail/mail.service.ts`, that can route across **three providers**: Resend's REST API, SMTP (nodemailer), and AWS SES, with configurable failover/load-balancing and per-provider quota accounting. Admins configure routing from the CMS; nothing about provider choice is hardcoded per call site.

## ⚠️ Some hosts block outbound SMTP

**Before reaching for the SMTP provider, check that the deployment allows outbound SMTP.** Some hosts and cloud plans disable it entirely to prevent spam and abuse. This is not a code or config problem, and no host, port or TLS combination fixes it. Choose the provider to match what the deployment allows.

Resend's REST API (the `resend` provider below) and SES use HTTPS, so a host that blocks SMTP does not affect them. SMTP is still fully implemented and configurable, which is useful for local dev, Docker Compose, or any host that allows it.

To check a host, run a raw TCP probe from the `api` container to the SMTP server on all four standard SMTP ports (25, 465, 587 and 2525). A timeout on every port means the host blocks outbound SMTP. A probe of `smtp.resend.com` on the previous host (2026-09-19) timed out on all four ports, which is why the `resend` provider was the one that worked there.

## Providers

Configured (or not) purely by which env vars are present. Nothing needs to be "enabled" separately:

| Provider | Configured when                                                                                                                                  | Env vars                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resend` | `RESEND_API_KEY` is set                                                                                                                          | `RESEND_API_KEY`                                                                                                                                                                     |
| `smtp`   | `SMTP_HOST` is set                                                                                                                               | `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASSWORD` (both optional as a pair, omitting either makes the transport unauthenticated), `SMTP_SECURE` (default `false`) |
| `ses`    | always "configured" (the AWS SDK client is constructed unconditionally, relying on its default credential chain, so an explicit key is optional) | `AWS_REGION` (default `us-east-1`), `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (optional)                                                                                           |

**Shared sender identity**: `SES_FROM_EMAIL` (must be a bare, valid email, since some code paths pass it straight to SES's raw `Source` field) is the address every provider sends from. `MAIL_FROM_NAME`, if also set, is combined as `"${MAIL_FROM_NAME} <${SES_FROM_EMAIL}>"`, a single computed `from` string shared by all three providers' send calls. Neither var is required; with `SES_FROM_EMAIL` unset, `sendEmail()` throws immediately ("SES_FROM_EMAIL is not configured").

**No mail var is required at boot.** Every one is optional in `env.validation.ts`. The app starts fine with zero providers configured; `sendEmail()` only fails at the moment something actually tries to send ("No mail provider is available").

## Routing strategies (`MailStrategy`, `packages/shared/src/schemas/contact.ts`)

`MAIL_STRATEGIES = ["resend", "smtp", "ses", "failover", "loadBalanceEqual", "loadBalanceWeighted", "loadBalanceLimit"]`

- **A bare provider id** (`"resend"`/`"smtp"`/`"ses"`): pins to exactly that provider; fails loudly (no fallback) if it isn't configured.
- **`failover`** (the default): tries `mailProviderOrder` in sequence, first success wins.
- **`loadBalanceEqual`**: round-robins via a DB-backed counter (`MailRoutingState`, key `"roundRobin"`), still falls over to the next provider in rotated order if the picked one throws.
- **`loadBalanceWeighted`**: weighted-random pick using `mailProviderWeights[id] ?? 1`, picked provider first, rest as fallback order.
- **`loadBalanceLimit`**: same candidate order as failover, but reserves quota immediately before each delivery attempt (skips a candidate whose reservation fails rather than trying to send anyway).

`mailProviderOrder` defaults to `["resend", "smtp", "ses"]` when a caller doesn't override it.

Only the superadmin changes the routing. A save by another admin keeps the stored strategy, order, weights and limits, because the web server adds them to the request before it reaches the API, which would otherwise fill the missing fields with their defaults (the strategy `failover`, the order `resend`, `smtp`, `ses`, and empty weights and limits). A save that tries to change one of them answers 403. A save answers 502 when the web server cannot read the stored settings first.

## Outbox (`apps/api/src/mail/mail-outbox.service.ts`)

The notification mail of the contact form goes through the table `MailOutbox`, so an outage of every provider does not lose it. The visitor never waits for it, and no failure of a provider reaches them. The inquiry is stored first, then the mail is queued, and one run of the outbox starts at once. If the queue itself cannot be written, the failure is logged and the inquiry still shows in the inbox of the admin workspace.

- A run claims one due row at a time, up to 10 for each run, with `FOR UPDATE SKIP LOCKED`, and gives it a lease of 5 minutes on the clock of the database. The longest send is far below the lease, so the two API copies do not send the same row at the same time. A copy that dies during a send leaves its row to the next claim after the lease.
- A row is deleted when its mail is sent. When the mail was sent and only the delete failed, the row gets the status `sent` and is deleted after one day, and the mail is not sent again. A copy that stops waits up to 25 seconds for a send that is running. A mail that fails is tried again after 1, 5, 30, 120, 360 and then 720 minutes. After 8 attempts the row gets the status `failed` and stays for 30 days, with the last error text, and it is not tried again.
- Every API copy runs the outbox once a minute. A mail waits for the first run after its time, so a retry can be late by up to a minute.
- A send that timed out may have been delivered, so a retry can deliver a second copy. The confirmation mail to the visitor does not use the outbox, and a failure of it is only logged.

## Timeouts

Each provider has a limit, so a provider that goes silent hands the message to the next one. SES makes one attempt, because the failover is the retry, and gives up after 10 seconds without a connection and after 30 seconds without data. SMTP gives up after 10 seconds without a connection, 10 seconds without the greeting of the server and 30 seconds without data, and the lookup of the host name has its own limit of 30 seconds. The Resend client cannot be aborted, so the call is dropped after 30 seconds and the next provider takes over.

A timeout means that the outcome is unknown. The provider may have accepted the message before the answer was lost, so any provider that times out can cause a second copy through the next one. With the strategy `loadBalanceLimit`, a send that timed out keeps its quota reservation, so a provider that did not deliver is counted one send too high, which is the safe side of a limit.

## Quota accounting (`MailProviderLimitConfig`)

Optional per-provider `dailyLimit`/`longLimit` (`longPeriod: "monthly" | "30day"`), two window modes:

- **`calendar`** (default): a `MailProviderUsage` row per provider with `dailyRemaining`/`longRemaining` counters, reset at UTC midnight (daily) or the UTC month boundary / now+30 days (`longPeriod`-dependent). Reservation is an atomic decrement guarded by `remaining > 0`; a failed send releases the reservation back, matched to the same reset boundary it was taken against (so a reset mid-flight can't wrongly restore capacity into a new window).
- **`rolling`**: no stored counters; remaining is computed live by counting `MailSendLog` rows within the trailing window, serialized per-provider with a Postgres advisory lock (`pg_advisory_xact_lock`) so the check-and-insert is one atomic step.

Both modes are pure overhead-avoidance when unset (the default): no limit configured means no accounting at all. **Known, documented gap**: usage is recorded as exactly 1 unit per `sendEmail()` call regardless of how many addresses are in `to`, so a per-recipient-billed provider (SES/Resend) can exhaust its real allowance faster than a configured limit implies. Not fixed, and only matters once a limit is actually set.

## Admin surface (`apps/api/src/cms/cms-contact-settings.*`)

Singleton settings row (`CmsContactSettings`, fixed slug `"contact"`), cached for 600 seconds, normalized through `contactSettingsSchema` on every read (falls back to `DEFAULT_CONTACT_SETTINGS` wholesale if the stored record fails validation):

- `GET /api/cms/contact-settings`: admin (`x-cms-passphrase`). The contact page reads it through the web server, which sends the passphrase on every call, and gives the browser only the first email, the address and the map position. Returns `{ record }`: `emails[]`, `address`, `lat`/`lng`, `mailStrategy`, `mailProviderOrder`, `mailProviderWeights`, `mailProviderLimits`.
- `GET /api/cms/contact-settings/mail-provider-status`: admin (`x-cms-passphrase`). Returns `{configured, dailyRemaining?, longRemaining?, ...}` per provider plus `fromEmailConfigured`, never credentials, and limits come from the saved settings server-side (not caller input).
- `PUT /api/cms/contact-settings`: admin. `contactSettingsSchema.parse(body)`, then saved (invalidates the cache).

`DEFAULT_CONTACT_SETTINGS`: `emails: ["hi@labmgm.org"]`, the FILKOM UB address/coordinates, `mailStrategy: "failover"`, `mailProviderOrder: ["resend","smtp","ses"]`.

## Contact form flow (`apps/api/src/contact/contact.service.ts`)

`POST /api/contact` (throttled 5/min, tighter than the app default, since every submission also emails the _visitor's own_ address, that is, it's a potential open relay if not rate-limited tightly):

1. **Persists the inquiry unconditionally first** (before any mail attempt): a mail-provider outage can never lose a submission, only delay its notification.
2. Builds the admin-notification HTML (with 7-day signed download links for any attachments).
3. Loads the CMS `ContactSettings` and sends the admin notification via `mail.sendEmail({ to: settings.emails, strategy: settings.mailStrategy, providerOrder: settings.mailProviderOrder, ... })`, **awaited**, so a total provider failure does surface as a 500 (the inquiry itself is already safely stored regardless).
4. Fires the visitor's confirmation email, **not awaited**; failures are logged and swallowed, since this is a courtesy, not the record of truth.

## Changing production mail config

Env vars are set in the deployment environment of the `api` container, never in the repo. The API reads them at start, so restart the container after changing any `SMTP_*`/`RESEND_API_KEY`/`SES_FROM_EMAIL`/`MAIL_FROM_NAME` var. After changing anything provider-related in production, verify with a real submission (`curl -X POST .../api/contact` with a throwaway payload) and check the container logs for `"All mail providers failed: ..."`. That exact string is the give-away that every configured candidate rejected the send.
