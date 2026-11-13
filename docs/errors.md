# Errors

This page lists the error answers of the API (`apps/api`) and of the route handlers of the web app that sit in front of it. The API has no single error format. Several controllers each make their own, so this page groups them by shape. The API routes start with `/api`. The interactive API documentation is at `/docs`.

A proxy or the platform in front of the site can also answer with its own body, so a client reads the HTTP status first.

## Body shapes

The API sends one of the following bodies.

| Shape                              | Where it comes from                                                                                                                                   | Example                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Nest exception with a text message | Code that throws `BadRequestException`, `NotFoundException`, `ConflictException`, `UnauthorizedException` or `PayloadTooLargeException` with a string | `{"message":"Unknown media key","error":"Bad Request","statusCode":400}`            |
| Plain message and status           | The link shortener, the forms code and the upload checks of `main.ts`, which throw `HttpException` with a string or write the answer themselves       | `{"statusCode":404,"message":"That link does not exist."}`                          |
| Message with field errors          | The forms submission and the contact message                                                                                                          | `{"message":"Some answers need another look.","errors":{"q1":{"code":"required"}}}` |
| Unexpected failure                 | Any error that the code did not plan, including a zod error on a route that parses without a guard                                                    | `{"statusCode":500,"message":"Internal server error"}`                              |
| Health failure                     | `GET /api/health` when the database does not answer                                                                                                   | `{"status":"error","uptime":12.3,"timestamp":"2026-01-01T00:00:00.000Z"}`           |

- The `error` text of the first shape is the standard name of the status, such as `Bad Request` or `Not Found`.
- The forms code puts the first invalid path in front of the message when a document fails validation, for example `document.title:` followed by the message of the schema.
- The contact message answers 400 with `errors` as a map from a field name to a list of messages.
- The global `ValidationPipe` is registered with `whitelist`, `transform` and `forbidNonWhitelisted`. No route declares a class based body, so the pipe validates nothing today. Each handler validates its body with a zod schema from `packages/shared` or from its own file.
- A body that the JSON or raw parser refuses keeps the status of the parser. An invalid JSON body answers 400 and a body above the size limit answers 413, with a `statusCode` and a `message` in the body. The forms upload path answers its own text, see below.

## Validation failures that answer 500

A route that calls `schema.parse(body)` and has no guard turns a zod error into a 500. These routes answer a body that fails validation with `{"statusCode":500,"message":"Internal server error"}`.

- `PUT /api/cms/home`
- `PUT /api/cms/contact-settings`
- `POST /api/cms/admins` and `PUT /api/cms/admins/:slug`
- `POST /api/cms/members/:slug/photo`
- `POST /api/cms/publications/author-photo` and `PUT /api/cms/publications/:slug`
- `PUT /api/cms/jobs/:slug`, `POST /api/cms/jobs/:slug/media`, `PUT /api/cms/jobs/applications/:slug/state` and `POST /api/cms/jobs/applications/bulk`

The public job application and the public event registration catch the zod error and answer 400 with the first issue as the message. The articles, projects, research, events, contact inbox, link shortener and forms routes also answer 400. So does the member save, with the path of the first failing field in front of the message, for example `profile.links.1.url`.

## Status codes

| Status | Meaning in this API                                                                                         | Typical body                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 400    | The body, the key or the file is not valid. Also a storage service that is not set up when a route needs it | A message that names the problem                                          |
| 401    | A missing or wrong admin passphrase, a wrong link passphrase, or a locked form                              | `Unauthorized`, `That passphrase is not right.` or `This form is locked.` |
| 403    | The API never answers 403. The web app answers 403 when an admin session lacks a permission                 | `{"error":"Forbidden"}` from a web route handler                          |
| 404    | The record, the form, the link or the key does not exist, or it is a draft or a hidden paper                | `... not found` or `That ... does not exist.`                             |
| 409    | A slug or a code is taken, a state conflicts, or a form is closed, full or not open yet                     | A message that names the conflict                                         |
| 410    | A short link has expired                                                                                    | `That link has expired.`                                                  |
| 411    | A form respondent upload does not declare its size                                                          | `The upload must declare its size.`                                       |
| 413    | A body or a file is above its limit                                                                         | `The file is too large.` or `File too large` (the CV apply route)         |
| 429    | A rate limit budget is used up                                                                              | `ThrottlerException: Too Many Requests`                                   |
| 500    | An error that the code did not plan                                                                         | `Internal server error`                                                   |
| 502    | A form respondent file cannot be read from storage                                                          | `The file could not be read from storage.`                                |
| 503    | The database does not answer, storage is not set up for a forms route, or the upload slots are busy         | See the sections below                                                    |

