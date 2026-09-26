# Forms

The form builder. Admins design forms in the Forms workspace of `/admin`, publish them at `/forms/:slug` (a custom slug or a random one), share them (a QR code, embed snippets, and short links created in place), and read the responses in the same workspace: a table with media previews, data cleaning, exports, charts, traffic and location analytics, and statistical analysis. The public form is an immersive page where the respondent's answers build a 3D composition that celebrates when they submit.

## The pieces

| Layer       | Where                                                                  | What it holds                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract    | `packages/shared/src/forms/`                                           | the form document schema, rich text whitelist, conditional logic, answer validation, display helpers, interface words (English and Indonesian), and the API request and response types |
| API         | `apps/api/src/forms/`                                                  | persistence, the admin and public routes, uploads, analytics, notification and receipt mail                                                                                            |
| Next routes | `apps/web/src/app/api/admin/forms/**`, `apps/web/src/app/api/forms/**` | the RBAC-gated admin proxy and the public proxy that forwards the visitor's address and client                                                                                         |
| Admin       | `apps/web/src/components/admin/forms/`                                 | the workspace: forms list, template gallery, builder, share, responses, analytics                                                                                                      |
| Public      | `apps/web/src/app/forms/[slug]/`, `apps/web/src/components/forms/`     | the form experience, its 3D scenes and their DOM fallback                                                                                                                              |
| Preview     | `apps/web/src/app/admin/forms/preview/`                                | the admin-only page the builder embeds to preview a draft                                                                                                                              |

## The form document

A form is one JSON document validated by `formDocumentSchema` (`packages/shared/src/forms/schema.ts`) and stored on its `Form` row. The API parses every save with it and answers 400 naming the first invalid path, which the builder shows next to that control.

- **Fields** are an ordered list. Thirty question types (`FORM_INPUT_TYPES`): short and long text, email, phone, number, link, multiple choice, checkboxes, dropdown, multiselect, picture choice, yes or no, rating, opinion scale, NPS, slider, ranking, matrix, date, time, date and time, file upload, image upload, signature, name, address, country, colour, consent, and hidden (filled from a URL parameter). Nine content blocks (`FORM_CONTENT_TYPES`): heading, paragraph, image, video, callout, quote, divider, spacer and page break.
- A field's id is its answer key. The builder mints it once and never rewrites it, so responses keep lining up with their questions after edits.
- **Rich text** (descriptions, paragraphs, consent text, welcome and ending bodies) is a whitelisted subset of tiptap JSON. `sanitizeRichText` rebuilds it from known nodes and marks only, drops unsafe links, and keeps colours as the six theme tokens (`var(--rt-blue)` and so on). The public page renders it node by node. No HTML string is stored or injected anywhere.
- **Media** (covers, question media, picture choices, backgrounds) is an admin upload, a YouTube or Vimeo link, or an external URL.
- **Welcome** and **endings**: a form can have several endings. The first ending whose rules match is shown, else the first ending without rules.
- **Design**: one of the 20 project theme presets (`apps/web/src/lib/project-themes.ts`) in light, dark or automatic mode, the font, the layout (classic pages or one question at a time), the position on wide screens (centred with the poster in a corner, the default, or on the left with the poster beside it), density, field and button style, the progress indicator, the cover, the 3D scene and its intensity, a brand pattern, background media, and the motion (entrance, speed, celebration, sound).
- **Settings**: language, interface word overrides, the open and close schedule, a response limit, one response per device, whether to record IP and location, autosave, question numbers, notification emails, the respondent receipt, scoring, SEO, and the anti-spam minimum time.

`toPublicFormDocument` strips what a visitor must never receive: notification addresses, the receipt configuration and the internal note. Passphrase material lives in its own columns and never enters the document.

### Answers

`packages/shared/src/forms/answers.ts` documents the answer shape of every type. Choice answers store option ids, not labels, so renaming an option keeps old answers attached to it. The text typed next to an "Other" option lives at `otherKey(fieldId)` (`<fieldId>:other`), which gives it its own column in tables and exports. File answers list upload keys with their stored name, size and type.

### Logic

`packages/shared/src/forms/logic.ts` is shared by the public page, the builder's logic tester and the API.

