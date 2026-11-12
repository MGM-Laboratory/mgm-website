# Configuration

Every setting of the site is an environment variable. The API reads and checks its settings at start (`apps/api/src/config/env.validation.ts`) and refuses to start when a required one is missing or wrong. The web app reads its settings where it uses them. A value left empty counts as not set.

Each workspace has an example file with the same names.

| File                   | Used by                                               |
| ---------------------- | ----------------------------------------------------- |
| `.env.example`         | `docker compose up` (Postgres, API and web together)  |
| `apps/api/.env.example` | The API when it runs with `pnpm dev:api`              |
| `apps/web/.env.example` | The web app when it runs with `pnpm dev:web`          |

A secret has no default. Create each one with `openssl rand -hex 32` (or `-hex 64` for a longer value) and keep it out of git.

## API

| Setting                       | Default                                          | Purpose                                                                                      |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | `development`                                    | `development`, `production` or `test`.                                                       |
| `PORT`                        | `4000`                                           | The port the API listens on.                                                                 |
| `DATABASE_URL`                | none, required                                   | The PostgreSQL connection string. The API creates its tables at start.                       |
| `SHADOW_DATABASE_URL`         | none                                             | An empty database for `prisma migrate dev`. Not used at run time.                            |
| `CORS_ORIGIN`                 | `http://localhost:3000`                          | The origins that browsers may call the API from.                                             |
| `PUBLIC_WEB_URL`              | `http://localhost:3000`                          | The public address of the web app, used for links and images in outgoing mail.               |
| `THROTTLE_TTL`                | `60000`                                          | The length of the rate limit window, in milliseconds.                                        |
| `THROTTLE_LIMIT`              | `100`                                            | The requests that one client address may make in a window.                                   |
| `ADMIN_PASSPHRASE`            | none, required                                   | The passphrase of the superadmin. The web app needs the same value.                          |
| `REDIS_URL`                   | none                                             | An optional Redis address for caching.                                                       |
| `AWS_REGION`                  | `us-east-1`                                      | The region of the object storage and of SES.                                                 |
| `AWS_S3_BUCKET`               | none                                             | The bucket for uploads. Without it, file uploads do not work.                                |
| `AWS_ACCESS_KEY_ID`           | none                                             | The access key of the bucket and of SES.                                                     |
| `AWS_SECRET_ACCESS_KEY`       | none                                             | The secret key that goes with the access key.                                                |
| `AWS_ENDPOINT_URL`            | none                                             | The address of an S3 compatible store other than AWS, such as MinIO or Cloudflare R2.        |
| `AWS_S3_FORCE_PATH_STYLE`     | `false`                                          | `true` for stores that need path style bucket addresses.                                     |
| `CMS_MAX_PAPER_BYTES`         | `209715200`                                      | The largest publication paper upload, in bytes.                                              |
| `CMS_MAX_VIDEO_BYTES`         | `524288000`                                      | The largest project demo video upload, in bytes.                                             |
| `CMS_MAX_CV_BYTES`            | `104857600`                                      | The largest job application CV upload, in bytes.                                             |
| `FORMS_MAX_UPLOAD_BYTES`      | `104857600`                                      | The largest file that a person can upload to a form, in bytes.                               |
| `SES_FROM_EMAIL`              | none                                             | The sender address. Mail goes through AWS SES when no other provider is set.                 |
| `MAIL_FROM_NAME`              | none                                             | The display name that goes with the sender address.                                          |
| `RESEND_API_KEY`              | none                                             | Sends mail through Resend. Providers are tried in the order Resend, SMTP, SES.               |
| `SMTP_HOST`                   | none                                             | Sends mail through this SMTP server.                                                         |
| `SMTP_PORT`                   | none                                             | The SMTP port.                                                                               |
| `SMTP_USER`                   | none                                             | The SMTP user name.                                                                          |
| `SMTP_PASSWORD`               | none                                             | The SMTP password.                                                                           |
| `SMTP_SECURE`                 | `false`                                          | `true` to use TLS from the start of the SMTP connection.                                    |
| `SHORTLINKS_PRIMARY_DOMAIN`   | `labmgm.org`                                     | The domain that serves short links under `/s/<slug>`.                                        |
| `SHORTLINKS_CNAME_TARGET`     | none                                             | The host that custom short domains point their CNAME record at. Without it, the admin page says so and the one click Cloudflare setup is off. |
| `SHORTLINKS_GEOLOCATE`        | `true`                                           | `false` stops the country lookup of short link visits.                                       |
| `SHORTLINKS_ENCRYPTION_KEY`   | none                                             | A 64 character hex key. The schema checks its shape.                                         |
| `DOMAIN_CONNECT_PROVIDER_ID`  | `labmgm.org`                                     | The provider identity of the Domain Connect setup.                                           |
| `DOMAIN_CONNECT_SERVICE_ID`   | `shortlinks`                                     | The service identity of the Domain Connect template.                                         |
| `DOMAIN_CONNECT_PRIVATE_KEY`  | none                                             | The private key that signs Domain Connect requests.                                          |
| `DOMAIN_CONNECT_KEY_ID`       | `_dcpubkeyv1`                                    | The host name part of the public key record.                                                 |
| `DOMAIN_CONNECT_REDIRECT_URL` | `https://labmgm.org/admin`                       | Where Cloudflare sends the person back after the setup.                                      |
| `DOMAIN_CONNECT_SYNC_URL`     | `https://cloudflare.com/cdn-cgi/domain-connect`  | The fallback address of the Domain Connect service.                                          |

## Web app

| Setting                           | Default                       | Purpose                                                                                           |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`             | `http://localhost:4000/api`   | The API address that browsers call. It is read when the image is built, so set it as a build argument. |
| `CMS_API_URL`                     | `NEXT_PUBLIC_API_URL`         | The API address that the web server calls. In compose it is `http://api:4000/api`.                |
| `ADMIN_PASSPHRASE`                | none, required                | The superadmin passphrase. It must match the API.                                                 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | none                          | Turns on the interactive map on event pages. Without it, the page shows the address and a link.   |
| `CMS_MAX_PAPER_BYTES`             | `209715200`                   | The same limit as the API, checked before the upload is sent.                                     |
| `CMS_MAX_VIDEO_BYTES`             | `524288000`                   | The same limit as the API.                                                                        |
| `CMS_MAX_CV_BYTES`                | `104857600`                   | The same limit as the API.                                                                        |
| `FORMS_MAX_UPLOAD_BYTES`          | `104857600`                   | The same limit as the API.                                                                        |
| `SHORTLINKS_SITE_HOSTS`           | `labmgm.org,www.labmgm.org`   | The host names that count as the site itself and not as a custom short domain.                    |
| `NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS` | none                          | `true` shows the query devtools in development.                                                   |

## Compose

`docker compose up` reads the root `.env`. It sets the database and passes the API and web settings on.

| Setting             | Default        | Purpose                                                              |
| ------------------- | -------------- | -------------------------------------------------------------------- |
| `POSTGRES_USER`     | `postgres`     | The database user.                                                   |
| `POSTGRES_PASSWORD` | none, required | The database password.                                               |
| `POSTGRES_DB`       | `mgm_website`  | The database name.                                                   |
| `POSTGRES_PORT`     | `5432`         | The host port of the database.                                       |
| `ADMIN_PASSPHRASE`  | none, required | The superadmin passphrase for the API and the web app.               |

The compose file passes the other API settings through with the defaults of the tables above.
