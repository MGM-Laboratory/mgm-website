import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminPermission, cmsApi, fetchWithTimeout } = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  cmsApi: vi.fn(),
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@/lib/admin-session", () => ({
  requireAdminPermission,
  requireSuperadmin: vi.fn(),
}));
vi.mock("@/lib/cms-api", () => ({ apiBaseUrl: () => "http://api.test/api", cmsApi }));
vi.mock("@/lib/fetch-timeout", () => ({
  API_READ_TIMEOUT_MS: 10_000,
  API_UPLOAD_TIMEOUT_MS: 1_800_000,
  API_WRITE_TIMEOUT_MS: 30_000,
  fetchWithTimeout,
}));

const PASSPHRASE = "the-admin-passphrase";

function allow() {
  requireAdminPermission.mockResolvedValue({ status: 200, session: { role: "admin" } });
}

function jsonPost(body: unknown) {
  return new Request("http://localhost/api/admin/x", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function rawPost(contentType: string | null, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/x", {
    method: "POST",
    // A string body would make the Request add text/plain, so a null type needs a body that sets none
    body: new Uint8Array([1, 2, 3]),
    headers: { ...(contentType === null ? {} : { "content-type": contentType }), ...headers },
  });
}

const context = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

beforeEach(() => {
  requireAdminPermission.mockReset();
  cmsApi.mockReset();
  fetchWithTimeout.mockReset();
  vi.stubEnv("ADMIN_PASSPHRASE", PASSPHRASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/admin/members/[slug]/photo", () => {
  async function post(body: unknown, slug = "ann lee") {
    const { POST } = await import("./members/[slug]/photo/route");
    return POST(jsonPost(body), context({ slug }));
  }

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ])("answers %i before it reads the body", async (status, error) => {
    requireAdminPermission.mockResolvedValue({ status });

    const response = await post("not json");

    expect(requireAdminPermission).toHaveBeenCalledWith("members", "write");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it.each([
    ["a string that is no image", "https://x/y.png"],
    ["a number", 12],
    ["nothing", undefined],
  ])("refuses %s with 400", async (_label, image) => {
    allow();

    const response = await post({ image });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Choose a valid PNG, JPEG, or WebP image." });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("refuses a portrait above the size margin with 413 and accepts one at the margin", async () => {
    allow();
    cmsApi.mockResolvedValue(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    const prefix = "data:image/png;base64,";

    const tooLarge = await post({ image: prefix + "A".repeat(5_600_000 - prefix.length + 1) });
    expect(tooLarge.status).toBe(413);
    expect(cmsApi).not.toHaveBeenCalled();

    const atMargin = await post({ image: prefix + "A".repeat(5_600_000 - prefix.length) });
    expect(atMargin.status).toBe(200);
  });

  it("forwards the portrait with the encoded slug and relays status, body and content type", async () => {
    allow();
    cmsApi.mockResolvedValue(
      new Response('{"key":"member-1.png"}', {
        status: 201,
        headers: { "content-type": "application/vnd.test+json" },
      }),
    );
    const payload = { image: "data:image/webp;base64,AAAA" };

    const response = await post(payload);

    expect(cmsApi).toHaveBeenCalledWith("/cms/members/ann%20lee/photo", {
      body: JSON.stringify(payload),
      method: "POST",
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/vnd.test+json");
    expect(await response.text()).toBe('{"key":"member-1.png"}');
  });

  it("says JSON when the API sent no content type", async () => {
    allow();
    const bare = { text: async () => "{}", headers: new Headers(), status: 200 };
    cmsApi.mockResolvedValue(bare);

    const response = await post({ image: "data:image/png;base64,AAAA" });

    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("answers with the reason when the body is not JSON", async () => {
    allow();

    const response = await post("not json");

    // The status is not pinned on purpose. A body that is not JSON is bad client input, and the route
    // may answer 4xx for it later without breaking the message that the admin sees.
    const { error } = (await response.json()) as { error: string };
    expect(error).toMatch(/^Portrait upload could not be completed: /);
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("answers 502 with a plain message when the API call throws something that is not an error", async () => {
    allow();
    cmsApi.mockRejectedValue("down");

    const response = await post({ image: "data:image/png;base64,AAAA" });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Portrait upload could not be completed. Please try again.",
    });
  });

  it("answers 502 with the message of an error from the API call", async () => {
    allow();
    cmsApi.mockRejectedValue(new Error("socket closed"));

    const response = await post({ image: "data:image/png;base64,AAAA" });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Portrait upload could not be completed: socket closed",
    });
  });
});

describe("POST /api/admin/projects/[slug]/video", () => {
  async function post(request: Request, slug = "demo") {
    const { POST } = await import("./projects/[slug]/video/route");
    return POST(request, context({ slug }));
  }

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ])("answers %i and does not look at the body", async (status, error) => {
    requireAdminPermission.mockResolvedValue({ status });

    const response = await post(rawPost("video/mp4"));

    expect(requireAdminPermission).toHaveBeenCalledWith("projects", "write");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });

  it.each(["image/png", "video/quicktime", "video/mp4; codecs=avc1", ""])(
    "refuses the content type '%s' with 400",
    async (contentType) => {
      allow();
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("must not be called"));

      const response = await post(rawPost(contentType));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        message: "The demo video must be an MP4 or WebM file.",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("refuses a declared size above the limit of the environment with 413", async () => {
    allow();
    vi.stubEnv("CMS_MAX_VIDEO_BYTES", String(2 * 1024 * 1024));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("must not be called"));

    const response = await post(
      rawPost("video/webm", { "content-length": String(3 * 1024 * 1024) }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The video must be under 2 MB." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses a limit of 500 MB when the environment sets none", async () => {
    allow();
    vi.stubEnv("CMS_MAX_VIDEO_BYTES", undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("must not be called"));

    const response = await post(rawPost("video/mp4", { "content-length": String(524_288_001) }));

    expect(response.status).toBe(413);
    expect(((await response.json()) as { message: string }).message).toBe(
      "The video must be under 500 MB.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("streams the body to the API with the passphrase and relays the answer", async () => {
    allow();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ key: "demo-1.mp4" }, { status: 201 }));
    const request = rawPost("video/mp4", { "content-length": "10" });

    const response = await post(request, "my demo");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { duplex?: string }];
    expect(url).toBe("http://api.test/api/cms/projects/my%20demo/video");
    expect(init.method).toBe("POST");
    expect(init.duplex).toBe("half");
    expect(init.body).toBe(request.body);
    expect(init.headers).toEqual({
      "content-type": "video/mp4",
      "x-cms-passphrase": PASSPHRASE,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ key: "demo-1.mp4" });
  });

  it("sends an empty passphrase when the environment has none", async () => {
    allow();
    vi.stubEnv("ADMIN_PASSPHRASE", undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));

    await post(rawPost("video/webm"));

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-cms-passphrase"]).toBe("");
  });
});

describe("POST /api/admin/publications/[slug]/paper", () => {
  async function post(request: Request, slug = "paper") {
    const { POST } = await import("./publications/[slug]/paper/route");
    return POST(request, context({ slug }));
  }

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ])("answers %i", async (status, error) => {
    requireAdminPermission.mockResolvedValue({ status });

    const response = await post(rawPost("application/pdf"));

    expect(requireAdminPermission).toHaveBeenCalledWith("publications", "write");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });

  it.each(["text/plain", "application/pdfx", "application/pdf-extra", ""])(
    "refuses the content type '%s' with 400",
    async (contentType) => {
      allow();
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("must not be called"));

      const response = await post(rawPost(contentType));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message: "The paper must be a PDF file." });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("refuses a declared size above the limit with 413", async () => {
    allow();
    vi.stubEnv("CMS_MAX_PAPER_BYTES", String(1024 * 1024));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("must not be called"));

    const response = await post(rawPost("application/pdf", { "content-length": "2097152" }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The paper must be under 1 MB." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses a limit of 200 MB when the environment sets none", async () => {
    allow();
    vi.stubEnv("CMS_MAX_PAPER_BYTES", undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("must not be called"));

    const response = await post(rawPost("application/pdf", { "content-length": "209715201" }));

    expect(response.status).toBe(413);
    expect(((await response.json()) as { message: string }).message).toContain("200 MB");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts a PDF type with parameters and sends a clean type to the API", async () => {
    allow();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ key: "paper-1.pdf" }, { status: 202 }));

    const response = await post(rawPost("application/PDF; charset=binary"), "p 1");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { duplex?: string }];
    expect(url).toBe("http://api.test/api/cms/publications/p%201/paper");
    expect(init.duplex).toBe("half");
    expect(init.headers).toEqual({
      "content-type": "application/pdf",
      "x-cms-passphrase": PASSPHRASE,
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ key: "paper-1.pdf" });
  });
});

