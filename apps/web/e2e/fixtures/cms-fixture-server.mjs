/**
 * A dependency-free stand-in for the CMS API's public project and article
 * reads, for the Playwright suite (playwright.config.ts starts it as a
 * webServer, and the web server's CMS_API_URL points at it). CI serves the
 * web build without an API, so without this /projects and /articles only
 * ever showed their empty states and every detail page was a 404.
 *
 * It answers only what the public project and article pages read, from the
 * records in cms/projects.json and cms/articles.json and the files in
 * cms/media/, shaped like the NestJS API
 * (apps/api/src/cms/cms-projects.controller.ts, cms-articles.controller.ts):
 *
 *   GET /api/cms/projects              { records } (published, with bodies)
 *   GET /api/cms/projects/feed         { records } (published, body [])
 *   GET /api/cms/projects/:slug        { record } plus measured mediaSizes, or a 404
 *   GET /api/cms/projects/media/:key   302 to /files/<key> on this server
 *   GET /api/cms/projects/video/:key   302 likewise (published videos only)
 *   GET /api/cms/articles              { records } (published, with content)
 *   GET /api/cms/articles/feed         { records } (published, content [])
 *   GET /api/cms/articles/:slug        { record }, or a 404
 *   GET /api/cms/articles/media/:key   302 to /files/<key> on this server
 *   GET /files/:key                    the file itself, with Range support
 *   GET /__cms-fixture                 readiness (the real API 404s it, so a
 *                                      busy port fails loudly instead of
 *                                      being reused)
 *
 * Every other request, the admin list included, gets its connection dropped
 * without a response. Server-side fetch() then rejects exactly as it does
 * when nothing listens on the port, so every other page renders as it did
 * without an API. A 404 would not: several readers treat a 404 as "empty"
 * but a failed fetch as an error (the careers feed route answers 503 for
 * one and 200 for the other, for example).
 *
 * Environment: CMS_FIXTURE_PORT (default 4000, where CI's build points).
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.CMS_FIXTURE_PORT ?? "4000");
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:${PORT}`;
const ROOT = fileURLToPath(new URL("./cms/", import.meta.url));
const MEDIA_DIR = path.join(ROOT, "media");

// The API's own key shapes (the web media routes validate the same ones).
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_KEY_PATTERN =
  /^project-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;
const ARTICLE_MEDIA_KEY_PATTERN =
  /^article-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/;
const VIDEO_KEY_PATTERN =
  /^demo-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|webm)$/;
// Named routes the API serves under /cms/projects and /cms/articles that are not a record.
const RESERVED_SLUGS = new Set(["admin", "feed", "bootstrap", "contributor-photo", "media"]);

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const { records } = JSON.parse(readFileSync(path.join(ROOT, "projects.json"), "utf8"));
const published = records.filter((record) => record.project.draft !== true);
const articles = JSON.parse(readFileSync(path.join(ROOT, "articles.json"), "utf8")).records.filter(
  (record) => record.article.draft !== true,
);

/** Width and height from a baseline or progressive JPEG's frame header. */
function jpegSize(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return undefined;
}

function mediaFile(key) {
  const file = path.join(MEDIA_DIR, key);
  // Keys never contain a separator (the patterns above), but stay inside the folder anyway.
  if (path.dirname(file) !== MEDIA_DIR || !existsSync(file)) return undefined;
  return file;
}

/**
 * Pixel sizes of the images a record stores without one (the cover, the
 * gallery and sized-0 media sections), measured from the files, as the API
 * does with sharp.
 */
function mediaSizesOf(project) {
  const keys = new Set();
  if (project.coverKey) keys.add(project.coverKey);
  for (const key of project.galleryKeys ?? []) keys.add(key);
  for (const item of project.media ?? []) {
    if (item.kind === "image" && !item.width) keys.add(item.key);
  }
  const sizes = {};
  for (const key of keys) {
    const file = MEDIA_KEY_PATTERN.test(key) ? mediaFile(key) : undefined;
    const size = file && /\.jpe?g$/.test(key) ? jpegSize(readFileSync(file)) : undefined;
    if (size) sizes[key] = size;
  }
  return sizes;
}

