import { beforeEach, describe, expect, it, vi } from "vitest";

const { cmsApi, fetchWithTimeout, requireAdminPermission, requireSuperadmin } = vi.hoisted(() => ({
  cmsApi: vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
  fetchWithTimeout: vi.fn<(url: string, init: RequestInit, timeout: number) => Promise<Response>>(),
  requireAdminPermission: vi.fn(),
  requireSuperadmin: vi.fn(),
}));

vi.mock("@/lib/cms-api", () => ({ apiBaseUrl: () => "http://api.test/api", cmsApi }));
vi.mock("@/lib/fetch-timeout", () => ({ API_UPLOAD_TIMEOUT_MS: 4321, fetchWithTimeout }));
vi.mock("@/lib/admin-session", () => ({ requireAdminPermission, requireSuperadmin }));

import {
  detailRoute,
  gateAdminRequest,
  gateSuperadminRequest,
  listRoute,
  postRoute,
  proxyJson,
  singletonRoute,
  slugPostRoute,
  slugPutRoute,
  videoUploadRoute,
} from "./admin-proxy";

const allowed = async () => ({ ok: true as const, session: {} as never });
const denied = async () => ({
  ok: false as const,
  response: Response.json({ error: "Forbidden" }, { status: 403 }) as never,
});
const context = { params: Promise.resolve({ slug: "my post" }) };

function jsonRequest(method: string, body: unknown = { a: 1 }) {
  return new Request("http://localhost/api/admin/x", { method, body: JSON.stringify(body) });
}

beforeEach(() => {
  cmsApi.mockReset();
  cmsApi.mockImplementation(async () => Response.json({ ok: true }, { status: 201 }));
  fetchWithTimeout.mockReset();
  requireAdminPermission.mockReset();
  requireSuperadmin.mockReset();
  vi.unstubAllEnvs();
});

describe("gates", () => {
  it("hands back the session when the permission is held", async () => {
    const session = { accountId: "a" };
    requireAdminPermission.mockResolvedValue({ status: 200, session });

    expect(await gateAdminRequest("articles", "write")).toEqual({ ok: true, session });
    expect(requireAdminPermission).toHaveBeenCalledWith("articles", "write");
  });

  it("answers 401 and 403 with the matching error", async () => {
    requireAdminPermission.mockResolvedValueOnce({ status: 401 });
    const unauthorized = await gateAdminRequest("articles", "read");
    requireAdminPermission.mockResolvedValueOnce({ status: 403 });
    const forbidden = await gateAdminRequest("articles", "read");

    expect(unauthorized.ok).toBe(false);
    if (!unauthorized.ok && !forbidden.ok) {
      expect(unauthorized.response.status).toBe(401);
      expect(await unauthorized.response.json()).toEqual({ error: "Unauthorized" });
      expect(forbidden.response.status).toBe(403);
      expect(await forbidden.response.json()).toEqual({ error: "Forbidden" });
    }
  });

  it("gates the superadmin routes the same way", async () => {
    const session = { accountId: "superadmin" };
    requireSuperadmin.mockResolvedValueOnce({ status: 200, session });
    expect(await gateSuperadminRequest()).toEqual({ ok: true, session });

    requireSuperadmin.mockResolvedValueOnce({ status: 403 });
    const refused = await gateSuperadminRequest();
    expect(refused.ok).toBe(false);
  });
});

describe("proxyJson", () => {
  it("passes on the status and the body of the API answer", async () => {
    cmsApi.mockResolvedValue(Response.json({ message: "conflict" }, { status: 409 }));

    const response = await proxyJson("/cms/x", { method: "PUT" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "conflict" });
    expect(cmsApi).toHaveBeenCalledWith("/cms/x", { method: "PUT" });
  });
});

describe("simple routes", () => {
  it("slugPutRoute forwards the body to the path of the slug", async () => {
    const { PUT } = slugPutRoute(allowed, (slug) => `/cms/a/${slug}`);

    const response = await PUT(jsonRequest("PUT"), context);

    expect(response.status).toBe(201);
    expect(cmsApi).toHaveBeenCalledWith("/cms/a/my post", { body: '{"a":1}', method: "PUT" });
  });

  it("slugPostRoute forwards the body to the path of the slug", async () => {
    const { POST } = slugPostRoute(allowed, (slug) => `/cms/a/${slug}/x`);

    await POST(jsonRequest("POST"), context);

    expect(cmsApi).toHaveBeenCalledWith("/cms/a/my post/x", { body: '{"a":1}', method: "POST" });
  });

  it("postRoute forwards the body to a fixed path", async () => {
    const { POST } = postRoute(allowed, "/cms/fixed");

    await POST(jsonRequest("POST"));

    expect(cmsApi).toHaveBeenCalledWith("/cms/fixed", { body: '{"a":1}', method: "POST" });
  });

  it("listRoute reads the path", async () => {
    const { GET } = listRoute(allowed, "/cms/list");

    await GET();

    expect(cmsApi).toHaveBeenCalledWith("/cms/list", undefined);
  });

  it("answers the gate response and calls nothing when the gate refuses", async () => {
    const routes = [
      slugPutRoute(denied, () => "/x").PUT(jsonRequest("PUT"), context),
      slugPostRoute(denied, () => "/x").POST(jsonRequest("POST"), context),
      postRoute(denied, "/x").POST(jsonRequest("POST")),
      listRoute(denied, "/x").GET(),
      detailRoute(denied, denied, () => "/x").PUT(jsonRequest("PUT"), context),
      detailRoute(denied, denied, () => "/x").DELETE(jsonRequest("DELETE"), context),
      singletonRoute(denied, denied, "/x").GET(),
      singletonRoute(denied, denied, "/x").PUT(jsonRequest("PUT")),
    ];

    for (const response of await Promise.all(routes)) expect(response.status).toBe(403);
    expect(cmsApi).not.toHaveBeenCalled();
  });
});