describe("POST /api/admin/home-content/video", () => {
  async function post(request: Request) {
    const { POST } = await import("./home-content/video/route");
    return POST(request);
  }

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ])("answers %i", async (status, error) => {
    requireAdminPermission.mockResolvedValue({ status });

    const response = await post(rawPost("video/mp4"));

    expect(requireAdminPermission).toHaveBeenCalledWith("home", "write");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("refuses a type that is not MP4 or WebM, also when it has parameters or is missing", async () => {
    allow();

    for (const contentType of ["video/ogg", "video/mp4; codecs=avc1", null]) {
      const response = await post(rawPost(contentType));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message: "The video must be an MP4 or WebM file." });
    }
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("refuses a declared size above the limit with 413", async () => {
    allow();
    vi.stubEnv("CMS_MAX_VIDEO_BYTES", String(1024 * 1024));

    const response = await post(rawPost("video/mp4", { "content-length": "1048577" }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The video must be under 1 MB." });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("lets a body of exactly the limit through", async () => {
    allow();
    vi.stubEnv("CMS_MAX_VIDEO_BYTES", String(1024 * 1024));
    fetchWithTimeout.mockResolvedValue(Response.json({ ok: true }));

    const response = await post(rawPost("video/mp4", { "content-length": "1048576" }));

    expect(response.status).toBe(200);
  });

  it("streams the video to the API with the upload timeout and relays the answer", async () => {
    allow();
    fetchWithTimeout.mockResolvedValue(
      Response.json({ key: "home-video-1.webm" }, { status: 201 }),
    );
    const request = rawPost("video/webm");

    const response = await post(request);

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    const [url, init, timeout] = fetchWithTimeout.mock.calls[0] as [
      string,
      RequestInit & { duplex?: string },
      number,
    ];
    expect(url).toBe("http://api.test/api/cms/home/video");
    expect(init.method).toBe("POST");
    expect(init.duplex).toBe("half");
    expect(init.body).toBe(request.body);
    expect(init.headers).toEqual({
      "content-type": "video/webm",
      "x-cms-passphrase": PASSPHRASE,
    });
    expect(timeout).toBe(1_800_000);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ key: "home-video-1.webm" });
  });
});
