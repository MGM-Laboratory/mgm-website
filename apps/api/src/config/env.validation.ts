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
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
