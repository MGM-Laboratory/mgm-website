# Data model

The data lives in PostgreSQL. The API reaches it through Prisma with the `pg` adapter. This page lists the tables, their keys and what each one holds. The files `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations/` are the source of truth, and the boot code in `apps/api/src/prisma/prisma.service.ts` is the second place where tables are defined.

## How the tables are created

- `PrismaService.onModuleInit()` runs when the API starts. It connects and then runs `CREATE TABLE IF NOT EXISTS` for every table below, with the indexes and the foreign keys. It also runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for two columns of `ShortLinkDomain` that were added after the first rollout. Repeated starts change nothing. The database role of the API therefore needs the right to create tables.
- The folder `apps/api/prisma/migrations/` is the durable record of the schema. It holds 10 migrations. The script `pnpm --filter api prisma:deploy` applies them with `prisma migrate deploy`. The start command of the API image is `node dist/main.js`, and it does not run migrations.
- The migrations do not create the four tables `CmsArticle`, `CmsProject`, `CmsEvent` and `CmsEventRegistration`. The schema file defines them and only the boot code creates them. A database that is built from the migrations alone lacks these four tables until the API starts.
- Prisma generates the client in `apps/api/src/generated/prisma`. The repository ignores that folder.
- A change to a table touches the schema file, a migration and the boot statements. The change checklist in [CMS and admin workspace](cms-admin.md) names these places.

## CMS collections

Thirteen tables share one shape. The key is `slug` (text, primary key). The column `data` (`JSONB`, required) holds the whole record. The columns `createdAt` and `updatedAt` are timestamps. Prisma sets `updatedAt` on every update.

| Table                   | What `data` holds                                                                                 | Slug             |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ---------------- |
| `CmsMember`             | A member profile                                                                                  | A URL slug       |
| `CmsArticle`            | An article with its blocks, cover and theme                                                       | A URL slug       |
| `CmsPublication`        | A publication with authors, citation and paper key                                                | A URL slug       |
| `CmsProject`            | A project with its detail fields and media sections                                               | A URL slug       |
| `CmsResearchInitiative` | A research initiative                                                                             | A URL slug       |
| `CmsJobPosting`         | `{ job, content }`, the job fields and the description blocks                                     | A URL slug       |
| `CmsJobApplication`     | `{ application }`, the applicant fields, the CV key and the inbox state                           | `app-<uuid>`     |
| `CmsEvent`              | An event with its schedule, place, media and registration flag                                    | A URL slug       |
| `CmsEventRegistration`  | `{ registration }`, the registrant fields, the event slug and title and the inbox state           | `reg-<uuid>`     |
| `CmsContactInquiry`     | `{ inquiry }`, the sender fields, the message, the attachment keys and the inbox state            | `inquiry-<uuid>` |
| `CmsAdmin`              | A delegated admin account with a scrypt hash, permissions, expiry, session version and last login | `admin-<uuid>`   |
| `CmsContactSettings`    | The contact page settings and the mail routing, one row                                           | `contact`        |
| `CmsHomeContent`        | The homepage video settings, one row                                                              | `home`           |

- The shape of each record is a zod schema, in `packages/shared` or in the controller of the collection. The database does not check the JSON.
- The inbox state of an application, a registration and an inquiry is `read`, `readAt` and `status`. The status is `inbox` or `archived`.
- Deleting a record deletes its row. Some collections also delete the stored files of the record, and a contact inquiry does not.

## Mail tables

| Table               | Key                                    | Columns                                                                       | Purpose                                                                                      |
| ------------------- | -------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `MailProviderUsage` | `provider` (`resend`, `smtp` or `ses`) | `dailyRemaining`, `dailyResetAt`, `longRemaining`, `longResetAt`, `updatedAt` | The counters of a calendar window for a provider limit                                       |
| `MailSendLog`       | `id` (UUID made by Prisma)             | `provider`, `sentAt`                                                          | One row for each send, for a rolling window. The index `(provider, sentAt)` serves the count |
| `MailRoutingState`  | `key`                                  | `value` (integer, default 0)                                                  | The pointer of the round robin strategy                                                      |

[Mail system](mail-system.md) explains how the three tables are used.

## Link shortener tables

