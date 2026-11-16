// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cmsApi } = vi.hoisted(() => ({ cmsApi: vi.fn() }));

vi.mock("@/lib/cms-api", () => ({ apiBaseUrl: () => "http://api.test/api", cmsApi }));

const SLUG = "my-form";
const context = (slug = SLUG) => ({ params: Promise.resolve({ slug }) });

function jsonPost(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/forms/${SLUG}/x`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
  });
}

beforeEach(() => {
  cmsApi.mockReset();
  cmsApi.mockResolvedValue(Response.json({ ok: true }, { status: 201 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  ["events", () => import("./[slug]/events/route")],
  ["responses", () => import("./[slug]/responses/route")],
  ["unlock", () => import("./[slug]/unlock/route")],
] as const)("POST /api/forms/[slug]/%s", (action, load) => {
  async function post(request: Request, slug = SLUG) {
    const { POST } = await load();
    return POST(request, context(slug));
  }

  it.each(["Bad_Slug", "-start", "double--dash", "end-", "a".repeat(81)])(
    "answers 404 for the slug '%s' without asking the API",
    async (slug) => {
      const response = await post(jsonPost({}), slug);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ message: "That form does not exist." });
      expect(cmsApi).not.toHaveBeenCalled();
    },
  );

  it("forwards the parsed body to the public path of the form with the visitor headers", async () => {
    const response = await post(
      jsonPost('{ "a" : 1 }', {
        "x-forwarded-for": "203.0.113.5",
        "user-agent": "TestAgent/1.0",
        referer: "https://labmgm.org/forms/my-form",
      }),
    );

    expect(cmsApi).toHaveBeenCalledWith(`/forms/public/${SLUG}/${action}`, {
      method: "POST",
      body: '{"a":1}',
      headers: {
        "x-visitor-ip": "203.0.113.5",
        "x-visitor-user-agent": "TestAgent/1.0",
        "x-visitor-referer": "https://labmgm.org/forms/my-form",
      },
    });
    expect(response.status).toBe(201);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const response = await post(jsonPost("{nope"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "The request body must be JSON." });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("answers 413 for a body whose declared length is above the limit of the action", async () => {
    const limit = action === "responses" ? 8 * 1024 * 1024 : 64 * 1024;

    const response = await post(jsonPost("{}", { "content-length": String(limit + 1) }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The request is too large." });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("sends the explicit token header and ignores the cookie when both exist", async () => {
    await post(
      jsonPost("{}", { "x-form-token": "explicit", cookie: `mgm_form_${SLUG}=from-cookie` }),
    );

    expect((cmsApi.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      "x-form-token": "explicit",
    });
  });

  it("reads the token of the slug from the cookie and decodes it", async () => {
    await post(
      jsonPost("{}", { cookie: `theme=dark; mgm_form_other=nope; mgm_form_${SLUG}=a%20b%2Bc` }),
    );

    expect((cmsApi.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      "x-form-token": "a b+c",
    });
  });

  it.each([
    ["no cookie", {}],
    ["only a cookie of another form", { cookie: "mgm_form_other=nope" }],
    ["an empty cookie value", { cookie: `mgm_form_${SLUG}=` }],
  ])("sends no token header for %s", async (_label, headers) => {
    await post(jsonPost("{}", headers));

    expect((cmsApi.mock.calls[0]?.[1] as RequestInit).headers).not.toHaveProperty("x-form-token");
  });

  it("relays the status and the JSON of the API", async () => {
    cmsApi.mockResolvedValue(Response.json({ message: "Wrong passphrase." }, { status: 401 }));

    const response = await post(jsonPost("{}"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Wrong passphrase." });
  });

  it("hides an answer that is not JSON behind a friendly message and keeps an error status", async () => {
    cmsApi.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    const response = await post(jsonPost("{}"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "Something went wrong on our side. Please try again.",
    });
  });

  it("turns a success status with a body that is not JSON into 502", async () => {
    cmsApi.mockResolvedValue(new Response("fine", { status: 200 }));

    const response = await post(jsonPost("{}"));

    expect(response.status).toBe(502);
  });

  it("names a too large file when the API answers 413 without JSON", async () => {
    cmsApi.mockResolvedValue(new Response("too big", { status: 413 }));

    const response = await post(jsonPost("{}"));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The file is too large." });
  });

  it("answers 502 when the API cannot be reached", async () => {
    cmsApi.mockRejectedValue(new TypeError("fetch failed"));

    const response = await post(jsonPost("{}"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "We could not reach the form right now. Please try again.",
    });
  });
});

describe("body limits of the public form routes", () => {
  it("refuses a streamed body above 64 KiB for events and accepts it for responses", async () => {
    const big = JSON.stringify({ text: "x".repeat(70_000) });
    const events = await import("./[slug]/events/route");
    const responses = await import("./[slug]/responses/route");

    const refused = await events.POST(jsonPost(big), context());
    const accepted = await responses.POST(jsonPost(big), context());

    expect(refused.status).toBe(413);
    expect(accepted.status).toBe(201);
    expect(cmsApi).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/forms/[slug]/unlock cookie", () => {
  async function unlock(upstream: Response, slug = SLUG) {
    cmsApi.mockResolvedValue(upstream);
    const { POST } = await import("./[slug]/unlock/route");
    return POST(jsonPost({ passphrase: "open sesame" }), context(slug));
  }

  it("keeps the token in an HTTP only cookie of the form and still returns it", async () => {
    const response = await unlock(Response.json({ token: "tok-123" }));

    const cookie = response.cookies.get(`mgm_form_${SLUG}`);
    expect(cookie).toMatchObject({
      value: "tok-123",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60,
      secure: false,
    });
    expect(await response.json()).toEqual({ token: "tok-123" });
  });

  it("marks the cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await unlock(Response.json({ token: "tok-123" }));

    expect(response.cookies.get(`mgm_form_${SLUG}`)?.secure).toBe(true);
  });

  it.each([
    ["no token", Response.json({})],
    ["an empty token", Response.json({ token: "" })],
    ["a token that is not a string", Response.json({ token: 5 })],
  ])("sets no cookie for %s", async (_label, upstream) => {
    const response = await unlock(upstream);

    expect(response.status).toBe(200);
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("sets no cookie when the API refuses the passphrase", async () => {
    const response = await unlock(Response.json({ token: "x" }, { status: 401 }));

    expect(response.status).toBe(401);
    expect(response.cookies.getAll()).toEqual([]);
  });

  it("answers 404 for a bad slug before any call", async () => {
    const response = await unlock(Response.json({ token: "x" }), "Bad_Slug");

    expect(response.status).toBe(404);
    expect(cmsApi).not.toHaveBeenCalled();
  });
});

describe("POST /api/forms/[slug]/uploads", () => {
  async function upload(request: Request, slug = SLUG) {
    const { POST } = await import("./[slug]/uploads/route");
    return POST(request, context(slug));
  }

  function filePost(query: string, headers: Record<string, string> = {}) {
    return new Request(`http://localhost/api/forms/${SLUG}/uploads${query}`, {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
      headers,
    });
  }

  it("answers 404 for a bad slug", async () => {
    const response = await upload(filePost(""), "Bad_Slug");

    expect(response.status).toBe(404);
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("refuses a declared size above the limit of the environment with 413", async () => {
    vi.stubEnv("FORMS_MAX_UPLOAD_BYTES", "1000");

    const response = await upload(filePost("", { "content-length": "1001" }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The file is too large." });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("uses a limit of 100 MiB when the environment sets none", async () => {
    const response = await upload(filePost("", { "content-length": String(104_857_601) }));

    expect(response.status).toBe(413);
  });

  it("streams the file with only the known query keys and the headers of the file", async () => {
    const request = filePost("?fieldId=f1&sessionId=s1&evil=1", {
      "content-type": "application/pdf",
      "content-length": "3",
      "x-file-name": "cv%20final.pdf",
      "x-forwarded-for": "203.0.113.9",
      cookie: `mgm_form_${SLUG}=tok`,
    });

    const response = await upload(request);

    const [path, init] = cmsApi.mock.calls[0] as [string, RequestInit & { duplex?: string }];
    expect(path).toBe(`/forms/public/${SLUG}/uploads?fieldId=f1&sessionId=s1`);
    expect(init.method).toBe("POST");
    expect(init.duplex).toBe("half");
    expect(init.body).toBe(request.body);
    expect(init.headers).toEqual({
      "x-visitor-ip": "203.0.113.9",
      "x-form-token": "tok",
      "content-type": "application/pdf",
      "content-length": "3",
      "x-file-name": "cv%20final.pdf",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("falls back to an octet stream and sends no length or file name when the request has none", async () => {
    await upload(filePost("?fieldId=f1"));

    const headers = (cmsApi.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/octet-stream");
    expect(headers).not.toHaveProperty("x-file-name");
  });

  it("answers 502 when the API cannot be reached", async () => {
    cmsApi.mockRejectedValue(new TypeError("fetch failed"));

    const response = await upload(filePost("?fieldId=f1"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "The upload could not be completed. Please try again.",
    });
  });

  it("relays an error of the API with JSON", async () => {
    cmsApi.mockResolvedValue(Response.json({ message: "Not allowed." }, { status: 403 }));

    const response = await upload(filePost("?fieldId=f1"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Not allowed." });
  });
});

describe("GET /api/forms/media/[key]", () => {
  const KEY = "form-abc123-0123abcd-0123-4567-89ab-0123456789ab.png";

  async function get(key = KEY) {
    const { GET } = await import("./media/[key]/route");
    return GET(new Request("http://localhost/api/forms/media/x"), {
      params: Promise.resolve({ key }),
    });
  }

  it.each([
    "form-abc-not-a-uuid.png",
    "../secret.png",
    "form-abc123-0123abcd-0123-4567-89ab-0123456789ab.exe",
    "Form-abc123-0123abcd-0123-4567-89ab-0123456789ab.png",
  ])("answers 404 for the key '%s' without asking the API", async (key) => {
    const response = await get(key);

    expect(response.status).toBe(404);
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("redirects with 302 to the signed address and lets the browser keep the hop for 5 minutes", async () => {
    cmsApi.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://store.example/obj?sig=1" } }),
    );

    const response = await get();

    expect(cmsApi).toHaveBeenCalledWith(`/forms/media/${KEY}`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://store.example/obj?sig=1");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("answers 404 when the API answers 200 and not with a redirect", async () => {
    cmsApi.mockResolvedValue(new Response("bytes", { status: 200 }));

    expect((await get()).status).toBe(404);
  });

  it.each([404, 500])("keeps the status %i of the API", async (status) => {
    cmsApi.mockResolvedValue(new Response(null, { status }));

    expect((await get()).status).toBe(status);
  });

  it("does not redirect when the API answers 302 without a location", async () => {
    cmsApi.mockResolvedValue(new Response(null, { status: 302 }));

    const response = await get();

    // The status is not pinned. A redirect with no target is broken, and only the missing location matters here.
    expect(response.headers.has("location")).toBe(false);
  });

  it("answers 502 when the API cannot be reached", async () => {
    cmsApi.mockRejectedValue(new TypeError("fetch failed"));

    expect((await get()).status).toBe(502);
  });
});