## Admin routes

- Every admin route of the API reads the header `x-cms-passphrase`. A missing or wrong value answers 401 with `{"message":"Unauthorized","error":"Unauthorized","statusCode":401}`.
- `POST /api/cms/admins/verify` is public. A wrong passphrase answers 401 with the message `That passphrase does not match.`, and a body with no passphrase or one over 300 characters answers 400 with `A passphrase is required.`.
- The route handlers of the web app under `/api/admin/**` check the session first. They answer 401 `{"error":"Unauthorized"}` when there is no valid session, and 403 `{"error":"Forbidden"}` when the account lacks the permission for the page and the action. Otherwise they relay the status and the JSON body of the API.
- The contact inbox allows only the read action for delegated accounts. Any other action on that page answers 403.
- The web login route answers with a 303 redirect. A wrong passphrase goes to `/admin/login?error=1`.

## Waiting for the API

- The web server waits at most 10 seconds for the answer to a read from the API and 30 seconds for a write. A file that streams through the web server, such as a video, a CV or a form upload, may take up to 30 minutes before the API answers. Only the wait for the response headers is limited, so a long download is not cut off.
- A call that runs out of time fails like a call that cannot connect. The pages that catch an API failure show their empty state, and a route handler that does not catch it answers 500.

## Rate limits

- A blocked request answers 429 with the body `{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}`. The header `Retry-After` holds the seconds to wait. An allowed request carries the headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`.
- The global budget is `THROTTLE_LIMIT` requests (default 100) in `THROTTLE_TTL` milliseconds (default 60000) for each route and each client, see the rate limit notes in `security.md`.
- The routes `POST /api/contact`, `POST /api/cms/jobs/:slug/apply` and `POST /api/cms/events/:slug/register` allow 5 requests a minute.
- The route `POST /api/cms/admins/verify` and the short link routes `GET /api/shortlinks/resolve` and `GET /api/shortlinks/public/:slug` allow 10, 300 and 300 requests a minute for each visitor. The sign in route of the web app redirects to `/admin/login?error=rate` from the eleventh attempt in a minute, and the login page then says `Too many sign in attempts. Wait a minute and try again.`.
- The public form routes allow, for each visitor and each minute, 10 unlocks, 120 events, 30 uploads and 10 responses.

## Uploads

| Route                                    | Limit                                                                   | Errors                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/forms/public/:slug/uploads`   | `FORMS_MAX_UPLOAD_BYTES`, default 100 MB, and the limit of the question | 411 without a `Content-Length`, 413 above the limit, 503 with `Retry-After: 5` when 6 uploads are already in flight, 400 for an empty file, a type that the question does not accept or an image that is not PNG, JPEG, WebP or GIF, 503 when storage is not available |
| `POST /api/cms/jobs/:slug/apply`         | `CMS_MAX_CV_BYTES`, default 100 MB                                      | 400 for a missing CV or a type that is not PDF, DOC or DOCX, 413 above the limit, 409 when the role is closed                                                                                                                                                          |
| `POST /api/contact/attachments`          | 25 MB                                                                   | 400 for an empty body or a file above 25 MB. The raw parser refuses a body above 26 MB with 413                                                                                                                                                                        |
| `POST /api/cms/publications/:slug/paper` | `CMS_MAX_PAPER_BYTES`, default 200 MB                                   | 413 above the limit, from the body parser. 400 for a file that is not a PDF                                                                                                                                                                                            |
| Project, home and form video routes      | `CMS_MAX_VIDEO_BYTES`, default 500 MB                                   | 413 above the limit, from the body parser. 400 for a type that is not MP4 or WebM, or a file that is not a valid video                                                                                                                                                 |
| Image routes of the CMS                  | 6 MB after compression                                                  | 400 for a data URL that does not name a PNG, JPEG or WebP, or for a file above the limit. The author and contributor portrait routes also accept GIF. The form design image route accepts PNG, JPEG, WebP or GIF by the bytes                                          |

A route that stores a file answers 400 with a message such as `Media storage is not configured in this environment.` when no bucket is set. The forms routes answer 503 in that case.

## Forms

- The public routes answer 404 `That form does not exist.` for an unknown slug or a draft.
- A form with a passphrase answers `GET /api/forms/public/:slug` with 200 and the state `locked`. The events, uploads and responses routes answer 401 `This form is locked.` until the visitor unlocks the form. A wrong passphrase on the unlock route answers 401 `That passphrase is not right.`.
- A form that cannot take a response answers 409 with `This form is closed.`, `This form is not open yet.` or `This form has reached its response limit.`.
- A response answers 400 with `errors` when an answer fails its question, 409 `You have already responded to this form.` for the rule of one response for each device, and 409 `One of the files was already submitted.` when two submissions claim one upload.
- The admin routes of the forms workspace answer 404 for an unknown form, response or file, 409 `That form URL is already in use.` for a taken slug, and 503 when the API cannot find a free random slug.

