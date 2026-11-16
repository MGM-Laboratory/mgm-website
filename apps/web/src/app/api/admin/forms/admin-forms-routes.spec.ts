import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminPermission, cmsApi } = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  cmsApi: vi.fn(),
}));

vi.mock("@/lib/admin-session", () => ({ requireAdminPermission, requireSuperadmin: vi.fn() }));
vi.mock("@/lib/cms-api", () => ({ apiBaseUrl: () => "http://api.test/api", cmsApi }));

type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;

type Case = {
  name: string;
  load: () => Promise<Record<string, Handler | undefined>>;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  action: "read" | "write" | "delete";
  params?: Record<string, string>;
  query?: string;
  body?: unknown;
  path: string;
  init?: { method: string; body?: string };
};

const body = { title: "Survey" };
const json = (value: unknown) => JSON.stringify(value);

const cases: Case[] = [
  {
    name: "forms list",
    load: () => import("./route"),
    method: "GET",
    action: "read",
    path: "/forms/admin",
  },
  {
    name: "form create",
    load: () => import("./route"),
    method: "POST",
    action: "write",
    body,
    path: "/forms/admin",
    init: { method: "POST", body: json(body) },
  },
  {
    name: "form read",
    load: () => import("./[id]/route"),
    method: "GET",
    action: "read",
    params: { id: "f 1" },
    path: "/forms/admin/f%201",
  },
  {
    name: "form save",
    load: () => import("./[id]/route"),
    method: "PUT",
    action: "write",
    params: { id: "f1" },
    body,
    path: "/forms/admin/f1",
    init: { method: "PUT", body: json(body) },
  },
  {
    name: "form delete",
    load: () => import("./[id]/route"),
    method: "DELETE",
    action: "delete",
    params: { id: "f1" },
    path: "/forms/admin/f1",
    init: { method: "DELETE" },
  },
  {
    name: "analytics with both settings",
    load: () => import("./[id]/analytics/route"),
    method: "GET",
    action: "read",
    params: { id: "f1" },
    query: "?range=30d&tzOffset=-420&other=1",
    path: "/forms/admin/f1/analytics?range=30d&tzOffset=-420",
  },
  {
    name: "analytics without settings",
    load: () => import("./[id]/analytics/route"),
    method: "GET",
    action: "read",
    params: { id: "f1" },
    path: "/forms/admin/f1/analytics",
  },
  {
    name: "form duplicate",
    load: () => import("./[id]/duplicate/route"),
    method: "POST",
    action: "write",
    params: { id: "f1" },
    path: "/forms/admin/f1/duplicate",
    init: { method: "POST" },
  },
  {
    name: "responses with a page",
    load: () => import("./[id]/responses/route"),
    method: "GET",
    action: "read",
    params: { id: "f1" },
    query: "?cursor=abc&limit=20&other=1",
    path: "/forms/admin/f1/responses?cursor=abc&limit=20",
  },
  {
    name: "responses without a page",
    load: () => import("./[id]/responses/route"),
    method: "GET",
    action: "read",
    params: { id: "f1" },
    path: "/forms/admin/f1/responses",
  },
  {
    name: "response edit",
    load: () => import("./[id]/responses/[responseId]/route"),
    method: "PATCH",
    action: "write",
    params: { id: "f1", responseId: "r 1" },
    body: { starred: true },
    path: "/forms/admin/f1/responses/r%201",
    init: { method: "PATCH", body: json({ starred: true }) },
  },
  {
    name: "responses apply",
    load: () => import("./[id]/responses/apply/route"),
    method: "POST",
    action: "write",
    params: { id: "f1" },
    body: { tag: "x" },
    path: "/forms/admin/f1/responses/apply",
    init: { method: "POST", body: json({ tag: "x" }) },
  },
  {
    name: "visits",
    load: () => import("./[id]/visits/route"),
    method: "GET",
    action: "read",
    params: { id: "f1" },
    query: "?limit=50&other=1",
    path: "/forms/admin/f1/visits?limit=50",
  },
  {
    name: "slug check",
    load: () => import("./slug-available/route"),
    method: "GET",
    action: "read",
    query: "?slug=a%20b&excludeId=f1&other=1",
    path: "/forms/admin/slug-available?slug=a+b&excludeId=f1",
  },
];

async function call(testCase: Case) {
  const handler = (await testCase.load())[testCase.method];
  if (!handler) throw new Error(`${testCase.name} has no ${testCase.method} handler`);
  const request = new Request(`http://localhost/api/admin/forms${testCase.query ?? ""}`, {
    method: testCase.method,
    body: testCase.body === undefined ? undefined : json(testCase.body),
  });
  return handler(request, { params: Promise.resolve(testCase.params ?? {}) } as never);
}

function allow() {
  requireAdminPermission.mockResolvedValue({ status: 200, session: {} });
}

beforeEach(() => {
  requireAdminPermission.mockReset();
  cmsApi.mockReset();
  cmsApi.mockResolvedValue(Response.json({ upstream: true }, { status: 201 }));
});

