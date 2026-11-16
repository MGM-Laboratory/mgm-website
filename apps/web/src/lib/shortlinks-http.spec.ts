// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/visitor-headers", () => ({
  provenVisitorHeaders: () => ({ "x-visitor-ip": "1.2.3.4" }),
}));

const fetchMock = vi.fn<typeof fetch>();

async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, undefined);
    else vi.stubEnv(key, value);
  }
  return import("./shortlinks-http");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function request(host: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (host !== null) headers.set("host", host);
  return new Request("https://example.test/s/abc", { ...init, headers });
}

function formRequest(host: string, fields: Record<string, string>) {
  return request(host, { method: "POST", body: new URLSearchParams(fields) });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("CMS_API_URL", "http://api.test/api/");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("handleShortlinkGet", () => {
  it("redirects to the long url with a 302", async () => {
    fetchMock.mockResolvedValue(json({ status: "ok", longUrl: "https://target.test/x" }));
    const { handleShortlinkGet } = await load();

    const response = await handleShortlinkGet(request("Short.Test:3000"), "a b");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://target.test/x");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/shortlinks/public/a%20b?host=short.test");
    expect(init?.headers).toEqual({ "x-visitor-ip": "1.2.3.4" });
  });

  it("refuses a destination that is not http or https", async () => {
    fetchMock.mockResolvedValue(json({ status: "ok", longUrl: "javascript:alert(1)" }));
    const { handleShortlinkGet } = await load();

    const response = await handleShortlinkGet(request("s.test"), "a");

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("This link does not exist");
  });

  it("refuses a destination that is not a url", async () => {
    fetchMock.mockResolvedValue(json({ status: "ok", longUrl: "not a url" }));
    const { handleShortlinkGet } = await load();

    expect((await handleShortlinkGet(request("s.test"), "a")).status).toBe(404);
  });

  it("shows the passphrase page for a protected link", async () => {
    fetchMock.mockResolvedValue(json({ status: "passphrase", host: "s.test" }));
    const { handleShortlinkGet } = await load();

    const response = await handleShortlinkGet(request("s.test"), "secret");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain('action="/s/secret"');
  });

  it("answers 410 for an expired and a used link", async () => {
    const { handleShortlinkGet } = await load();

    fetchMock.mockResolvedValueOnce(json({ status: "expired", kind: "expired" }));
    const expired = await handleShortlinkGet(request("s.test"), "a");
    expect(expired.status).toBe(410);
    expect(await expired.text()).toContain("This link has expired");

    fetchMock.mockResolvedValueOnce(json({ status: "expired", kind: "consumed" }));
    const used = await handleShortlinkGet(request("s.test"), "a");
    expect(used.status).toBe(410);
    expect(await used.text()).toContain("already used");
  });

  it("answers 404 for an unknown link", async () => {
    fetchMock.mockResolvedValue(json({ status: "not_found" }));
    const { handleShortlinkGet } = await load();

    expect((await handleShortlinkGet(request("s.test"), "a")).status).toBe(404);
  });

  it("answers 503 when the API fails, answers an error or cannot be reached", async () => {
    const { handleShortlinkGet } = await load();

    fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
    expect((await handleShortlinkGet(request("s.test"), "a")).status).toBe(503);

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const response = await handleShortlinkGet(request("s.test"), "a");
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Short links are unavailable");
  });

  it("falls back to the public API url and then to localhost", async () => {
    fetchMock.mockImplementation(async () => json({ status: "not_found" }));

    vi.stubEnv("CMS_API_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://public.test/api");
    let mod = await load();
    await mod.handleShortlinkGet(request("s.test"), "a");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^http:\/\/public\.test\/api\/shortlinks/);

    vi.unstubAllEnvs();
    vi.stubEnv("CMS_API_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
    mod = await load();
    await mod.handleShortlinkGet(request("s.test"), "a");
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/^http:\/\/localhost:4000\/api\/shortlinks/);
  });

  it("sends an empty host when the request has none", async () => {
    fetchMock.mockResolvedValue(json({ status: "not_found" }));
    const { handleShortlinkGet } = await load();

    await handleShortlinkGet(request(null), "a");

    expect(String(fetchMock.mock.calls[0][0])).toContain("?host=");
  });
});

describe("handleShortlinkPost", () => {
  it("asks for a passphrase when the form has none", async () => {
    const { handleShortlinkPost } = await load();

    const blank = await handleShortlinkPost(formRequest("s.test", { passphrase: "   " }), "a");
    expect(blank.status).toBe(400);
    expect(await blank.text()).toContain("Enter a passphrase first.");

    const json = await handleShortlinkPost(
      request("s.test", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      "a",
    );
    expect(json.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a file field in place of the passphrase", async () => {
    const { handleShortlinkPost } = await load();
    const form = new FormData();
    form.set("passphrase", new File(["x"], "x.txt"));

    const response = await handleShortlinkPost(
      request("s.test", { method: "POST", body: form }),
      "a",
    );

    expect(response.status).toBe(400);
  });

  it("verifies the trimmed passphrase and redirects on success", async () => {
    fetchMock.mockResolvedValue(json({ longUrl: "https://target.test/ok" }));
    const { handleShortlinkPost } = await load();

    const response = await handleShortlinkPost(
      formRequest("Short.Test", { passphrase: "  open sesame  " }),
      "slug",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://target.test/ok");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/shortlinks/verify");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      slug: "slug",
      host: "short.test",
      passphrase: "open sesame",
    });
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-visitor-ip": "1.2.3.4",
    });
  });

  it("maps the API answers to pages", async () => {
    const { handleShortlinkPost } = await load();
    const post = () => handleShortlinkPost(formRequest("s.test", { passphrase: "p" }), "a");

    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    const rejected = await post();
    expect(rejected.status).toBe(401);
    expect(await rejected.text()).toContain("That passphrase is not right.");

    fetchMock.mockResolvedValueOnce(new Response("", { status: 410 }));
    const gone = await post();
    expect(gone.status).toBe(410);
    expect(await gone.text()).toContain("already used");

    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect((await post()).status).toBe(404);

    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    expect((await post()).status).toBe(503);

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect((await post()).status).toBe(503);
  });
});

