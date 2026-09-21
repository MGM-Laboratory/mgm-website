# Careers CMS: job postings, applications, and the inbox

The careers system is a full CMS loop: admins publish job openings in the admin workspace (BlockNote descriptions, no cover images), the public site lists them with search/filters/pagination, applicants submit a two-track application form with a CV upload, and every submission lands in an email-style admin inbox.

## Data model

Two blob-style tables following the other CMS collections (slug PK + JSONB `data`):

- **`CmsJobPosting`**: `data` carries `{ job: { slug, title, focus, commitment, mode, deadline, perks[], status }, content: BlockNote blocks[] }`. `status` is `draft | published | closed`. Deadlines are `YYYY-MM-DD` compared against UTC today; the deadline day is inclusive.
- **`CmsJobApplication`**: `data` carries `{ application: { jobSlug, jobTitle, applicantType, fullName, email, phoneCountry, phoneNumber, nim?, faculty?, motivation, cvKey, cvFilename, cvContentType, agreedToTerms, read, readAt, status } }`. `applicantType` is `ub-student | general`; `status` is `inbox | archived`. The job title is denormalized at submit time so the inbox survives job deletion.

Tables are created idempotently in `PrismaService.onModuleInit()` (`CREATE TABLE IF NOT EXISTS`), the same pattern as `CmsArticle`/`CmsAdmin`.

## API (`apps/api/src/cms/cms-jobs.*`)

Public: `GET /api/cms/jobs` (open roles, BlockNote documents stripped because the listing never renders body text), `GET /api/cms/jobs/:slug` (published or closed, full document; drafts 404), `POST /api/cms/jobs/:slug/apply` (multipart, throttled to 5/min because a 100 MB CV is not a cheap request), `GET /api/cms/jobs/media/:key` (signed-URL redirect for description images).

Admin (all `x-cms-passphrase`): `GET /api/cms/jobs/admin`, `PUT /api/cms/jobs/:slug`, `DELETE /api/cms/jobs/:slug`, `POST /api/cms/jobs/:slug/media`, `GET /api/cms/jobs/applications` (deliberately uncached because unread counts must not stale), `GET /api/cms/jobs/applications/:slug` (returns `{ record, cvUrl }` with a 15-minute signed URL), `PUT /api/cms/jobs/applications/:slug/state` (`{ read?, status? }`), `POST /api/cms/jobs/applications/bulk` (`{ ids, action }` where action is `archive | unarchive | markRead | markUnread | delete`; deletes also remove the CV from storage).

The apply route validates fields with friendly 400s (unlike the admin validation paths, which keep the existing 500-on-ZodError convention). CVs: PDF/DOC/DOCX by mimetype, size-capped by `CMS_MAX_CV_BYTES` (default 100 MB) read straight from `process.env`, S3 key `cv-<uuid>.<ext>`. The original filename is sanitized and kept for display only.

Reserved slugs: `admin`, `feed`, `media`, `applications`. A job can never claim one.

## Web

- **Public pages**: `/careers` (server component; `?q=`/`?focus=`/`?commitment=`/`?mode=` filters, `?page=`/`?per=` pagination, 9/18/45 per page, nonprofit framing banner), `/careers/[slug]` (meta grid, perks, Apply CTA above the clamped description, where `CareerDescriptionPreview` fades the clamped body and toggles "Read more"), `/careers/[slug]/apply` (two-track form: UB track adds NIM/NIDN/NIP + faculty with FILKOM pinned; email validated on blur only; phone country-code select defaults to +62; CV drag-and-drop; XHR upload with progress).
- **Data layer**: `apps/web/src/lib/career-cms.ts` (types/helpers, client-safe), `career-cms-server.ts` (server-only fetchers), `career-apply.ts` (XHR submit), `country-codes.ts`, `ub-faculties.ts`.
- **Route handlers**: `/api/careers-cms` (public feed with ETag/304), `/api/careers-cms/[slug]/apply` (streams the multipart body through: never `request.formData()`, which would double-buffer 100 MB), `/api/careers-cms/media/[key]`, and the admin proxies under `/api/admin/careers/**` + `/api/admin/applications/**` (permission-gated with `requireAdminPermission("careers", …)`).
- **Admin workspace**: `CareersCmsStudio` (Openings / Applications tabs with an unread badge), `CareersJobEditor` (metadata + BlockNote via the shared `blocknote-editor`, perks tag input, status select), `ApplicationsInbox` (email-style two-pane reader: filter pills with counts, search, checkboxes with shift-click range select, bulk archive/mark-unread/delete, detail pane with mailto/tel links, motivation, CV download via the signed URL). Admin contacts applicants themselves. There is no reply UI.

## Env

- `CMS_MAX_CV_BYTES`: largest accepted CV in bytes, default 104857600 (100 MB). Read from `process.env` on both sides so an unset variable can never take the pipeline down.

## Verification flow used

`curl` against the API for every validation path (missing NIM → 400, expired role → 409, wrong type → 400, oversize → 413), then Playwright end-to-end: listing filters/search/pagination, detail truncation toggle, the full form submit (which lands a row in the production inbox), and every inbox operation including bulk delete, which removes the CV object from storage.
