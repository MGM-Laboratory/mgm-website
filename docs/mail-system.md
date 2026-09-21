# Mail System

The API sends transactional email (contact-form admin notifications + visitor confirmations, event/job-application confirmations) through a single abstraction, `apps/api/src/mail/mail.service.ts`, that can route across **three providers**: Resend's REST API, SMTP (nodemailer), and AWS SES, with configurable failover/load-balancing and per-provider quota accounting. Admins configure routing from the CMS; nothing about provider choice is hardcoded per call site.

## ⚠️ Railway blocks outbound SMTP below the Pro plan

**Before reaching for the SMTP provider on this deployment: Railway disables outbound SMTP entirely on Free/Trial/Hobby plans. It only works on Pro and above.** This is not a code or config problem; no host/port/TLS combination fixes it.

Confirmed directly (2026-09-19): SSH'd into the production `api` container and probed raw TCP connectivity to `smtp.resend.com` on all four standard SMTP ports: 25, 465, 587, and 2525. Every one timed out. Railway's own docs (`docs.railway.com/networking/outbound-networking`) state this explicitly: _"SMTP is disabled on \[Free/Trial/Hobby] plans to prevent spam and abuse"_ and recommend an HTTPS-API transactional email service instead: Resend is literally their top recommendation. If this project is ever moved to a Pro plan and SMTP is wanted again, the debug recipe is in that same doc (SSH in, probe all four ports, compare against Railway's own IPs).

**Practical upshot:** Resend's REST API (the `resend` provider below) is the one that actually works on this deployment. SMTP is still fully implemented and configurable (useful for local dev, Docker Compose, or a future Pro-plan deployment). Just don't expect it to work in production without a plan upgrade.

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

## Quota accounting (`MailProviderLimitConfig`)

Optional per-provider `dailyLimit`/`longLimit` (`longPeriod: "monthly" | "30day"`), two window modes:

- **`calendar`** (default): a `MailProviderUsage` row per provider with `dailyRemaining`/`longRemaining` counters, reset at UTC midnight (daily) or the UTC month boundary / now+30 days (`longPeriod`-dependent). Reservation is an atomic decrement guarded by `remaining > 0`; a failed send releases the reservation back, matched to the same reset boundary it was taken against (so a reset mid-flight can't wrongly restore capacity into a new window).
- **`rolling`**: no stored counters; remaining is computed live by counting `MailSendLog` rows within the trailing window, serialized per-provider with a Postgres advisory lock (`pg_advisory_xact_lock`) so the check-and-insert is one atomic step.

Both modes are pure overhead-avoidance when unset (the default): no limit configured means no accounting at all. **Known, documented gap**: usage is recorded as exactly 1 unit per `sendEmail()` call regardless of how many addresses are in `to`, so a per-recipient-billed provider (SES/Resend) can exhaust its real allowance faster than a configured limit implies. Not fixed, and only matters once a limit is actually set.

## Admin surface (`apps/api/src/cms/cms-contact-settings.*`)

Singleton settings row (`CmsContactSettings`, fixed slug `"contact"`), cached 600s, normalized through `contactSettingsSchema` on every read (falls back to `DEFAULT_CONTACT_SETTINGS` wholesale if the stored record fails validation):

- `GET /api/cms/contact-settings`: public, no auth. Returns `{ record }`: `emails[]`, `address`, `lat`/`lng`, `mailStrategy`, `mailProviderOrder`, `mailProviderWeights`, `mailProviderLimits`.
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

Env vars are Railway service variables on `api` (`mcp__railway__set-variables` or the dashboard), never in the repo. Setting any `SMTP_*`/`RESEND_API_KEY`/`SES_FROM_EMAIL`/`MAIL_FROM_NAME` var triggers an automatic redeploy. After changing anything provider-related in production, verify with a real submission (`curl -X POST .../api/contact` with a throwaway payload) and check the deploy's logs for `"All mail providers failed: ..."`. That exact string is the give-away that every configured candidate rejected the send.