## Link shortener

- `POST /api/shortlinks/verify` answers 404 `That link does not exist.`, 410 `That link has expired.` or 401 `That passphrase is not right.`.
- The admin routes answer 400 for an invalid domain name or URL, 409 `That domain is already added.`, 409 `That short code is already taken on this domain.` and 409 `Delete its N links first.` when a domain still has links.
- A failure to attach a custom domain at the hosting platform answers 400 with the message of the platform API.

## Careers, events and CMS records

- `POST /api/cms/jobs/:slug/apply` answers 400 `That role does not exist.` for an unknown slug and 409 `This role is no longer accepting applications.` for a closed role.
- `POST /api/cms/events/:slug/register` answers 400 `That event does not exist.`, 409 `This event is not accepting registrations.` and 409 `This event has already ended.`.
- A save of an article, a project, a research initiative, a job, a publication, a member or an event answers 409 when its slug is taken, for example `That article URL is already in use.`. A member rename that matches more than one profile answers 409 `More than one existing profile has this name. Please contact an administrator.`.
- A read of an unknown record answers 404 with a message such as `Article record not found`. A draft answers the same 404 on the public routes.
- Several media and file routes answer 400 with `Unknown media key`, `Unknown video key`, `Unknown paper key` or `Unknown attachment key` when the key is not one that the route serves. A publication paper that is hidden, or whose record is a draft, answers 404.

## Public form routes of the web app

The route handlers under `/api/forms/**` of the web app forward to the API and add their own answers.

| Status | Body message                                               | When                                                                |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| 404    | `That form does not exist.`                                | The slug is not a valid form slug                                   |
| 413    | `The request is too large.`                                | An unlock or events body above 64 KB, or a response body above 8 MB |
| 400    | `The request body must be JSON.`                           | The body is not valid JSON                                          |
| 502    | `We could not reach the form right now. Please try again.` | The call to the API failed                                          |
| 413    | `The file is too large.`                                   | An upload declares a size above `FORMS_MAX_UPLOAD_BYTES`            |
| 502    | `The upload could not be completed. Please try again.`     | The upload call to the API failed                                   |

When the API answers with a body that is not JSON, the web app answers `The file is too large.` for a 413 and `Something went wrong on our side. Please try again.` for any other error status.

## Pages of the web app

- A detail page of an article, project, research initiative, publication, event, role or form shows a 404 only when the API answers 404 for the record. The page is the site's own 404 page (`app/not-found.tsx`), except for forms and articles, which have their own `not-found.tsx`. A page that has a `loading.tsx` (articles, events and roles) has already started to stream, so its 404 page comes with the status 200 and a `noindex` tag.
- When the API does not answer, answers with another error status, or times out, the page throws and the visitor sees the error page of `app/error.tsx` with a "Try again" button and a `noindex` tag. The status is 500 when the failure comes before the page starts to stream, and 200 on a page whose `loading.tsx` has already been sent. A failure of the root layout shows `app/global-error.tsx`.
- The `generateViewport` of a detail page treats a failed read as no theme color, because it runs outside the error boundary of the page.
- An address that no page serves is answered by the catch-all route `app/[...slug]/route.ts`. A `GET` that sends `Accept: text/html` gets a small HTML 404 page with a link to the home page. Any other call gets `{"error":"Not Found"}` with the status 404. A `text/html;q=0` entry counts as a refusal of HTML. Both answers carry `Vary: Accept`. This holds on the site's own hosts only. A custom short link host answers with its own plain text or short link page and does not negotiate. A route handler cannot render `app/not-found.tsx`, which is why the HTML page is its own document.
- The feeds that only decorate a page (the next project, the byline members, the photos of a publication) still fall back to an empty list when the API fails, so a failed feed never hides a record that was read.

## Health

`GET /api/health` answers 200 with `{"status":"ok","uptime":...,"timestamp":"..."}`. It answers 503 with `"status":"error"` when the query `SELECT 1` fails.

The web app answers `GET /healthz` with 200 and `{"status":"ok"}` and no `cache-control` caching. It makes no call to the API, so it never answers 503.

The web app answers `POST /api/csp-report` with 204 for a report or a list of reports, 400 for a body that is not JSON and 413 for a body above 8 KB. It reads the body in chunks and stops at the limit, so a body without a declared length gets the 413 as well.
