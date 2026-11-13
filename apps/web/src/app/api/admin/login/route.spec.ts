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

function loginRequest(passphrase: string) {
  const body = new FormData();
  body.set("passphrase", passphrase);
  return new Request("http://localhost/api/admin/login", { method: "POST", body });
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
});
