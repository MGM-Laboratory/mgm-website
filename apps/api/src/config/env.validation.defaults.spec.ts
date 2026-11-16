import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.validation.js";

const base = {
  ADMIN_PASSPHRASE: "passphrase",
  DATABASE_URL: "postgresql://user@localhost:5432/example",
  SESSION_SECRET: "s".repeat(32),
};

describe("validateEnv defaults", () => {
  it("fills the defaults for everything that is optional", () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({
      AWS_REGION: "us-east-1",
      AWS_S3_FORCE_PATH_STYLE: false,
      CORS_ORIGIN: "http://localhost:3000",
      FORMS_MAX_UPLOAD_BYTES: 104_857_600,
      NODE_ENV: "development",
      PORT: 4000,
      SHORTLINKS_GEOLOCATE: true,
      SHORTLINKS_PRIMARY_DOMAIN: "labmgm.org",
      SMTP_SECURE: false,
      THROTTLE_LIMIT: 100,
      THROTTLE_TTL: 60_000,
    });
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.TRUST_PROXY).toBeUndefined();
  });

  it("treats an empty string as unset for the optional settings", () => {
    const env = validateEnv({
      ...base,
      AWS_S3_BUCKET: "",
      REDIS_URL: "",
      SES_FROM_EMAIL: "",
      SMTP_PORT: "",
      TRUST_PROXY: "",
    });
    expect(env.AWS_S3_BUCKET).toBeUndefined();
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.SES_FROM_EMAIL).toBeUndefined();
    expect(env.SMTP_PORT).toBeUndefined();
    expect(env.TRUST_PROXY).toBeUndefined();
  });

  it("requires the database URL and the admin passphrase", () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: "" })).toThrow(/DATABASE_URL is required/);
    expect(() => validateEnv({ ...base, ADMIN_PASSPHRASE: "" })).toThrow(
      /ADMIN_PASSPHRASE is required/,
    );
  });

  it("turns the string flags into booleans", () => {
    expect(
      validateEnv({ ...base, AWS_S3_FORCE_PATH_STYLE: "true", SMTP_SECURE: "true" }),
    ).toMatchObject({
      AWS_S3_FORCE_PATH_STYLE: true,
      SMTP_SECURE: true,
    });
    expect(validateEnv({ ...base, SHORTLINKS_GEOLOCATE: "false" }).SHORTLINKS_GEOLOCATE).toBe(
      false,
    );
    expect(validateEnv({ ...base, SHORTLINKS_GEOLOCATE: "anything" }).SHORTLINKS_GEOLOCATE).toBe(
      true,
    );
  });

  it("coerces numbers and refuses bad ones", () => {
    expect(validateEnv({ ...base, PORT: "8080", SMTP_PORT: "2525" })).toMatchObject({
      PORT: 8080,
      SMTP_PORT: 2525,
    });
    expect(() => validateEnv({ ...base, PORT: "0" })).toThrow(/PORT/);
    expect(() => validateEnv({ ...base, SMTP_PORT: "70000" })).toThrow(/SMTP_PORT/);
    expect(() => validateEnv({ ...base, FORMS_MAX_UPLOAD_BYTES: "2000000000" })).toThrow(
      /FORMS_MAX_UPLOAD_BYTES/,
    );
    expect(() => validateEnv({ ...base, CMS_MAX_VIDEO_BYTES: "-1" })).toThrow(
      /CMS_MAX_VIDEO_BYTES/,
    );
  });

  it("checks URLs, the sender address and the encryption key shape", () => {
    expect(() => validateEnv({ ...base, PUBLIC_WEB_URL: "not a url" })).toThrow(/PUBLIC_WEB_URL/);
    expect(() => validateEnv({ ...base, SES_FROM_EMAIL: "nope" })).toThrow(/SES_FROM_EMAIL/);
    expect(() => validateEnv({ ...base, SHORTLINKS_ENCRYPTION_KEY: "abc" })).toThrow(
      /SHORTLINKS_ENCRYPTION_KEY/,
    );
    expect(
      validateEnv({ ...base, SHORTLINKS_ENCRYPTION_KEY: "a".repeat(64) }).SHORTLINKS_ENCRYPTION_KEY,
    ).toHaveLength(64);
  });

  it("accepts a trust proxy list and refuses a value that trusts every caller", () => {
    expect(validateEnv({ ...base, TRUST_PROXY: "loopback, 10.0.0.0/8" }).TRUST_PROXY).toBe(
      "loopback, 10.0.0.0/8",
    );
    expect(validateEnv({ ...base, TRUST_PROXY: "2" }).TRUST_PROXY).toBe("2");
    expect(() => validateEnv({ ...base, TRUST_PROXY: "true" })).toThrow(/TRUST_PROXY/);
    expect(() => validateEnv({ ...base, TRUST_PROXY: "11" })).toThrow(/between 1 and 10/);
  });

  it("names every problem in one error", () => {
    let message = "";
    try {
      validateEnv({});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^Invalid environment variables/);
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("ADMIN_PASSPHRASE");
    expect(message).toContain("SESSION_SECRET");
  });
});
