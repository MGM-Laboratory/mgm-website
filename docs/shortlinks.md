# Short Links

The link shortener. Admins shorten long URLs behind the site's own domain (`https://labmgm.org/s/:slug`) or behind any custom domain they connect (`https://mgm.li/:slug`). A click redirects immediately, with no interstitial, no ads and no page, unless the link requires a passphrase, in which case a single branded gate page asks for it. Every hit is recorded with the visitor's IP, client and geolocation, and the admin workspace shows the analytics per link.

## Click path

Two route handlers carry the public side, both under `apps/web/src/app/`:

- `/s/[slug]/route.ts` serves the site's own links on every host the site answers on.
- `/[...slug]/route.ts` is a root catch-all that only answers paths nothing else in the app matches. That is exactly where custom short domains live: their short codes sit at the domain root, plus the `/__mgm-shortlink-verify` marker the API probes when an admin checks a domain.

There is deliberately **no `proxy.ts`**: a proxy file with a broad matcher would have forced every marketing page out of static generation. The catch-all achieves the same routing for zero cost to the pages that do match.

A click flows: browser → route handler → one API call to `/api/shortlinks/public/:slug` (which records the visit) → a 302 to the long URL. The handler returns complete standalone HTML documents for the gate and the expired/not-found pages, so the marketing site's layout, fonts bundle and scripts never load for a click. The gate's form posts back to `/s/:slug` (also on custom hosts), the handler verifies the passphrase and answers with a 302 on success or re-renders with the error on failure.

The pages follow the design tokens (`apps/web/src/lib/shortlinks-pages.ts`): light and dark via a pre-paint script that reads the same `theme` localStorage key next-themes writes, Hanken Grotesk for the heading, a corner motif as the pattern signature, and no animation at all, so reduced motion is trivially satisfied.

## Domains

`ShortLinkDomain` rows live in Postgres. The primary domain (env `SHORTLINKS_PRIMARY_DOMAIN`, `labmgm.org`) is seeded at API boot and serves links under `/s/`. Custom domains are added in the admin workspace and serve links at their root once they are connected.

- **Detection.** Adding a domain queries its nameservers. A Cloudflare nameserver marks the domain `cloudflare`, which unlocks the one-click setup. Anything else shows manual DNS instructions.
- **Routing.** Railway's edge answers 404 for unknown hosts, so a custom domain must be attached to the web service. With `RAILWAY_API_TOKEN` configured (a project token with domain permissions) the API attaches it itself through the Railway GraphQL API. The routing CNAME points at the web service's Railway domain (`SHORTLINKS_CNAME_TARGET`), plus a verification TXT when Railway returns one.
- **Cloudflare autoconfigure.** The admin pastes a Cloudflare API token (Zone · DNS · Edit). The API stores it encrypted (AES-256-GCM, key `SHORTLINKS_ENCRYPTION_KEY`) and creates the CNAME and TXT records, with `proxied: false` so Railway's own certificate serves the domain.
- **Verification.** A domain is connected when `GET https://<domain>/__mgm-shortlink-verify` answers the marker, which only happens when DNS, the Railway attachment and TLS all work end to end. The admin page's check-now button re-runs the probe and stores the result. Links on a pending domain do not resolve.
- The web app caches the custom-domain list (`/api/shortlinks/hosts`) for a minute, and the marker only answers for hosts on that list, so a probe for a random host header never succeeds.

## Links

One row per link, unique per `(domain, slug)`.

- **Short codes.** Leave the field empty and the API generates one, 4 characters from an unambiguous alphabet (no 0/O/1/l/I), retrying up to a longer length only when a length's code space looks exhausted. A custom code must match `^[a-zA-Z0-9_-]{1,64}$` and be free on the chosen domain.
- **Expiry.** Once (a single click), 24 hours, 3 days, 7 days, 30 days, or never (the default). Single-use links cap their `clickCount` atomically, so two racing clicks cannot both get through.
- **Passphrase.** Stored as a scrypt hash with a random salt (`node:crypto`, no new dependency). The gate page is the only surface that asks for it.
- **Status.** Derived per link: expired (the date passed), used up (the single click is spent), link error (the destination failed a health check), otherwise available. The health check is a HEAD request with an SSRF guard (the URL must use http or https and every resolved address must be public), refreshed lazily while the admin lists links, at most every 10 minutes per link. A failing destination never blocks the redirect itself.
- **Analytics.** Each hit writes a `ShortLinkVisit` row: a view is a gate page render (the "sees it" number), a click is an actual redirect, a wrong passphrase is a failed attempt. IP, user agent, referer and geolocation are recorded. Geolocation uses the keyless ipwho.is API, cached in-process, fired after the response so it never delays a redirect. The analytics endpoint aggregates totals, a 14-day series, countries, referrers, browsers, OSes, devices and the 50 most recent visits.
- Deleting a link cascades to its visits.

