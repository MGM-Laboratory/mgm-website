/**
 * The request and response headers that must never reach the log. The web app sends the admin passphrase in
 * `x-cms-passphrase` on every call, so the default request serializer would write it to every log line.
 */
export const REDACTED_HEADER_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-cms-passphrase"]',
  'req.headers["x-form-token"]',
  'res.headers["set-cookie"]',
];

/** The option for the request logger. The app module and the test both use this object, so they cannot drift apart. */
export const LOG_REDACT = { paths: REDACTED_HEADER_PATHS, censor: "[redacted]" };
