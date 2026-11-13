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