## API surface

Public (no authentication, throttled off or per-IP where noted):

| Route                              | What it does                                                  |
| ---------------------------------- | ------------------------------------------------------------- |
| `GET /api/shortlinks/hosts`        | custom domains for the web app's routing cache                |
| `GET /api/shortlinks/public/:slug` | link state for the gate page, records a view where applicable |
| `GET /api/shortlinks/resolve`      | the same resolution with the redirect answer                  |
| `POST /api/shortlinks/verify`      | the gate's passphrase check, records the click on success     |

Admin (the `x-cms-passphrase` header, same gate as every CMS controller):

| Route                                               | What it does                                         |
| --------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/shortlinks/admin/domains`                 | domains plus the CNAME target                        |
| `POST /api/shortlinks/admin/domains`                | add a domain (Cloudflare detected, Railway attached) |
| `GET /api/shortlinks/admin/domains/:id`             | re-check DNS, provider and the verification marker   |
| `POST /api/shortlinks/admin/domains/:id/cloudflare` | one-click Cloudflare DNS setup                       |
| `DELETE /api/shortlinks/admin/domains/:id`          | remove a domain (refused while it has links)         |
| `GET /api/shortlinks/admin/links`                   | list with search and domain filter                   |
| `POST /api/shortlinks/admin/links`                  | create                                               |
| `PUT /api/shortlinks/admin/links/:id`               | update                                               |
| `DELETE /api/shortlinks/admin/links/:id`            | delete                                               |
| `GET /api/shortlinks/admin/links/:id/analytics`     | the analytics bundle                                 |

The web app mirrors these under `/api/admin/links/**`, gated by the `links` RBAC page id like every other workspace, and forwards the visitor's IP and client on the public reads.

## The admin workspace

The Links section of the studio (`apps/web/src/components/admin/links-studio.tsx`) holds the shorten form, the link list, and the domain manager:

- The form preselected domain is the last used one, remembered server-side (`lastUsedAt`) and in localStorage, so an admin can keep shortening on the same domain all week.
- The list searches across code, long URL and short URL, and every row carries the status badge, view and click counters, copy, edit and delete, and an expandable analytics panel with a 14-day chart.
- The domain manager lists every custom domain with its provider and live/pending state, the DNS instructions, the Cloudflare setup box, check-now, and removal.

## Environment

| Variable                                    | Service | What it does                                                                       |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `SHORTLINKS_PRIMARY_DOMAIN`                 | api     | the site domain that serves `/s/` links (default `labmgm.org`)                     |
| `SHORTLINKS_CNAME_TARGET`                   | api     | where custom domains point (the web service's Railway domain)                      |
| `SHORTLINKS_WEB_SERVICE_ID`                 | api     | the Railway web service id for domain attachment                                   |
| `SHORTLINKS_RAILWAY_PROJECT_ID` / `_ENV_ID` | api     | Railway ids for attachment (defaults match production)                             |
| `RAILWAY_API_TOKEN`                         | api     | project token for attaching custom domains; without it the admin attaches manually |
| `SHORTLINKS_ENCRYPTION_KEY`                 | api     | 32-byte hex key encrypting Cloudflare tokens; saving one is refused without it     |
| `SHORTLINKS_GEOLOCATE`                      | api     | `false` turns IP geolocation off                                                   |
| `SHORTLINKS_SITE_HOSTS`                     | web     | hosts that serve the marketing site, where `/s/` is used                           |

## Gotchas

- Do not add a `proxy.ts` to "speed up" resolution: the catch-all route handler already costs nothing on matched pages, and a proxy would force every page dynamic.
- Railway must know a custom domain before its traffic reaches the app. The autoconfigure path does this only when `RAILWAY_API_TOKEN` has the permission; a token that cannot even read `project` is scoped wrong.
- Custom domains resolve their own links only. A link shortened on the site domain never resolves at a custom domain's root, and vice versa, by design.
- The primary domain's links work on every host the site answers on (www, the Railway domain, localhost), via a fallback in `findRoutableLink`.
- Visit recording and the click counter are two separate writes per hit. They agree in aggregate, but a crash between them can leave a click recorded without its counter increment, which only matters for single-use links under rare timing.
