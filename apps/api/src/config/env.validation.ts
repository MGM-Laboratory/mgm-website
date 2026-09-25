import { z } from "zod";

function optionalString<T extends z.ZodType<string>>(schema: T = z.string() as unknown as T) {
  return z.preprocess((value: unknown) => (value === "" ? undefined : value), schema.optional());
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // The public web app's own origin - used to build absolute asset/link URLs
  // in outgoing emails, which (unlike a browser) can't resolve relative
  // paths against "the site the user is on".
  PUBLIC_WEB_URL: z.url().default("https://web-production-589d3f.up.railway.app"),
  THROTTLE_TTL: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  ADMIN_PASSPHRASE: z.string().min(1, "ADMIN_PASSPHRASE is required"),
  REDIS_URL: optionalString(z.url()),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_S3_BUCKET: optionalString(),
  AWS_ACCESS_KEY_ID: optionalString(),
  AWS_SECRET_ACCESS_KEY: optionalString(),
  AWS_ENDPOINT_URL: optionalString(z.url()),
  AWS_S3_FORCE_PATH_STYLE: z
    .preprocess((value: unknown) => value === "true", z.boolean())
    .default(false),
  // Largest accepted publication paper upload, in bytes (200 MB by default).
  CMS_MAX_PAPER_BYTES: z.coerce.number().int().positive().max(1_073_741_824).default(209_715_200),
  // Largest accepted project demo video upload, in bytes (500 MB by default).
  CMS_MAX_VIDEO_BYTES: z.coerce.number().int().positive().max(1_073_741_824).default(524_288_000),
  // Largest accepted job application CV upload, in bytes (100 MB by default).
  CMS_MAX_CV_BYTES: z.coerce.number().int().positive().max(1_073_741_824).default(104_857_600),
  SES_FROM_EMAIL: optionalString(z.email()),
  // Display name paired with SES_FROM_EMAIL for the "From" header, shared
  // across whichever provider actually sends (Resend/SMTP/SES all accept
  // the same "Name <email>" format) — kept separate because SES_FROM_EMAIL
  // itself must stay a bare address (validated as one, and some callers
  // pass it as SES's raw `Source` field).
  MAIL_FROM_NAME: optionalString(),
  RESEND_API_KEY: optionalString(),
  SMTP_HOST: optionalString(),
  SMTP_PORT: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().int().positive().max(65535).optional(),
  ),
  SMTP_USER: optionalString(),
  SMTP_PASSWORD: optionalString(),
  SMTP_SECURE: z.preprocess((value: unknown) => value === "true", z.boolean()).default(false),
  // --- Link shortener ---
  // The site's own domain, where short links live under /s/:slug.
  SHORTLINKS_PRIMARY_DOMAIN: z.string().min(1).default("labmgm.org"),
  // Where custom short domains' DNS records point (the web service's
  // Railway domain).
  SHORTLINKS_CNAME_TARGET: z.string().min(1).default("web-production-589d3f.up.railway.app"),
  // Railway service ids for attaching custom short domains to the web
  // service, only used when RAILWAY_API_TOKEN is configured. The project and
  // environment ids default to this deployment's production values, and on
  // Railway the platform's injected variables take over, so a preview
  // environment attaches domains to itself rather than to production.
  SHORTLINKS_WEB_SERVICE_ID: z.string().min(1).default("4969778e-0bff-4200-9472-6b5a13f037da"),
  SHORTLINKS_RAILWAY_PROJECT_ID: z
    .string()
    .min(1)
    .default(process.env.RAILWAY_PROJECT_ID ?? "810d3a40-d9d2-410c-b117-289d2aff095f"),
  SHORTLINKS_RAILWAY_ENV_ID: z
    .string()
    .min(1)
    .default(process.env.RAILWAY_ENVIRONMENT_ID ?? "42acf786-e8f4-41f8-8d4f-715bee1655f8"),
  RAILWAY_API_TOKEN: optionalString(),
  // --- Domain Connect (the one-click Cloudflare DNS setup) ---
  // The provider identity registered with Cloudflare's Domain Connect
  // onboarding (template PR + email). The private key signs each sync
  // request; its public half is published as the chunked TXT records at
  // DOMAIN_CONNECT_KEY_ID.<DOMAIN_CONNECT_PROVIDER_ID>.
  DOMAIN_CONNECT_PROVIDER_ID: z.string().min(1).default("labmgm.org"),
  DOMAIN_CONNECT_SERVICE_ID: z.string().min(1).default("shortlinks"),
  DOMAIN_CONNECT_PRIVATE_KEY: optionalString(z.string().min(1)),
  DOMAIN_CONNECT_KEY_ID: z.string().min(1).default("_dcpubkeyv1"),
  DOMAIN_CONNECT_REDIRECT_URL: z.url().default("https://labmgm.org/admin"),
  // Fallback for the sync UX prefix when the provider's settings document
  // cannot be reached.
  DOMAIN_CONNECT_SYNC_URL: z.url().default("https://cloudflare.com/cdn-cgi/domain-connect"),
  // 32-byte hex key that encrypts Cloudflare API tokens at rest; without
  // it, saving a Cloudflare token is refused rather than stored in plain.
  SHORTLINKS_ENCRYPTION_KEY: optionalString(z.string().regex(/^[0-9a-f]{64}$/)),
  // IP geolocation enrichment for link visits (ipwho.is, no API key).
  SHORTLINKS_GEOLOCATE: z
    .preprocess((value: unknown) => value !== "false", z.boolean())
    .default(true),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