describe("handleShortlinkCatchAll", () => {
  const hostsAnswer = () => json({ hosts: [{ hostname: "Go.Custom.Test" }] });

  it("leaves the site hosts alone", async () => {
    const { handleShortlinkCatchAll } = await load();

    for (const host of [
      "labmgm.org",
      "www.labmgm.org:443",
      "LABMGM.ORG.",
      "localhost:3000",
      "127.0.0.1",
      null,
    ]) {
      expect(await handleShortlinkCatchAll(request(host), ["abc"])).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the site hosts from the environment", async () => {
    const { handleShortlinkCatchAll } = await load({
      SHORTLINKS_SITE_HOSTS: " Mine.Test , ,other.test",
    });

    expect(await handleShortlinkCatchAll(request("mine.test"), ["abc"])).toBeNull();
    expect(await handleShortlinkCatchAll(request("OTHER.test"), ["abc"])).toBeNull();
  });

  it("answers the verification marker for a known host only", async () => {
    fetchMock.mockImplementation(async () => hostsAnswer());
    const { handleShortlinkCatchAll } = await load();

    const known = await handleShortlinkCatchAll(request("go.custom.test"), [
      "__mgm-shortlink-verify",
    ]);
    expect(known?.status).toBe(200);
    expect(await known?.text()).toBe("mgm-shortlinks-ok");

    const unknown = await handleShortlinkCatchAll(request("other.custom.test"), [
      "__mgm-shortlink-verify",
    ]);
    expect(unknown?.status).toBe(404);
  });

  it("answers the marker with 404 when the host list is unavailable", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { handleShortlinkCatchAll } = await load();

    const response = await handleShortlinkCatchAll(request("go.custom.test"), [
      "__mgm-shortlink-verify",
    ]);

    expect(response?.status).toBe(404);
  });

  it("answers 404 for the root and for unknown hosts", async () => {
    fetchMock.mockImplementation(async () => hostsAnswer());
    const { handleShortlinkCatchAll } = await load();

    expect((await handleShortlinkCatchAll(request("go.custom.test"), []))?.status).toBe(404);
    expect((await handleShortlinkCatchAll(request("stranger.test"), ["abc"]))?.status).toBe(404);
  });

  it("serves a slug on a known host and also when the host list is unavailable", async () => {
    const { handleShortlinkCatchAll } = await load();
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("/shortlinks/hosts")
        ? hostsAnswer()
        : json({ status: "ok", longUrl: "https://target.test/a" }),
    );

    const known = await handleShortlinkCatchAll(request("go.custom.test"), ["abc"]);
    expect(known?.status).toBe(302);

    const failing = await load();
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/shortlinks/hosts")) throw new Error("offline");
      return json({ status: "ok", longUrl: "https://target.test/b" });
    });
    const offline = await failing.handleShortlinkCatchAll(request("go.custom.test"), ["abc"]);
    expect(offline?.status).toBe(302);
  });

  it("routes a POST to the passphrase check and refuses other methods", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("/shortlinks/hosts")
        ? hostsAnswer()
        : json({ longUrl: "https://t.test/p" }),
    );
    const { handleShortlinkCatchAll } = await load();

    const post = await handleShortlinkCatchAll(formRequest("go.custom.test", { passphrase: "p" }), [
      "abc",
    ]);
    expect(post?.status).toBe(302);

    const put = await handleShortlinkCatchAll(request("go.custom.test", { method: "PUT" }), [
      "abc",
    ]);
    expect(put?.status).toBe(404);
  });

  it("caches the host list for a minute and retries sooner after a failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));
    const hostCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/shortlinks/hosts")).length;
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("/shortlinks/hosts") ? hostsAnswer() : json({ status: "not_found" }),
    );
    const { handleShortlinkCatchAll } = await load();

    await handleShortlinkCatchAll(request("go.custom.test"), ["a"]);
    await handleShortlinkCatchAll(request("go.custom.test"), ["a"]);
    expect(hostCalls()).toBe(1);

    // the copy is stale after a minute, a failed refresh keeps it and retries in 30 seconds
    vi.setSystemTime(new Date("2025-06-01T00:01:01.000Z"));
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/shortlinks/hosts")) return new Response("", { status: 500 });
      return json({ status: "not_found" });
    });
    await handleShortlinkCatchAll(request("go.custom.test"), ["a"]);
    expect(hostCalls()).toBe(2);
    await handleShortlinkCatchAll(request("go.custom.test"), ["a"]);
    expect(hostCalls()).toBe(2);

    vi.setSystemTime(new Date("2025-06-01T00:01:32.000Z"));
    await handleShortlinkCatchAll(request("go.custom.test"), ["a"]);
    expect(hostCalls()).toBe(3);
  });

  it("copes with an answer that has no hosts list", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("/shortlinks/hosts") ? json({}) : json({ status: "not_found" }),
    );
    const { handleShortlinkCatchAll } = await load();

    expect((await handleShortlinkCatchAll(request("go.custom.test"), ["a"]))?.status).toBe(404);
  });
});