- A field shows only while its `visibleIf` rules match (all or any). Rules compare an earlier answer, or the running score (`$score`), with an operator from `operatorsFor(type)`.
- A page break closes the page above it. Its `jumps` run when the respondent leaves that page and can send them to a later page, to the submit, or straight to one ending. Jumps only go forward, so a form can never loop.
- Scoring adds the points of the chosen options. An ending can show the score and endings can be chosen by it.
- `{{fieldId}}` in a label pipes in that earlier answer.
- `validateSubmission` re-runs all of it on the server: answers to questions the respondent never met are dropped, and a required question hidden by logic never blocks a submission.

## Persistence

Four tables, created at boot by `PrismaService.onModuleInit` like every other table (the migration in `apps/api/prisma/migrations/` is the durable record):

| Table          | Holds                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Form`         | slug (unique), status (`draft`, `published`, `closed`), the document, the passphrase hash and salt, publish time                                                                             |
| `FormResponse` | answers, score, ending, spam flag, the visitor's IP, client and geolocation, client context (language, timezone, screen, UTM), duration, and the admin's star, flag, reviewed, tags and note |
| `FormEvent`    | one row per session and step: `view`, `start`, `progress` (a question answered) and `submit`, deduplicated per session, step and question                                                    |
| `FormUpload`   | every respondent upload with its form, question and session, linked to its response on submit                                                                                                |

Deleting a form deletes its responses, events and uploads, storage objects included.

## Routes

The API serves `/api/forms/**`. Admin routes check the CMS passphrase header like every CMS controller. The web app mirrors them under `/api/admin/forms/**`, gated by the `forms` permission page (read, write, delete), and forwards public writes from `/api/forms/[slug]/**` with the visitor's address, user agent and referer.

Public:

| Route                                    | What it does                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /api/forms/public/:slug`            | the public document, or why the form can't be filled (locked, not open yet, closed, full). Drafts answer 404 |
| `POST /api/forms/public/:slug/unlock`    | checks a passphrase and returns the document with a short-lived token                                        |
| `POST /api/forms/public/:slug/events`    | records a view, a start or a question answered                                                               |
| `POST /api/forms/public/:slug/uploads`   | stores one respondent file (raw body) after checking the question accepts its type and size                  |
| `POST /api/forms/public/:slug/responses` | validates and stores a submission, then sends the notification and receipt mail                              |
| `GET /api/forms/media/:key`              | redirects to a form's design media                                                                           |

Admin:

| Route                                              | What it does                                                    |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `GET`, `POST /api/forms/admin`                     | the forms list, create                                          |
| `GET /api/forms/admin/slug-available`              | whether a slug is free, with a suggestion                       |
| `GET`, `PUT`, `DELETE /api/forms/admin/:id`        | read, update (document, slug, status, passphrase), delete       |
| `POST /api/forms/admin/:id/duplicate`              | a draft copy                                                    |
| `POST /api/forms/admin/:id/media`                  | a design image (data URL) or video (raw MP4 or WebM)            |
| `GET /api/forms/admin/:id/responses`               | every response, newest first                                    |
| `PATCH /api/forms/admin/:id/responses/:responseId` | edit answers, star, flag, review, tags, note                    |
| `POST /api/forms/admin/:id/responses/bulk`         | bulk star, flag, review, spam, tag and delete                   |
| `POST /api/forms/admin/:id/responses/apply`        | write cleaned answers back                                      |
| `GET /api/forms/admin/:id/analytics`               | traffic analytics for a range, bucketed in the admin's timezone |
| `GET /api/forms/admin/:id/visits`                  | the latest visits                                               |
| `GET /api/forms/admin/:id/files/:key`              | a signed link to a respondent's upload                          |

Respondent uploads are personal data: they are only ever served through the admin files route, never a public one.

## Privacy and abuse

- `settings.collectLocation` decides whether the IP address and its geolocation are stored at all. Geolocation uses the same keyless lookup as the link shortener and runs after the response is stored.
- A filled honeypot input or a submission faster than `settings.minSeconds` is stored but flagged as spam, which the dashboard filters out by default.
- Public writes are throttled per IP. One response per device, the response limit and the schedule are enforced by the API, not only by the page.

## The admin workspace

`apps/web/src/components/admin/forms/forms-studio.tsx` is the Forms workspace of the studio, full-bleed like Events. Delegated admins need the `forms` page permission. The share panel's short links also need `links` read (to list them) and `links` write (to create them).

- **Forms list.** A grid or list of forms with each form's theme colours, status, responses, views, conversion and last response time. Search, a status filter, sorting, and a quick-actions menu (open, responses, copy link, view live, duplicate, delete).
- **Template gallery.** A blank form and 33 templates in seven categories (events, feedback, research, recruitment, operations, education and quizzes, community), three of them in Indonesian, each a complete document with logic, pages and endings (`templates/`). Admins can import a form as JSON, export one, and keep their own templates in the browser.
- **Builder** (`builder/`). The header holds the title, the save state (autosave after about a second, Cmd or Ctrl+S), undo and redo, the problems list, preview, and the publish dialog (a custom slug checked live, or a random one, then publish, close, reopen or unpublish). Tabs:
  - **Build**: the block palette, the canvas (welcome screen, blocks, endings; reorder by drag or Alt+arrow keys, multi-select), and the inspector with every setting of the selected block: options with points and images, validation, format masks, media, visibility rules and URL prefill. The rich text editor (tiptap) offers headings, lists, quotes, links, alignment, highlights and text colours from the theme tokens.
  - **Design**: theme, colour mode, font, layout, density, field and button style, progress, cover, 3D scene, pattern, background media and motion, next to a live preview in phone, tablet and desktop frames.
  - **Logic**: the page flow map with each page break's jumps, every question's visibility rules, the ending rules, the scoring table, and a tester that fills sample answers and shows the route, the score and the ending.
  - **Settings**: language and interface words, schedule, response limit, one response per device, location collection, autosave, notification and receipt emails, scoring, SEO, spam timing, passphrase and an internal note.
  - **Share**: the public link, a QR code (theme or ink colours, optional logo, SVG or PNG), short links made in place through the link shortener (domain, custom code, expiry, passphrase, UTM parameters and hidden-field prefills), embed snippets and share buttons.
  - **Responses**: a windowed table (smooth with ten thousand rows) with pinned, resizable and reorderable columns, type-aware sorting and filters, segments, inline edits, cards and a media gallery, a detail drawer with the visitor's location on a small map, bulk actions, and the lightbox for images, videos and signatures. **Clean data** is a pipeline of non-destructive steps (trim, case, plain-text find and replace with match-case and whole-cell options, fill, standardize, remove duplicates, exclude, split, and computed columns in a small formula language) that feeds the table, the charts and the exports, and can be written back permanently. **Export** writes CSV, TSV, JSON, Excel, Markdown, or a ZIP of every uploaded file.
  - **Analytics**: KPIs against the previous period, traffic over time, the drop-off funnel per question, a weekday by hour heatmap, a world map of views and submissions, breakdowns by country, city, referrer, device, browser, OS, language and UTM source, completion times, one insight card per question, the **analysis lab** (crosstab with chi-square and Cramér's V, a numeric explorer, Pearson and Spearman correlations, scatter with regression, one-way ANOVA) and the visitor log. Charts are hand-drawn SVG (`charts/`) with a table view each, and the statistics are pure functions in `apps/web/src/lib/forms/data/stats.ts`.

The builder's date fields (the schedule, rule values, the logic tester, a question's allowed dates and the responses date filter) use the same pickers in the admin skin (`builder/admin-pickers.tsx`), storing the shapes the native inputs stored; the schedule still converts local time to UTC.

The builder previews a draft through `/admin/forms/preview`, an admin-only page it embeds in an iframe and drives with `postMessage` (`mgm-form-preview:ready`, `:render` with the document, scheme and stage, `:stage` back). The preview never records events or submits.

## The public form

`/forms/[slug]` renders `FormExperience` (`apps/web/src/components/forms/`). The site header hides itself on `/forms`, and the page wears the form's theme on its own root.

- **Stages.** A welcome (the cover, a letter-by-letter title, the estimated time and question count, a magnetic Start button, and a resume prompt when autosaved answers exist), the questions, and the ending (a celebration, the thank-you, the score, share buttons, "submit another" and an optional redirect with a countdown). A passphrase form shows a gate first, and a closed, full or not-yet-open form a designed screen (with a countdown to its opening).
- **Layouts.** Classic pages, whose blocks rise into view as they scroll in, or one question at a time on the keyboard (Enter to continue, letter keys for choices, auto-advance after a single choice).
- **The story.** The brand's Bauhaus shapes start scattered around the form, and each valid answer springs the next one into a poster beside it. At the end the poster completes and the celebration plays (confetti, fireworks, bloom or assemble). The WebGL scenes (`scene/gl/`, three.js, loaded only on form pages) are orbit, constellation, paper and blocks. A DOM version of the same poster runs where WebGL can't (software renderers are refused, as in the articles world), and under reduced motion it holds still.
- **Dates and times** use the custom pickers in `components/forms/controls/` (`date-picker.tsx`, `time-picker.tsx`, `datetime-picker.tsx`), not the native inputs. The field shows the value in the form's language and also takes a typed value, read leniently (26/09/2026, 2026-09-26, "26 Sep 2026", 1430, 2:30 pm); one it can't read is kept as typed, so the shared validators flag it. The panel is a calendar with the APG date picker keys, a month grid and a year list, and hour and minute columns (AM and PM in English), portaled into the form root and a bottom sheet under 640px. Enter inside an open picker picks; closed, it keeps its meaning in the conversational layout. Answers keep their shapes: `YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DDTHH:mm` in local time.
- Answers autosave in the browser, piping and visibility update live, prefills come from URL parameters, and events (view, start, each question answered) are sent with the visitor's language, timezone, screen, UTM parameters and referrer.

## Testing

- `packages/shared` has the logic every layer trusts. The API's specs (`apps/api/src/forms/*.spec.ts`) cover slugs, tokens, upload acceptance, the submission flow, analytics buckets and the admin rate-limit exemption.
- `apps/web/e2e/forms.spec.ts` runs the public form against the CMS fixture server, which serves the forms in `e2e/fixtures/cms/forms.json` shaped like the real API and records submissions at `/__forms-fixture/submissions` so a spec can assert the payload. It covers the classic layout (logic, validation, a page jump, submit), server field errors, the keyboard-only conversational layout, hydration, a 404, the passphrase gate, the closed and not-yet-open screens, reduced motion, dark mode, and the date and time pickers (keyboard picks, min and max, typed values, the submitted shapes, and Enter in the conversational layout).
- Locally the whole stack runs against a MinIO bucket for uploads (`AWS_ENDPOINT_URL`, `AWS_S3_FORCE_PATH_STYLE=true`), so file questions can be tested end to end without production storage.

## Environment

| Variable                 | Service | What it does                                                                                     |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| `FORMS_MAX_UPLOAD_BYTES` | api     | the ceiling for one respondent upload (default 100 MB); a question's own limit can only be lower |

## Gotchas

- **A pattern is a format mask, never a regular expression.** An admin-written expression run by the API on respondent input could hang it. `matchesFormatMask` checks masks character by character (`#` a digit, `A` a letter, `*` either, `?` anything, alternatives separated by `|`).
- **The admin workspace shares one address.** Every admin request reaches the API from the web server, so the global limit of 100 a minute would throttle a response gallery or a files download. Forms admin routes carrying the correct passphrase skip it (`forms-admin.throttle.ts`); wrong passphrases stay throttled.
- **Visitor details are only trusted with the passphrase.** The public routes rate-limit per visitor using the forwarded `x-visitor-ip`, which the API believes only when the request also carries the CMS passphrase, so a direct caller can't invent addresses to dodge the limit.
- **The referrer comes from the page.** The forwarded referer header of a public form request is always the form's own URL, so events and responses store the `document.referrer` the page sends.
- **Image questions check bytes.** Image uploads and signatures accept PNG, JPEG, WebP and GIF, recognized by their first bytes, whatever the file name says.
- **No `loading.tsx` under `/forms`.** A loading boundary streams the page, and an unknown slug would then answer 200 instead of 404.
- **Spam counts differ by place.** The list's response count includes responses flagged as spam, while analytics, the response limit and conversion exclude them.