describe.each(cases)("admin forms route $name", (testCase) => {
  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ])("answers %i and never calls the API", async (status, error) => {
    requireAdminPermission.mockResolvedValue({ status });

    const response = await call(testCase);

    expect(requireAdminPermission).toHaveBeenCalledWith("forms", testCase.action);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("forwards path, method and body and relays the answer of the API", async () => {
    allow();

    const response = await call(testCase);

    expect(requireAdminPermission).toHaveBeenCalledWith("forms", testCase.action);
    const [path, init] = cmsApi.mock.calls[0] as [string, RequestInit | undefined];
    expect(path).toBe(testCase.path);
    if (testCase.init) expect(init).toEqual(testCase.init);
    else expect(init).toBeUndefined();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ upstream: true });
  });
});

describe("forwardJson through GET /api/admin/forms", () => {
  async function list() {
    const { GET } = await import("./route");
    return GET();
  }

  beforeEach(allow);

  it("turns a throw of the API call into a 502 message", async () => {
    cmsApi.mockRejectedValue(new TypeError("fetch failed"));

    const response = await list();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "The forms API is not reachable." });
  });

  it("shows the text of a body that is not JSON as the message", async () => {
    cmsApi.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));

    const response = await list();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "<html>Bad gateway</html>" });
  });

  it("cuts the text of a long body that is not JSON to 300 characters", async () => {
    cmsApi.mockResolvedValue(new Response("x".repeat(500), { status: 500 }));

    const response = await list();

    expect(((await response.json()) as { message: string }).message).toHaveLength(300);
  });

  it("names the status when the body is empty", async () => {
    cmsApi.mockResolvedValue(new Response("", { status: 500 }));

    const response = await list();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Request failed (500)." });
  });
});

