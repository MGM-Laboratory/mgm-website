# CMS and Admin Workspace

`/admin` is the internal editorial workspace for MGM Laboratory. It owns public content, media, submissions, site settings, and delegated editor accounts. It is deliberately outside the public navigation. This guide records the boundary between the browser, the Next.js app, and the NestJS API so future changes do not accidentally expose the administrator passphrase or bypass RBAC.

## Entry points and data flow

1. `/admin/login` accepts either the environment `ADMIN_PASSPHRASE` (the superadmin) or an active delegated editor passphrase. The browser posts only to `apps/web/src/app/api/admin/login/route.ts`.
2. A successful login writes a signed, HTTP-only, `SameSite=Lax` `mgm_admin_session` cookie, valid for 12 hours. The token contains an account id, session version, issued time, and HMAC; it is not a bearer copy of the passphrase.
3. Every `/api/admin/**` Next route handler validates that cookie with `requireAdminPermission()` or `requireSuperadmin()` before it forwards the request to the API. `cmsApi()` adds `x-cms-passphrase` server-side, so the secret never reaches browser code.
4. The Nest API owns validation, persistence, media storage, and public/admin response shaping. Public pages fetch its published endpoints; admin lists use the `/admin` collection endpoints so editors can see drafts.

`getAdminSession()` rechecks a delegated editor's account on every request. Disabling an account, changing its permission set, or changing its passphrase increments its `sessionVersion` and invalidates existing sessions without waiting 12 hours. The superadmin is the one environment-backed account and is trusted from the signed cookie after the passphrase gate.

## Roles and permissions

Only the superadmin can create, edit, or delete delegated administrators. Delegated accounts have an active flag, optional expiry, and page-by-page permissions. The vocabulary comes from `packages/shared/src/schemas/admin-permissions.ts`:

| Page id             | Workspace                 | Allowed actions     |
| ------------------- | ------------------------- | ------------------- |
| `articles`          | Articles                  | read, write, delete |
| `publications`      | Publications              | read, write, delete |
| `members`           | Member directory          | read, write, delete |
| `projects`          | Projects                  | read, write, delete |
| `research`          | Research initiatives      | read, write, delete |
| `careers`           | Openings and applications | read, write, delete |
| `contact`           | Contact settings          | read, write, delete |
| `contact-inquiries` | Contact inbox             | read only           |
| `events`            | Events and registrations  | read, write, delete |
| `links`             | Short links and domains   | read, write, delete |
| `home`              | Homepage settings         | read, write, delete |
| `other`             | Other settings namespace  | read, write, delete |

Permissions are rank-expanded: granting `write` also grants `read`; granting `delete` grants all three. Contact inquiries are intentionally read-only for delegated accounts even though the API supports state changes through the superadmin path. If a new collection is added, update the shared page-id list, API validation, Next proxy gates, and the admin studio together; drift between those layers has already caused rejected admin creation requests.

## Editorial collections

The workspace is composed in `apps/web/src/components/admin/member-cms-studio.tsx`. Its main collections are Articles, Projects, Publications, Research, Member, Careers, Contact Inquiries, Events, Links, and Settings (Home and Contact Settings), plus superadmin-only Admin Management.

The API stores each collection as a slug-keyed JSONB `data` record. Prisma defines the current tables in `apps/api/prisma/schema.prisma`: `CmsMember`, `CmsArticle`, `CmsPublication`, `CmsProject`, `CmsResearchInitiative`, `CmsJobPosting`, `CmsJobApplication`, `CmsEvent`, `CmsEventRegistration`, `CmsContactInquiry`, `CmsAdmin`, and the singleton `CmsHomeContent` and `CmsContactSettings` records. `PrismaService.onModuleInit()` creates these tables idempotently as an operational safety net; schema migrations remain the durable migration record.

| Collection        | Public path                             | Notable admin capability                                                             |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| Members           | `/member`, `/member/[slug]`             | profile photo crop/upload and structured profile fields                              |
| Articles          | `/articles`, `/articles/[slug]`         | BlockNote body, cover uploads, page theme                                            |
| Publications      | `/publications`, `/publications/[slug]` | paper PDF, author photos, citations, preview metadata                                |
| Projects          | `/projects`, `/projects/[slug]`         | detail page theme, CTA and services, ordered image and video media sections          |
| Research          | `/research`, `/research/[slug]`         | initiative detail, linked outcomes, cover upload                                     |
| Careers           | `/careers`, detail, apply               | openings, BlockNote detail, application inbox and CV files                           |
| Events            | `/events`, `/events/[slug]`             | event media, registrations, calendar export, map-link resolution                     |
| Links             | `/s/[slug]` and custom short domains    | domains with Cloudflare setup, links with expiry and passphrases, per-link analytics |
| Contact inquiries | `/contact`                              | inbox state and bulk actions; the original inquiry is persisted before mail is sent  |
| Home              | `/`                                     | homepage video/settings singleton                                                    |
| Contact settings  | `/contact`                              | addresses, map location, and mail routing strategy                                   |

The careers workflow has additional validation, upload constraints, and inbox behavior; read [`careers-cms.md`](careers-cms.md) before modifying it. Contact settings control mail routing, which is detailed in [`mail-system.md`](mail-system.md).

## Media and upload rules

The API's `StorageService` writes to AWS S3 or an S3-compatible bucket. It gives uploaded objects immutable cache headers and serves private/public CMS files through short-lived signed-download redirects. The object bucket must be configured with `AWS_S3_BUCKET`; `AWS_ENDPOINT_URL` and `AWS_S3_FORCE_PATH_STYLE` support Railway or another compatible provider.

Large bodies must be streamed through the Next proxy, not parsed into `request.formData()` or JSON first. The established paths use raw PDF/video bodies or streamed multipart forwarding:

- publication papers: `CMS_MAX_PAPER_BYTES`, default 200 MB;
- project videos: `CMS_MAX_VIDEO_BYTES`, default 500 MB, MP4 or WebM;
- job CVs: `CMS_MAX_CV_BYTES`, default 100 MB, PDF/DOC/DOCX;
- contact attachments: 25 MB hard limit.

Publication papers carry a visibility flag of their own. The API serves a paper only when the record states `paperHidden: false`, and answers 404 for every other record, so a hidden paper cannot be read from a known storage key. Papers that predate the flag, and every fresh upload, start hidden: the publication page keeps showing the DOI alone until an editor switches the Paper (PDF) card to Visible.

When adding a media type, enforce the byte limit at the API, preserve the stream through the Next route handler, validate the file type, and ensure deletion cleans up the object as well as the JSON record.

### Article theme

An article record may carry `theme`, one of the same 20 preset ids as projects (`apps/web/src/lib/project-themes.ts`). The editor's Page theme picker (`article-cms-editor.tsx`, reusing the project editor's `ThemePicker`) offers every preset and an Automatic option, which previews the stable pick from the slug (`lib/theme-pick.ts`) that a record without a theme gets. The article page wears it, the library world tints its fog toward it, and the list's cards carry it (`data-article-theme`) so opening one sweeps its color in. See [`articles-page.md`](articles-page.md).

The article save and bootstrap routes validate their bodies and answer 400 naming the first invalid field (an unknown theme id included, which the editor shows next to that field), like the project routes, instead of failing with a 500.

### Project detail fields

A project record also carries the fields its detail page (`/projects/[slug]`, see [`projects-page.md`](projects-page.md)) is built from. Their schema lives in the shared package (`packages/shared/src/schemas/project-detail.ts`), so the API and the admin editor enforce the same limits. Every field is optional, which keeps older records and preview seeding valid.

| Field         | Shape                                                                       | Limit                        |
| ------------- | --------------------------------------------------------------------------- | ---------------------------- |
| `theme`       | one of 20 preset ids (`apps/web/src/lib/project-themes.ts`)                 | preset ids only              |
| `description` | detail page copy, paragraphs separated by a blank line                      | 520 characters               |
| `cta`         | `{ label, url }`, a web URL or a site path                                  | label 28 characters          |
| `services`    | short labels                                                                | 8 labels, 32 characters each |
| `media`       | ordered sections `{ id, kind, size, key, width, height, alt?, posterKey? }` | 40 sections                  |

- A media section is an image or a video (`kind`) shown at the `normal` or `full` size. Image keys come from the project image upload and video keys from the demo video upload. A video may carry a `posterKey`, an image key. The API refuses a section whose file is of the other kind.
- `width` and `height` are the file's pixel size, recorded by the editor at upload so the page lays out before anything loads. Older records don't store sizes. For them a single-record read (`GET /cms/projects/:slug`) adds `mediaSizes`, measured once per image key with sharp and cached for 30 days, since keys never change.
- A record without media sections derives them on the page: the cover at the full size, then the gallery at the normal size, then an uploaded demo video. A missing theme falls back to a stable pick from the slug, a missing description to the summary, and missing services to the tech stack.
- The editor still writes `galleryKeys` from the image sections, so older readers (the homepage showcase, the list card) keep finding images.
- Media-section videos play through the same video route as the demo video. A video is public when a published record uses it as its demo video or in a media section.
- Saving deletes a stored file only when the record no longer references it anywhere: cover, gallery, media sections, posters, or an image block in the body. So pruning a picture from the gallery or the sections never breaks a body that still shows it. Deleting a project removes all of them.
- The BlockNote body stays in the record and in the editor, but the detail page doesn't render it. The editor folds it into a collapsed "Write-up (archive)" section.
- The media sections manager uploads a file as soon as it's added, so a file added and never saved stays in storage (there is no delete endpoint for unsaved uploads). Images over 5.5 MB are scaled to a 3840 px long edge and re-encoded as JPEG, because a base64 image just under 6 MB already exceeds the API's 8 MB request limit. Videos get their size, duration and a poster frame read in the browser before they stream through the video route.
- Once a project has media sections, saving retires the old single demo video: an uploaded demo that no section shows is released (and its file deleted), and a URL or YouTube demo becomes an ordinary "Demo video" link. Replacing the cover also replaces any section that showed the old cover.
- Removing every section saves an empty list, and an empty list derives again from the cover. To show fewer images, keep at least one section.

## Content seeding and failure behavior

Several public collections have seed helpers in `apps/web/src/lib/*-cms*-seed.ts`. They initialize legacy/static source data only when needed so the public site retains content during a fresh CMS rollout. Do not call an admin feed from a public page just to make seeding convenient: drafts and protected fields must not be sent to an account without the corresponding `read` permission.

Public CMS helpers should fail softly to a safe static/default value where one exists (for example, contact settings fall back to `DEFAULT_CONTACT_SETTINGS`). Admin mutations should surface API validation errors rather than silently accepting malformed content.

## Change checklist

1. Add or change the shared Zod schema first when the browser and API exchange a record shape.
2. Update the API controller/service, Prisma schema/migration, and idempotent startup table list when persistence changes.
3. Add the gated Next `/api/admin/**` proxy and the matching public proxy/media route.
4. Gate data loading in `app/admin/page.tsx`; the server must not preload a restricted draft feed merely because the client hides its tab.
5. Update the admin studio, public route helpers, this document, and the relevant collection-specific guide.
6. Verify a least-privilege delegated account, revoked/expired account behavior, upload limits, and public draft invisibility in addition to the superadmin path.
