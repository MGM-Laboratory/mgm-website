# Domain Connect: the one-click Cloudflare setup

The admin workspace's "Connect with Cloudflare" button uses [Cloudflare's Domain Connect integration](https://developers.cloudflare.com/dns/reference/domain-connect/) (Domain Connect v2, synchronous flow). One click opens Cloudflare's consent page; Cloudflare then applies the CNAME and the verification TXT records to the user's zone. The API never receives or stores a Cloudflare token.

## How it works

1. The API reads the routing target from `SHORTLINKS_CNAME_TARGET`. The API does not attach the domain to any service, because the proxy in front of the site routes the host. When the setting is empty, the connect request is refused with a message that says the CNAME target is not configured.
2. It builds a signed apply template URL:
   `{syncUrl}/v2/domainTemplates/providers/labmgm.org/services/shortlinks/apply?domain=...&cnameTarget=...&verifyToken=...&redirect_uri=...&key=_dcpubkeyv1&sig=...`
   The signature is RSA-SHA256 over the full query string (minus `key` and `sig`, values URL-encoded, in order); `sig` is always the last parameter.
3. The browser opens that URL in a new tab. Cloudflare verifies the signature against the public key published at `_dcpubkeyv1.labmgm.org`, shows the approval page, and applies the template's records.
4. "Check now" validates the domain by its TXT records: `_mgm-verify.<domain>` must match the per-domain token, and the web app's marker probe must answer. The admin page shows each piece and the exact records to copy for manual entry.

The template the records come from is in `domainconnect/template.labmgm.org.shortlinks.json`. The signing key is `DOMAIN_CONNECT_PRIVATE_KEY` (env, api service); its public half is published as two chunked TXT records at `_dcpubkeyv1.labmgm.org` (see below).

## The one-time Cloudflare onboarding (owner, not the code)

Cloudflare only accepts sync requests from providers it has onboarded. This is a manual, one-time step:

1. **Publish the sync public key.** Add these TXT records to the `labmgm.org` zone in Cloudflare:

   | Type | Name                     | Content                        |
   | ---- | ------------------------ | ------------------------------ |
   | TXT  | `_dcpubkeyv1.labmgm.org` | `p=1,a=RS256,d=<first chunk>`  |
   | TXT  | `_dcpubkeyv1.labmgm.org` | `p=2,a=RS256,d=<second chunk>` |

   The chunks are the base64 (standard alphabet) of the RSA public key in DER, split at 200 characters. Generate them from the private key:
   `openssl rsa -in <key.pem> -pubout -outform DER | base64`.

2. **Register the template.** Fork [Domain-Connect/Templates](https://github.com/Domain-Connect/Templates), add `domainconnect/template.labmgm.org.shortlinks.json` as `labmgm.org.shortlinks.json`, and open a pull request (Cloudflare's linter runs on it).

3. **Email `domain-connect@cloudflare.com`** with: the template's GitHub link, `labmgm.org` as the `syncPubKeyDomain` FQDN, a logo URL, the default proxy status for the CNAME (`false`, DNS only), and the provider and service ids (`labmgm.org`, `shortlinks`).

Until Cloudflare completes the onboarding, the connect button still returns the exact records to copy, and the admin page shows them with copy buttons, so domains can be connected by hand in the meantime.

## Environment (api service)

| Variable                      | What it is                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `DOMAIN_CONNECT_PRIVATE_KEY`  | PEM RSA private key that signs each sync request                               |
| `DOMAIN_CONNECT_PROVIDER_ID`  | `labmgm.org` (default)                                                         |
| `DOMAIN_CONNECT_SERVICE_ID`   | `shortlinks` (default)                                                         |
| `DOMAIN_CONNECT_KEY_ID`       | `_dcpubkeyv1` (default), the TXT host under the provider id                    |
| `DOMAIN_CONNECT_REDIRECT_URL` | where Cloudflare returns after approval (default `https://labmgm.org/admin`)   |
| `DOMAIN_CONNECT_SYNC_URL`     | fallback sync prefix (default `https://cloudflare.com/cdn-cgi/domain-connect`) |
| `SHORTLINKS_CNAME_TARGET`     | the CNAME target the template applies, no default (see `docs/shortlinks.md`)   |

## Gotchas

- The proxy in front of the site has to accept every custom short domain as a host and route it to the web app. The API does not configure that, and the marker probe fails until it does.
- Without `SHORTLINKS_CNAME_TARGET` the API cannot build the apply URL, so "Connect with Cloudflare" is disabled in the admin page.
- The signature covers the query string exactly as sent: any reordering or re-encoding after signing breaks verification.
