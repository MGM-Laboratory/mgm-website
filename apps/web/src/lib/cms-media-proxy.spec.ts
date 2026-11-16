import { beforeEach, describe, expect, it, vi } from "vitest";

const { cmsApi, fetchWithTimeout } = vi.hoisted(() => ({
  cmsApi: vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
  fetchWithTimeout: vi.fn<(url: string, init: RequestInit, timeout: number) => Promise<Response>>(),
}));

vi.mock("@/lib/cms-api", () => ({ cmsApi }));
vi.mock("@/lib/fetch-timeout", () => ({ API_READ_TIMEOUT_MS: 1234, fetchWithTimeout }));

import { bundledMediaPath, mediaPlaybackRoute } from "./cms-media-proxy";

const ctx = (key: string) => ({ params: Promise.resolve({ key }) });
const req = () => new Request("https://site.test/api/x/media/k");

function redirect(location: string | null) {
  return new Response(null, { status: 302, headers: location ? { location } : {} });
}

beforeEach(() => {
  cmsApi.mockReset();
  fetchWithTimeout.mockReset();
});

describe("bundledMediaPath", () => {
  it("accepts a static key with a folder and a file", () => {
    expect(bundledMediaPath("static/img/a-b.png")).toBe("img/a-b.png");
  });

  it("refuses anything else", () => {
    expect(bundledMediaPath("static/a.png")).toBeUndefined();
    expect(bundledMediaPath("static/../etc/passwd")).toBeUndefined();
    expect(bundledMediaPath("static/a/b/c.png")).toBeUndefined();
    expect(bundledMediaPath("covers/a.png")).toBeUndefined();
  });
});

describe("mediaPlaybackRoute", () => {
  const route = mediaPlaybackRoute((key) => `/cms/media/${key}`, {
    keyPattern: /^[a-z0-9.-]+$/,
    staticAssetPath: bundledMediaPath,
  });

  it("answers 404 for a key that fails the pattern", async () => {
    const response = await route.GET(req(), ctx("BAD KEY"));

    expect(response.status).toBe(404);
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("redirects a bundled key to the public file", async () => {
    const response = await mediaPlaybackRoute((key) => key, {
      staticAssetPath: bundledMediaPath,
    }).GET(req(), ctx("static/img/a.png"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://site.test/img/a.png");
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("follows the signed redirect and streams the file with an immutable cache", async () => {
    cmsApi.mockResolvedValue(redirect("https://bucket.test/signed"));
    fetchWithTimeout.mockResolvedValue(
      new Response("bytes", {
        headers: { "content-type": "image/png", "content-length": "5" },
      }),
    );

    const response = await route.GET(req(), ctx("a.png"));

    expect(cmsApi).toHaveBeenCalledWith("/cms/media/a.png", { redirect: "manual" });
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      "https://bucket.test/signed",
      { cache: "no-store" },
      1234,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe("5");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.has("content-disposition")).toBe(false);
  });

  it("streams the API answer itself when there is no redirect", async () => {
    cmsApi.mockResolvedValue(new Response("direct", { headers: { "content-type": "image/jpeg" } }));

    const response = await route.GET(req(), ctx("a.jpg"));

    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(await response.text()).toBe("direct");
  });

  it("defaults the content type", async () => {
    cmsApi.mockResolvedValue(new Response(new Uint8Array([1])));

    const response = await route.GET(req(), ctx("a"));

    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.has("content-length")).toBe(false);
  });

  it.each([
    "text/html; charset=utf-8",
    "image/svg+xml",
    "application/xhtml+xml",
    "application/javascript",
    "text/javascript",
    "application/xml",
  ])("sends %s as a download", async (type) => {
    cmsApi.mockResolvedValue(new Response("<x/>", { headers: { "content-type": type } }));

    const response = await route.GET(req(), ctx("a"));

    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toBe("attachment");
  });

  it("passes the status of a failed source and of an empty body", async () => {
    cmsApi.mockResolvedValue(redirect("https://bucket.test/signed"));
    fetchWithTimeout.mockResolvedValueOnce(new Response("no", { status: 403 }));
    expect((await route.GET(req(), ctx("a"))).status).toBe(403);

    fetchWithTimeout.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect((await route.GET(req(), ctx("a"))).status).toBe(200);

    cmsApi.mockResolvedValue(new Response("gone", { status: 404 }));
    expect((await route.GET(req(), ctx("a"))).status).toBe(404);
  });

  it("works without options", async () => {
    cmsApi.mockResolvedValue(new Response("x", { headers: { "content-type": "image/png" } }));

    const response = await mediaPlaybackRoute((key) => `/m/${key}`).GET(req(), ctx("Any Key"));

    expect(response.status).toBe(200);
    expect(cmsApi).toHaveBeenCalledWith("/m/Any Key", { redirect: "manual" });
  });
});