describe("forwardBody through POST /api/admin/forms", () => {
  beforeEach(allow);

  it("answers 400 and does not call the API when the body is not JSON", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/forms", { method: "POST", body: "{nope" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "The request body must be JSON." });
    expect(cmsApi).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/forms/[id]/responses/bulk", () => {
  const context = { params: Promise.resolve({ id: "f1" }) } as never;

  async function post(raw: string) {
    const { POST } = await import("./[id]/responses/bulk/route");
    return POST(
      new Request("http://localhost/api/admin/forms/f1/responses/bulk", {
        method: "POST",
        body: raw,
      }),
      context,
    );
  }

  it("asks for the write permission for a bulk action that only changes responses", async () => {
    allow();

    const response = await post(json({ ids: ["a"], action: "star" }));

    expect(requireAdminPermission).toHaveBeenCalledTimes(1);
    expect(requireAdminPermission).toHaveBeenCalledWith("forms", "write");
    expect(cmsApi).toHaveBeenCalledWith("/forms/admin/f1/responses/bulk", {
      method: "POST",
      body: json({ ids: ["a"], action: "star" }),
    });
    expect(response.status).toBe(201);
  });

  it("asks for the delete permission for a delete and refuses an account that lacks it", async () => {
    requireAdminPermission.mockResolvedValue({ status: 403 });

    const response = await post(json({ ids: ["a"], action: "delete" }));

    expect(requireAdminPermission).toHaveBeenCalledWith("forms", "delete");
    expect(response.status).toBe(403);
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it.each(["null", "[]", '"delete"', "42"])(
    "treats the body %s as a write because it names no delete action",
    async (raw) => {
      allow();

      await post(raw);

      expect(requireAdminPermission).toHaveBeenCalledWith("forms", "write");
      expect(cmsApi).toHaveBeenCalledTimes(1);
    },
  );

  it("answers 400 for a body that is not JSON before it asks the gate", async () => {
    const response = await post("not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "The request body must be JSON." });
    expect(requireAdminPermission).not.toHaveBeenCalled();
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    requireAdminPermission.mockResolvedValue({ status: 401 });

    const response = await post(json({ action: "star" }));

    expect(response.status).toBe(401);
    expect(cmsApi).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/forms/[id]/media", () => {
  const context = { params: Promise.resolve({ id: "f 1" }) } as never;

  async function post(contentType: string | null, headers: Record<string, string> = {}) {
    const { POST } = await import("./[id]/media/route");
    return POST(
      new Request("http://localhost/api/admin/forms/f1/media", {
        method: "POST",
        body: contentType?.startsWith("video/") ? "bytes" : json({ image: "data" }),
        headers: { ...(contentType === null ? {} : { "content-type": contentType }), ...headers },
      }),
      context,
    );
  }

  beforeEach(allow);

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ])("answers %i", async (status, error) => {
    requireAdminPermission.mockResolvedValue({ status });

    const response = await post("video/mp4");

    expect(requireAdminPermission).toHaveBeenCalledWith("forms", "write");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("forwards an image given as JSON", async () => {
    const response = await post("application/json");

    expect(cmsApi).toHaveBeenCalledWith("/forms/admin/f%201/media", {
      method: "POST",
      body: json({ image: "data" }),
    });
    expect(response.status).toBe(201);
  });

  it("treats a request that names no video type as JSON", async () => {
    await post(null);

    expect(cmsApi.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("refuses a video type other than MP4 and WebM with 400", async () => {
    const response = await post("video/quicktime");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "The video must be an MP4 or WebM file." });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("refuses a declared size above the limit with 413", async () => {
    vi.stubEnv("CMS_MAX_VIDEO_BYTES", String(1024 * 1024));

    const response = await post("video/webm", { "content-length": "1048577" });
    vi.unstubAllEnvs();

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The video must be under 1 MB." });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("streams a video with its length and file name and relays the answer", async () => {
    cmsApi.mockResolvedValue(Response.json({ key: "form-1.mp4" }, { status: 201 }));

    const response = await post("video/mp4; codecs=avc1", {
      "content-length": "5",
      "x-file-name": "clip.mp4",
    });

    const [path, init] = cmsApi.mock.calls[0] as [string, RequestInit & { duplex?: string }];
    expect(path).toBe("/forms/admin/f%201/media");
    expect(init.method).toBe("POST");
    expect(init.duplex).toBe("half");
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(init.headers).toEqual({
      "content-type": "video/mp4",
      "content-length": "5",
      "x-file-name": "clip.mp4",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ key: "form-1.mp4" });
  });

  it("sends only the content type when the request has no length or file name", async () => {
    await post("video/webm");

    expect((cmsApi.mock.calls[0]?.[1] as RequestInit).headers).toEqual({
      "content-type": "video/webm",
    });
  });

  it("answers 502 when the stream cannot reach the API", async () => {
    cmsApi.mockRejectedValue(new TypeError("fetch failed"));

    const response = await post("video/mp4");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "The upload could not reach the API." });
  });

  it("names a too large file when the API answers 413 with something that is not JSON", async () => {
    cmsApi.mockResolvedValue(new Response("Payload Too Large", { status: 413 }));

    const response = await post("video/mp4");

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The file is too large." });
  });

  it("says that the upload failed when the API answers with something that is not JSON", async () => {
    cmsApi.mockResolvedValue(new Response("oops", { status: 500 }));

    const response = await post("video/mp4");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "The upload failed." });
  });
});

describe("GET /api/admin/forms/[id]/files/[key]", () => {
  const context = { params: Promise.resolve({ id: "f1", key: "up 1.pdf" }) } as never;

  async function get(query = "") {
    const { GET } = await import("./[id]/files/[key]/route");
    return GET(new Request(`http://localhost/api/admin/forms/f1/files/k${query}`), context);
  }

  beforeEach(allow);

  it.each([
    [401, "Unauthorized"],
    [403, "Forbidden"],
  ])("answers %i", async (status, error) => {
    requireAdminPermission.mockResolvedValue({ status });

    const response = await get();

    expect(requireAdminPermission).toHaveBeenCalledWith("forms", "read");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("redirects with 302 to the signed address of the file", async () => {
    cmsApi.mockResolvedValue(Response.json({ url: "https://files.example/signed?x=1" }));

    const response = await get();

    expect(cmsApi).toHaveBeenCalledWith("/forms/admin/f1/files/up%201.pdf");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://files.example/signed?x=1");
  });

  it("answers 404 when the API says 200 but sends no address", async () => {
    cmsApi.mockResolvedValue(Response.json({}));

    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "File not found." });
  });

  it("relays the status and the message of an API error", async () => {
    cmsApi.mockResolvedValue(Response.json({ message: "No such upload." }, { status: 410 }));

    const response = await get();

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ message: "No such upload." });
  });

  it("keeps the status of an API error whose body is not JSON", async () => {
    cmsApi.mockResolvedValue(new Response("gone", { status: 500 }));

    const response = await get();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "File not found." });
  });

  it("answers 502 when the API cannot be reached", async () => {
    cmsApi.mockRejectedValue(new TypeError("fetch failed"));

    const response = await get();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "The forms API is not reachable." });
  });

  it("relays the bytes as a private attachment for download=1", async () => {
    cmsApi.mockResolvedValue(
      new Response("file bytes", {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="a.pdf"',
          "content-length": "10",
        },
      }),
    );

    const response = await get("?download=1");

    expect(cmsApi).toHaveBeenCalledWith("/forms/admin/f1/files/up%201.pdf?download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="a.pdf"');
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("file bytes");
  });

  it("falls back to an octet stream attachment when the API names no type", async () => {
    const bare = new Response(new Blob(["x"]).stream());
    bare.headers.delete("content-type");
    cmsApi.mockResolvedValue(bare);

    const response = await get("?download=1");

    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toBe("attachment");
    expect(response.headers.has("content-length")).toBe(false);
  });

  it("relays the message of an API error for a download", async () => {
    cmsApi.mockResolvedValue(Response.json({ message: "Expired." }, { status: 404 }));

    const response = await get("?download=1");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "Expired." });
  });

  it("answers 502 when the API says 200 without a body for a download", async () => {
    cmsApi.mockResolvedValue(new Response(null, { status: 200 }));

    const response = await get("?download=1");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ message: "The file could not be read." });
  });

  it("uses a default message for an error body that is not JSON on a download", async () => {
    cmsApi.mockResolvedValue(new Response("boom", { status: 500 }));

    const response = await get("?download=1");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "The file could not be read." });
  });
});