| Table             | Key         | Columns                                                                                                                                                                                                         | Notes                                                                                                                                              |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShortLinkDomain` | `id` (cuid) | `hostname`, `isPrimary`, `provider`, `status`, `cloudflareZoneId`, `cloudflareTokenEncrypted`, `verifyToken`, a column for the id of the domain at the hosting platform, `lastUsedAt`, `createdAt`, `updatedAt` | `hostname` is unique. `provider` is `local`, `cloudflare` or `manual`. `status` is `pending` or `connected`. The primary domain is seeded at start |
| `ShortLink`       | `id` (cuid) | `slug`, `longUrl`, `domainId`, `expiresAt`, `maxClicks`, `clickCount`, `viewCount`, `passphraseSalt`, `passphraseHash`, `longUrlStatus`, `longUrlCheckedAt`, `createdAt`, `updatedAt`                           | Unique on `(domainId, slug)`. Index on `(domainId, createdAt)`. The foreign key to the domain cascades on delete                                   |
| `ShortLinkVisit`  | `id` (cuid) | `linkId`, `ip`, `userAgent`, `referer`, `isView`, `isClick`, `failedAttempt`, `country`, `region`, `city`, `latitude`, `longitude`, `timezone`, `device`, `browser`, `os`, `createdAt`                          | Index on `(linkId, createdAt)`. The foreign key to the link cascades on delete                                                                     |

The code never writes `cloudflareTokenEncrypted`. [Short links](shortlinks.md) describes the feature.

## Form tables

| Table          | Key                     | Columns                                                                                                                                                                                                                                                                                                                                                                                                     | Notes                                                                                                                                                                               |
| -------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Form`         | `id` (cuid)             | `slug`, `status`, `data`, `passphraseSalt`, `passphraseHash`, `publishedAt`, `createdAt`, `updatedAt`                                                                                                                                                                                                                                                                                                       | `slug` is unique. `status` is `draft`, `published` or `closed`. `data` is the form document                                                                                         |
| `FormResponse` | `id` (cuid)             | `formId`, `answers` (JSONB), `score`, `endingId`, `sessionId`, `deviceId`, `spam`, the visit columns (`ip`, `userAgent`, `referer`, `country`, `region`, `city`, `latitude`, `longitude`, `timezone`, `device`, `browser`, `os`, `language`, `screen`, `utm`), `startedAt`, `durationMs`, the review columns (`starred`, `flagged`, `reviewed`, `tags` as a text array, `note`, `editedAt`) and `createdAt` | Indexes on `(formId, createdAt)` and `(formId, deviceId)`. The foreign key cascades on delete                                                                                       |
| `FormEvent`    | `id` (cuid)             | `formId`, `sessionId`, `type`, `fieldId`, `dedupeKey`, the visit columns (`ip`, `userAgent`, `referer`, `country`, `region`, `city`, `latitude`, `longitude`, `device`, `browser`, `os`, `language`) and `createdAt`                                                                                                                                                                                        | `type` is `view`, `start`, `progress` or `submit`. Unique on `(formId, dedupeKey)`. Indexes on `(formId, createdAt)` and `(formId, type)`. The foreign key cascades on delete       |
| `FormUpload`   | `key` (the storage key) | `formId`, `fieldId`, `sessionId`, `name`, `size`, `type`, `width`, `height`, `responseId`, `createdAt`                                                                                                                                                                                                                                                                                                      | `responseId` has no foreign key. It stays empty until a response claims the file. Indexes on `(formId, createdAt)` and `responseId`. The foreign key to the form cascades on delete |

Deleting a form deletes its responses, events and upload rows by cascade. The code also deletes the stored files. [Forms](forms.md) describes the feature.

## Keys and types

- Tables with a `cuid` key get the value from the Prisma client. The column is `TEXT` without a database default, so an insert that bypasses Prisma has to supply the id.
- Dates are `TIMESTAMP(3)` without a time zone, and Prisma stores UTC.
- Columns that hold JSON use `JSONB`.
- Status and kind columns are plain text. The schema has no enum type, and the code validates the values.

## Files outside the database

Uploaded files live in an S3 compatible bucket and not in PostgreSQL. The database stores only the keys, in `data` or in the `FormUpload` table. [Security](security.md) describes the checks on uploads and downloads. Redis is optional. When `REDIS_URL` is set, the API uses it to cache reads and signed download URLs, and the site works without it.
