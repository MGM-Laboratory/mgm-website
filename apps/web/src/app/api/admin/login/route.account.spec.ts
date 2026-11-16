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

function loginRequest(passphrase: string, headers: Record<string, string> = {}) {
  const body = new FormData();
  body.set("passphrase", passphrase);
  return new Request("http://localhost/api/admin/login", { method: "POST", body, headers });
}

async function load() {
  vi.resetModules();
  return import("./route");
}

describe("POST /api/admin/login with a managed account", () => {
  beforeEach(() => {
    jar.clear();
    vi.stubEnv("ADMIN_PASSPHRASE", "the-superadmin-passphrase");
    vi.stubEnv("SESSION_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("signs the account in with its slug and session version after the API accepts the passphrase", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ account: { slug: "ann", sessionVersion: 3 } }));
    const { POST } = await load();

    const response = await POST(
      loginRequest("account-passphrase", { "x-forwarded-for": "203.0.113.40" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");
    expect(jar.get("mgm_admin_session")).toMatch(/^ann\.3\.\d+\./);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/cms\/admins\/verify$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ passphrase: "account-passphrase" });
  });

  it("gives the place of the attempt back after a right passphrase", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ account: { slug: "ann", sessionVersion: 1 } }),
    );
    const { POST } = await load();
    const visitor = { "x-forwarded-for": "203.0.113.41" };

    for (let index = 0; index < 15; index += 1) {
      expect(
        (await POST(loginRequest("account-passphrase", visitor))).headers.get("location"),
      ).toBe("/admin");
    }
  });

  it("does not sign in when the API accepts the call but names no account", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
    const { POST } = await load();

    const response = await POST(loginRequest("account-passphrase"));

    expect(response.headers.get("location")).toBe("/admin/login?error=unavailable");
    expect(jar.size).toBe(0);
  });
});
