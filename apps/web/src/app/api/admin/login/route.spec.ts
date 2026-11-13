import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => jar.delete(name),
  }),
}));

const SECRET = "s".repeat(64);
const PASSPHRASE = "the-admin-passphrase";

function loginRequest(passphrase: string, headers: Record<string, string> = {}) {
  const body = new FormData();
  body.set("passphrase", passphrase);
  return new Request("http://localhost/api/admin/login", { method: "POST", body, headers });
}

async function load() {
  vi.resetModules();
  return import("./route");
}

describe("POST /api/admin/login", () => {
  beforeEach(() => {
    jar.clear();
    vi.stubEnv("ADMIN_PASSPHRASE", PASSPHRASE);
    vi.stubEnv("SESSION_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("signs the superadmin in and redirects with a relative address", async () => {
    const { POST } = await load();

    const response = await POST(loginRequest(PASSPHRASE));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");
    expect(jar.get("mgm_admin_session")).toMatch(/^superadmin\.1\.\d+\./);
  });

  it("answers 503 and logs the missing setting names when the session secret is missing", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));
    const { POST } = await load();

    // A wrong passphrase would reach the verify call if the gate were missing
    const response = await POST(loginRequest("not-the-passphrase"));

    expect(response.status).toBe(503);
    expect(jar.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    const logged = String(error.mock.calls[0]?.[0]);
    expect(logged).toContain("SESSION_SECRET");
    expect(logged).not.toContain(PASSPHRASE);
  });

  it("answers 503 for a short session secret too", async () => {
    vi.stubEnv("SESSION_SECRET", "x".repeat(31));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await load();

    expect((await POST(loginRequest(PASSPHRASE))).status).toBe(503);
  });
  it("answers 429 after ten wrong passphrases from one visitor and stops calling the API", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 401 }));
    const { POST } = await load();
    const visitor = { "x-forwarded-for": "203.0.113.7" };

    for (let index = 0; index < 10; index += 1) {
      const response = await POST(loginRequest("wrong", visitor));
      expect(response.status).toBe(303);
    }
    const blocked = await POST(loginRequest("wrong", visitor));
    const other = await POST(loginRequest("wrong", { "x-forwarded-for": "203.0.113.8" }));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    expect(other.status).toBe(303);
    expect(fetchSpy).toHaveBeenCalledTimes(11);
  });

  it("clears the failures of a visitor after a right passphrase", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(null, { status: 401 }),
    );
    const { POST } = await load();
    const visitor = { "x-forwarded-for": "203.0.113.9" };

    for (let index = 0; index < 9; index += 1) await POST(loginRequest("wrong", visitor));
    await POST(loginRequest(PASSPHRASE, visitor));
    for (let index = 0; index < 9; index += 1) {
      expect((await POST(loginRequest("wrong", visitor))).status).toBe(303);
    }
  });

  it("sends the visitor address to the verify call with the proof of this server", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 401 }));
    const { POST } = await load();

    await POST(loginRequest("a-managed-account-passphrase", { "x-forwarded-for": "203.0.113.10" }));

    const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-visitor-ip"]).toBe("203.0.113.10");
    expect(headers["x-cms-passphrase"]).toBe(PASSPHRASE);
  });
});