function videoIsPublished(key) {
  return published.some(
    ({ project }) =>
      project.videoKey === key || (project.media ?? []).some((item) => item.key === key),
  );
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

/** NestJS's default error body. */
function sendError(response, status, message) {
  const error = status === 404 ? "Not Found" : "Bad Request";
  sendJson(response, status, { message, error, statusCode: status });
}

function redirectToFile(response, key) {
  response.writeHead(302, { location: `${ORIGIN}/files/${encodeURIComponent(key)}` });
  response.end();
}

/** Streams a media file, honouring a single `bytes=` range as storage does. */
function sendFile(request, response, key) {
  const file = mediaFile(key);
  if (!file) return sendError(response, 404, "Not found");
  const size = statSync(file).size;
  const headers = {
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
    "content-type": CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
  if (!range) {
    response.writeHead(200, { ...headers, "content-length": size });
    if (request.method === "HEAD") return response.end();
    return createReadStream(file).pipe(response);
  }
  let start = range[1] === "" ? undefined : Number(range[1]);
  let end = range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (start === undefined) {
    // A suffix range: the last N bytes.
    start = Math.max(0, size - Number(range[2]));
    end = size - 1;
  }
  if (start > end || start >= size) {
    response.writeHead(416, { ...headers, "content-range": `bytes */${size}` });
    return response.end();
  }
  response.writeHead(206, {
    ...headers,
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${size}`,
  });
  if (request.method === "HEAD") return response.end();
  return createReadStream(file, { start, end }).pipe(response);
}

/** The article reads; returns false for anything it doesn't serve. */
function articleRoute(response, rest) {
  if (rest.length === 0) {
    sendJson(response, 200, { records: articles });
    return true;
  }
  if (rest.length === 1 && rest[0] === "feed") {
    sendJson(response, 200, { records: articles.map((record) => ({ ...record, content: [] })) });
    return true;
  }
  if (rest.length === 2 && rest[0] === "media") {
    if (!ARTICLE_MEDIA_KEY_PATTERN.test(rest[1])) sendError(response, 400, "Unknown media key");
    else redirectToFile(response, rest[1]);
    return true;
  }
  if (rest.length === 1 && SLUG_PATTERN.test(rest[0]) && !RESERVED_SLUGS.has(rest[0])) {
    const record = articles.find((entry) => entry.slug === rest[0]);
    if (!record) sendError(response, 404, "Article record not found");
    else sendJson(response, 200, { record });
    return true;
  }
  return false;
}

/** Handles the routes above; returns false for anything it doesn't serve. */
function route(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const { pathname } = new URL(request.url ?? "/", ORIGIN);
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (pathname === "/__cms-fixture") {
    sendJson(response, 200, { fixture: "cms", records: published.length, articles: articles.length });
    return true;
  }
  if (parts[0] === "files" && parts.length === 2) {
    sendFile(request, response, parts[1]);
    return true;
  }
  if (parts[0] === "api" && parts[1] === "cms" && parts[2] === "articles") {
    return articleRoute(response, parts.slice(3));
  }
  if (parts[0] !== "api" || parts[1] !== "cms" || parts[2] !== "projects") return false;
  const rest = parts.slice(3);

  if (rest.length === 0) {
    sendJson(response, 200, { records: published });
    return true;
  }
  if (rest.length === 1 && rest[0] === "feed") {
    sendJson(response, 200, { records: published.map((record) => ({ ...record, body: [] })) });
    return true;
  }
  if (rest.length === 2 && rest[0] === "media") {
    if (!MEDIA_KEY_PATTERN.test(rest[1])) sendError(response, 400, "Unknown media key");
    else redirectToFile(response, rest[1]);
    return true;
  }
  if (rest.length === 2 && rest[0] === "video") {
    if (!VIDEO_KEY_PATTERN.test(rest[1])) sendError(response, 400, "Unknown video key");
    else if (!videoIsPublished(rest[1])) sendError(response, 400, "Project record not found");
    else redirectToFile(response, rest[1]);
    return true;
  }
  if (rest.length === 1 && SLUG_PATTERN.test(rest[0]) && !RESERVED_SLUGS.has(rest[0])) {
    const record = published.find((entry) => entry.slug === rest[0]);
    if (!record) sendError(response, 404, "Project record not found");
    else
      sendJson(response, 200, { record: { ...record, mediaSizes: mediaSizesOf(record.project) } });
    return true;
  }
  return false;
}

const server = createServer((request, response) => {
  try {
    if (route(request, response)) return;
  } catch (error) {
    console.error("[cms-fixture]", request.method, request.url, error);
  }
  // Not served here: drop the connection, as if no API were listening.
  request.socket.destroy();
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `[cms-fixture] ${HOST}:${PORT} is already in use (a local API?). ` +
        "Set CMS_FIXTURE_PORT to a free port for the Playwright run.",
    );
  } else {
    console.error("[cms-fixture]", error);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[cms-fixture] ${published.length} projects, ${articles.length} articles on ${ORIGIN}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
