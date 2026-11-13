import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock runs before the rest of the file, so the spy has to be made in a hoisted block
const { fetchWithTimeout } = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(async () => new Response("{}")),
}));

vi.mock("@/lib/fetch-timeout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fetch-timeout")>()),
  fetchWithTimeout,
}));

import {
  API_READ_TIMEOUT_MS,
  API_UPLOAD_TIMEOUT_MS,
  API_WRITE_TIMEOUT_MS,
} from "@/lib/fetch-timeout";

import { cmsApi } from "./cms-api";

function lastTimeout() {
  const call = fetchWithTimeout.mock.calls.at(-1) as unknown as [string, RequestInit, number];
  return call[2];
}

describe("cmsApi", () => {
  beforeEach(() => {
    fetchWithTimeout.mockClear();
  });

  it("gives a read the read limit", async () => {
    await cmsApi("/cms/articles");

    expect(lastTimeout()).toBe(API_READ_TIMEOUT_MS);
  });

  it("gives a write with a body in memory the write limit", async () => {
    await cmsApi("/cms/articles/a", { method: "PUT", body: "{}" });

    expect(lastTimeout()).toBe(API_WRITE_TIMEOUT_MS);
  });

  it("gives a streamed body the upload limit, because the API answers after it stored the file", async () => {
    await cmsApi("/cms/forms/uploads", {
      method: "POST",
      body: new ReadableStream(),
      duplex: "half",
    } as RequestInit);

    expect(lastTimeout()).toBe(API_UPLOAD_TIMEOUT_MS);
  });

  it("sends the passphrase and never caches", async () => {
    vi.stubEnv("ADMIN_PASSPHRASE", "a-passphrase-for-the-test");
    await cmsApi("/cms/articles");

    const call = fetchWithTimeout.mock.calls.at(-1) as unknown as [string, RequestInit, number];
    expect(call[1].cache).toBe("no-store");
    expect((call[1].headers as Record<string, string>)["x-cms-passphrase"]).toBe(
      "a-passphrase-for-the-test",
    );
    vi.unstubAllEnvs();
  });
});
