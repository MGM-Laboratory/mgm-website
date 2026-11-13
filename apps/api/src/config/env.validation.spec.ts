import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.validation.js";

const base = {
  DATABASE_URL: "postgresql://user@localhost:5432/example",
  ADMIN_PASSPHRASE: "passphrase",
};

describe("SESSION_SECRET", () => {
  it("is required", () => {
    expect(() => validateEnv(base)).toThrow(/SESSION_SECRET/);
  });

  it("needs at least 32 characters", () => {
    expect(() => validateEnv({ ...base, SESSION_SECRET: "a".repeat(31) })).toThrow(
      /SESSION_SECRET/,
    );
    expect(validateEnv({ ...base, SESSION_SECRET: "a".repeat(32) }).SESSION_SECRET).toHaveLength(
      32,
    );
  });
});
