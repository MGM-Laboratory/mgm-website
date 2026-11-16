// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return (await import("./env")).env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env", () => {
  it("uses the API url that is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.labmgm.test/api");

    expect((await load()).NEXT_PUBLIC_API_URL).toBe("https://api.labmgm.test/api");
  });

  it("falls back to the local API when it is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);

    expect((await load()).NEXT_PUBLIC_API_URL).toBe("http://localhost:4000/api");
  });

  it("falls back too when it is an empty string, like an unset CI build arg", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");

    expect((await load()).NEXT_PUBLIC_API_URL).toBe("http://localhost:4000/api");
  });

  it("refuses a value that is not a URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "not a url");

    await expect(load()).rejects.toThrow();
  });
});
