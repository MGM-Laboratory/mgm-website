// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest";

const { cmsApi, fetchWithTimeout } = vi.hoisted(() => ({
  cmsApi: vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
  fetchWithTimeout: vi.fn<(url: string, init: RequestInit, timeout: number) => Promise<Response>>(),
}));

vi.mock("@/lib/cms-api", () => ({ cmsApi }));
vi.mock("@/lib/fetch-timeout", () => ({ API_READ_TIMEOUT_MS: 1234, fetchWithTimeout }));

import { IMMUTABLE_VIDEO_CACHE, videoPlaybackRoute } from "./video-proxy";

const ctx = (key: string) => ({ params: Promise.resolve({ key }) });
const req = (range?: string) =>
  new Request("https://site.test/api/x/video/k", { headers: range ? { range } : {} });

const redirect = () =>
  new Response(null, { status: 302, headers: { location: "https://bucket.test/v" } });

beforeEach(() => {
  cmsApi.mockReset();
  fetchWithTimeout.mockReset();
});

describe("videoPlaybackRoute", () => {
  const route = videoPlaybackRoute(/^[a-z0-9.-]+$/, (key) => `/cms/video/${key}`);

  it("answers 404 for a key that fails the pattern", async () => {
    expect((await route.GET(req(), ctx("BAD"))).status).toBe(404);
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("passes on the status of an answer without a redirect, or 502 without a status", async () => {
    cmsApi.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect((await route.GET(req(), ctx("a.mp4"))).status).toBe(404);

    cmsApi.mockResolvedValueOnce({ headers: new Headers(), status: 0 } as Response);
    expect((await route.GET(req(), ctx("a.mp4"))).status).toBe(502);
  });

  it("streams a whole file with a revalidating cache", async () => {
    cmsApi.mockResolvedValue(redirect());
    fetchWithTimeout.mockResolvedValue(
      new Response("video", {
        headers: {
          "content-type": "video/mp4",
          "content-length": "5",
          etag: '"e"',
          "last-modified": "Mon, 01 Jan 2025 00:00:00 GMT",
        },
      }),
    );

    const response = await route.GET(req(), ctx("a.mp4"));

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      "https://bucket.test/v",
      { cache: "no-store", headers: {} },
      1234,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("video");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(response.headers.get("content-length")).toBe("5");
    expect(response.headers.get("etag")).toBe('"e"');
    expect(response.headers.get("last-modified")).toBe("Mon, 01 Jan 2025 00:00:00 GMT");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("relays a range request and answers its partial content", async () => {
    cmsApi.mockResolvedValue(redirect());
    fetchWithTimeout.mockResolvedValue(
      new Response("par", {
        status: 206,
        headers: {
          "content-type": "video/webm",
          "content-range": "bytes 0-2/10",
          "content-length": "3",
        },
      }),
    );

    const response = await route.GET(req("bytes=0-2"), ctx("a.webm"));

    expect(fetchWithTimeout.mock.calls[0][1]).toEqual({
      cache: "no-store",
      headers: { range: "bytes=0-2" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-2/10");
    expect(response.headers.has("etag")).toBe(false);
  });

  it("guesses the content type from the key when storage sends none", async () => {
    cmsApi.mockResolvedValue(redirect());
    fetchWithTimeout.mockImplementation(async () => {
      const source = new Response("x");
      source.headers.delete("content-type");
      return source;
    });

    expect((await route.GET(req(), ctx("a.webm"))).headers.get("content-type")).toBe("video/webm");
    expect((await route.GET(req(), ctx("a.mp4"))).headers.get("content-type")).toBe("video/mp4");
  });

  it("passes the status of a failed source", async () => {
    cmsApi.mockResolvedValue(redirect());
    fetchWithTimeout.mockResolvedValueOnce(new Response("", { status: 416 }));
    expect((await route.GET(req(), ctx("a.mp4"))).status).toBe(416);

    fetchWithTimeout.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect((await route.GET(req(), ctx("a.mp4"))).status).toBe(200);
  });

  it("uses the cache policy it is given", async () => {
    cmsApi.mockResolvedValue(redirect());
    fetchWithTimeout.mockResolvedValue(
      new Response("x", { headers: { "content-type": "video/mp4" } }),
    );
    const immutable = videoPlaybackRoute(/.*/, (key) => key, {
      cacheControl: IMMUTABLE_VIDEO_CACHE,
    });

    const response = await immutable.GET(req(), ctx("k"));

    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  });
});