describe("detailRoute", () => {
  it("sends no headers on a save without a loaded version", async () => {
    const { PUT } = detailRoute(allowed, allowed, (slug) => `/cms/a/${slug}`);

    await PUT(jsonRequest("PUT"), context);

    expect(cmsApi).toHaveBeenCalledWith("/cms/a/my post", {
      body: '{"a":1}',
      headers: undefined,
      method: "PUT",
    });
  });

  it("deletes through the delete gate and not the write gate", async () => {
    const { DELETE } = detailRoute(denied, allowed, (slug) => `/cms/a/${slug}`);

    const response = await DELETE(jsonRequest("DELETE"), context);

    expect(response.status).toBe(201);
    expect(cmsApi).toHaveBeenCalledWith("/cms/a/my post", { method: "DELETE" });
  });
});

describe("singletonRoute", () => {
  it("reads through the read gate and saves through the write gate", async () => {
    const { GET, PUT } = singletonRoute(allowed, allowed, "/cms/single");

    await GET();
    await PUT(jsonRequest("PUT"));

    expect(cmsApi).toHaveBeenNthCalledWith(1, "/cms/single", undefined);
    expect(cmsApi).toHaveBeenNthCalledWith(2, "/cms/single", { body: '{"a":1}', method: "PUT" });
  });
});

describe("videoUploadRoute", () => {
  const { POST } = videoUploadRoute(allowed, "/cms/video");

  function upload(headers: Record<string, string>) {
    return new Request("http://localhost/api/admin/video", {
      method: "POST",
      body: "bytes",
      headers,
    });
  }

  it("turns away a gate refusal", async () => {
    const response = await videoUploadRoute(denied, "/cms/video").POST(upload({}));

    expect(response.status).toBe(403);
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("accepts only MP4 and WebM", async () => {
    const response = await POST(upload({ "content-type": "video/quicktime" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "The video must be an MP4 or WebM file." });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("refuses a missing content type", async () => {
    const request = new Request("http://localhost/x", { method: "POST" });

    expect((await POST(request)).status).toBe(400);
  });

  it("refuses a declared size over the default limit of 500 MB", async () => {
    const response = await POST(
      upload({ "content-type": "video/mp4", "content-length": String(600 * 1024 * 1024) }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The video must be under 500 MB." });
  });

  it("reads the limit from the environment", async () => {
    vi.stubEnv("CMS_MAX_VIDEO_BYTES", String(2 * 1024 * 1024));

    const response = await POST(
      upload({ "content-type": "video/webm", "content-length": String(3 * 1024 * 1024) }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The video must be under 2 MB." });
  });

  it("streams a video that passes to the API with the passphrase and the upload limit", async () => {
    vi.stubEnv("ADMIN_PASSPHRASE", "the-admin-login-value");
    fetchWithTimeout.mockResolvedValue(Response.json({ key: "k" }, { status: 201 }));

    const response = await POST(upload({ "content-type": "video/mp4", "content-length": "5" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ key: "k" });
    const [url, init, timeout] = fetchWithTimeout.mock.calls[0];
    expect(url).toBe("http://api.test/api/cms/video");
    expect(timeout).toBe(4321);
    expect(init).toMatchObject({
      method: "POST",
      duplex: "half",
      headers: { "content-type": "video/mp4", "x-cms-passphrase": "the-admin-login-value" },
    });
    expect(init.body).toBeInstanceOf(ReadableStream);
  });

  it("sends an empty passphrase when none is configured and skips the size check without a length", async () => {
    vi.stubEnv("ADMIN_PASSPHRASE", undefined);
    fetchWithTimeout.mockResolvedValue(Response.json({}));

    await POST(upload({ "content-type": "video/webm" }));

    expect(fetchWithTimeout.mock.calls[0][1].headers).toMatchObject({ "x-cms-passphrase": "" });
  });
});
