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
  const wrongAnswer = () =>
    vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 401 }));
  const location = (response: Response) => response.headers.get("location");

  it("sends a visitor to the rate message from the eleventh attempt and stops calling the API", async () => {
    const fetchSpy = wrongAnswer();
    const { POST } = await load();
    const visitor = { "x-forwarded-for": "203.0.113.7" };

    for (let index = 0; index < 10; index += 1) {
      expect(location(await POST(loginRequest("wrong", visitor)))).toBe("/admin/login?error=1");
    }
    const blocked = await POST(loginRequest("wrong", visitor));
    const other = await POST(loginRequest("wrong", { "x-forwarded-for": "203.0.113.8" }));

    expect(location(blocked)).toBe("/admin/login?error=rate");
    expect(location(other)).toBe("/admin/login?error=1");
    expect(fetchSpy).toHaveBeenCalledTimes(11);
  });

  it("counts a burst of attempts before any of them has finished", async () => {
    const fetchSpy = wrongAnswer();
    const { POST } = await load();
    const visitor = { "x-forwarded-for": "203.0.113.12" };

    const responses = await Promise.all(
      Array.from({ length: 15 }, () => POST(loginRequest("wrong", visitor))),
    );

    expect(
      responses.filter((response) => location(response) === "/admin/login?error=rate"),
    ).toHaveLength(5);
    expect(fetchSpy).toHaveBeenCalledTimes(10);
  });

  it("gives back the place of a right passphrase", async () => {
    wrongAnswer();
    const { POST } = await load();
    const visitor = { "x-forwarded-for": "203.0.113.9" };

    for (let index = 0; index < 9; index += 1) await POST(loginRequest("wrong", visitor));
    expect(location(await POST(loginRequest(PASSPHRASE, visitor)))).toBe("/admin");

    // nine places are used, so one more wrong guess fits and the next one does not
    expect(location(await POST(loginRequest("wrong", visitor)))).toBe("/admin/login?error=1");
    expect(location(await POST(loginRequest("wrong", visitor)))).toBe("/admin/login?error=rate");
  });

  it("keeps the place of a guess when the API does not answer, and says so", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new TypeError("fetch failed");
    });
    const { POST } = await load();
    const visitor = { "x-forwarded-for": "203.0.113.13" };

    for (let index = 0; index < 10; index += 1) {
      expect(location(await POST(loginRequest("wrong", visitor)))).toBe(
        "/admin/login?error=unavailable",
      );
    }

    expect(location(await POST(loginRequest("wrong", visitor)))).toBe("/admin/login?error=rate");
  });

  it("shows a throttle or an error of the API as such and not as a wrong passphrase", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await load();
    const visitor = { "x-forwarded-for": "203.0.113.14" };

    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect(location(await POST(loginRequest("wrong", visitor)))).toBe("/admin/login?error=rate");
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(location(await POST(loginRequest("wrong", visitor)))).toBe(
      "/admin/login?error=unavailable",
    );
  });

  it("does not limit a request with no visitor address, so one caller cannot lock out the rest", async () => {
    wrongAnswer();
    const { POST } = await load();

    for (let index = 0; index < 12; index += 1) {
      expect(location(await POST(loginRequest("wrong")))).toBe("/admin/login?error=1");
    }
  });

  it("sends the visitor address to the verify call with the proof of this server", async () => {
    const fetchSpy = wrongAnswer();
    const { POST } = await load();

    await POST(loginRequest("a-managed-account-passphrase", { "x-forwarded-for": "203.0.113.10" }));

    const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-visitor-ip"]).toBe("203.0.113.10");
    expect(headers["x-cms-passphrase"]).toBe(PASSPHRASE);
  });
});
