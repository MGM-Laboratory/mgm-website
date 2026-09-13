import { z } from "zod";

function optionalString<T extends z.ZodType<string>>(schema: T = z.string() as unknown as T) {
  return z.preprocess((value: unknown) => (value === "" ? undefined : value), schema.optional());
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
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
  CMS_LOCAL_MEDIA_DIR: optionalString(),
  SES_FROM_EMAIL: optionalString(z.email()),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
