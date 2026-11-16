import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const mocks = vi.hoisted(() => ({
  cmsApi: vi.fn(),
  fetchWithTimeout: vi.fn(),
  fetchArticleFeed: vi.fn(),
  fetchCareerFeed: vi.fn(),
  fetchMemberRecords: vi.fn(),
  fetchPublicationFeed: vi.fn(),
  readArticleIndex: vi.fn(),
}));
const { cmsApi, fetchWithTimeout } = mocks;

vi.mock("@/lib/cms-api", () => ({ apiBaseUrl: () => "http://api.test/api", cmsApi }));
vi.mock("@/lib/fetch-timeout", () => ({
  API_READ_TIMEOUT_MS: 10_000,
  API_UPLOAD_TIMEOUT_MS: 1_800_000,
  API_WRITE_TIMEOUT_MS: 30_000,
  fetchWithTimeout,
}));
vi.mock("@/lib/article-cms-server", () => ({ fetchArticleFeed: mocks.fetchArticleFeed }));
vi.mock("@/lib/career-cms-server", () => ({ fetchCareerFeed: mocks.fetchCareerFeed }));
vi.mock("@/lib/member-cms-server", () => ({ fetchMemberRecords: mocks.fetchMemberRecords }));
vi.mock("@/lib/publication-cms-server", () => ({
  fetchPublicationFeed: mocks.fetchPublicationFeed,
}));
vi.mock("@/lib/article-index-server", () => ({ readArticleIndex: mocks.readArticleIndex }));

const UUID = "0123abcd-0123-4567-89ab-0123456789ab";
const keyContext = (key: string) => ({ params: Promise.resolve({ key }) });
const get = (path = "/", headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { headers });

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const weakEtag = (payload: string) =>
  `W/"${createHash("sha256").update(payload).digest("base64url")}"`;

describe.each([
  {
    name: "articles",
    load: () => import("./articles-cms/route"),
    source: mocks.fetchArticleFeed,
    // The draft stays out and the newest article comes first
    input: [
      { article: { draft: false, date: "2026-01-01", title: "old" } },
      { article: { draft: true, date: "2026-12-01", title: "draft" } },
      { article: { draft: false, date: "2026-06-01", title: "new" } },
    ],
    output: [
      { article: { draft: false, date: "2026-06-01", title: "new" } },
      { article: { draft: false, date: "2026-01-01", title: "old" } },
    ],
  },
  {
    name: "publications",
    load: () => import("./publications-cms/route"),
    source: mocks.fetchPublicationFeed,
    input: [
      { publication: { draft: true, date: "2026-12-01", title: "draft" } },
      { publication: { draft: false, date: "2026-02-01", title: "a" } },
      { publication: { draft: false, date: "2026-03-01", title: "b" } },
    ],
    output: [
      { publication: { draft: false, date: "2026-03-01", title: "b" } },
      { publication: { draft: false, date: "2026-02-01", title: "a" } },
    ],
  },
  {
    name: "careers",
    load: () => import("./careers-cms/route"),
    source: mocks.fetchCareerFeed,
    // Only a published role with a deadline that has not passed is open, the soonest deadline first
    input: [
      { job: { status: "published", deadline: "2999-12-31", title: "late" } },
      { job: { status: "draft", deadline: "2999-01-01", title: "draft" } },
      { job: { status: "published", deadline: "2000-01-01", title: "closed" } },
      { job: { status: "published", deadline: "2998-01-01", title: "soon" } },
    ],
    output: [
      { job: { status: "published", deadline: "2998-01-01", title: "soon" } },
      { job: { status: "published", deadline: "2999-12-31", title: "late" } },
    ],
  },
  {
    name: "members",
    load: () => import("./member-cms/route"),
    source: mocks.fetchMemberRecords,
    input: [{ slug: "b" }, { slug: "a" }],
    output: [{ slug: "b" }, { slug: "a" }],
  },
])("GET /api/$name feed", ({ load, source, input, output }) => {
  it("answers the filtered records with a weak etag and a revalidating cache policy", async () => {
    source.mockResolvedValue(input);
    const { GET } = await load();

    const response = await GET(get());

    const payload = JSON.stringify({ records: output });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(payload);
    expect(response.headers.get("etag")).toBe(weakEtag(payload));
    expect(response.headers.get("cache-control")).toBe(
      "private, no-cache, max-age=0, must-revalidate",
    );
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });

  it("answers 304 without a body when the etag of the visitor matches", async () => {
    source.mockResolvedValue(input);
    const { GET } = await load();
    const first = await GET(get());
    const etag = first.headers.get("etag") ?? "";

    const second = await GET(get("/", { "if-none-match": etag }));

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("sends the full body again when the etag of the visitor is stale", async () => {
    source.mockResolvedValue(input);
    const { GET } = await load();

    const response = await GET(get("/", { "if-none-match": 'W/"stale"' }));

    expect(response.status).toBe(200);
  });

  it("changes the etag when the records change", async () => {
    const { GET } = await load();
    source.mockResolvedValueOnce(input).mockResolvedValueOnce([]);

    const full = await GET(get());
    const empty = await GET(get());

    expect(empty.headers.get("etag")).not.toBe(full.headers.get("etag"));
  });

  it("answers 503 with an empty list that is never cached when the source fails", async () => {
    source.mockRejectedValue(new Error("API down"));
    const { GET } = await load();

    const response = await GET(get());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ records: [] });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/articles-cms/index", () => {
  async function index(query = "") {
    const { GET } = await import("./articles-cms/index/route");
    return GET(get(`/api/articles-cms/index${query}`));
  }

  const result = { items: [], total: 0, offset: 0, nextOffset: null, categories: [], all: 0 };

  beforeEach(() => {
    mocks.readArticleIndex.mockResolvedValue(result);
  });

  it("reads the first batch with the default size and reuses the cached feed", async () => {
    const response = await index();

    expect(mocks.readArticleIndex).toHaveBeenCalledWith(
      { category: undefined, q: undefined },
      { offset: 0, limit: 12, reuse: true },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("passes the category and the search text on after they are cleaned", async () => {
    await index("?category=Open-Source&q=%20robots%20");

    expect(mocks.readArticleIndex.mock.calls[0]?.[0]).toEqual({
      category: "open-source",
      q: "robots",
    });
  });

  it("drops a category that is not a slug", async () => {
    await index("?category=a%20b%2F..");

    expect(mocks.readArticleIndex.mock.calls[0]?.[0]).toEqual({
      category: undefined,
      q: undefined,
    });
  });

  it.each([
    ["24", 24],
    ["999", 36],
    ["0", 12],
    ["-5", 1],
    ["abc", 12],
    ["7.9", 7],
  ])("turns the limit '%s' into %i", async (limit, expected) => {
    await index(`?limit=${limit}`);

    expect(mocks.readArticleIndex.mock.calls[0]?.[1]).toMatchObject({ limit: expected });
  });

  it.each([
    ["30", 30],
    ["-4", 0],
    ["2.7", 2],
    ["abc", 0],
  ])("turns the offset '%s' into %i", async (offset, expected) => {
    await index(`?offset=${offset}`);

    expect(mocks.readArticleIndex.mock.calls[0]?.[1]).toMatchObject({ offset: expected });
  });

  it("answers 503 with an empty batch at the offset asked for when the read fails", async () => {
    mocks.readArticleIndex.mockRejectedValue(new Error("down"));

    const response = await index("?offset=24");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      items: [],
      total: 0,
      offset: 24,
      nextOffset: null,
      categories: [],
      all: 0,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("media routes of the CMS collections", () => {
  const routes = [
    {
      name: "articles",
      load: () => import("./articles-cms/media/[key]/route"),
      key: "cover.png",
      path: "/cms/articles/media/cover.png",
    },
    {
      name: "careers",
      load: () => import("./careers-cms/media/[key]/route"),
      key: "job image.png",
      path: "/cms/jobs/media/job%20image.png",
    },
    {
      name: "events",
      load: () => import("./events-cms/media/[key]/route"),
      key: "poster.png",
      path: "/cms/events/media/poster.png",
    },
    {
      name: "projects",
      load: () => import("./projects-cms/media/[key]/route"),
      key: "shot.png",
      path: "/cms/projects/media/shot.png",
    },
    {
      name: "research",
      load: () => import("./research-cms/media/[key]/route"),
      key: "figure.png",
      path: "/cms/research/media/figure.png",
    },
    {
      name: "members",
      load: () => import("./member-cms/media/[key]/route"),
      key: `member-ann_lee-${UUID}.jpg`,
      path: `/cms/members/media/member-ann_lee-${UUID}.jpg`,
    },
    {
      name: "publications",
      load: () => import("./publications-cms/media/[key]/route"),
      key: `author-${UUID}.webp`,
      path: `/cms/publications/media/author-${UUID}.webp`,
    },
  ];

  describe.each(routes)("$name", ({ load, key, path }) => {
    it("asks the API for the key without following the redirect and streams the stored file", async () => {
      cmsApi.mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "https://store.example/o?sig=1" } }),
      );
      fetchWithTimeout.mockResolvedValue(
        new Response("png bytes", {
          headers: { "content-type": "image/png", "content-length": "9" },
        }),
      );
      const { GET } = await load();

      const response = await GET(get(), keyContext(key));

      expect(cmsApi).toHaveBeenCalledWith(path, { redirect: "manual" });
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "https://store.example/o?sig=1",
        { cache: "no-store" },
        10_000,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("png bytes");
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("content-length")).toBe("9");
      expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.has("content-disposition")).toBe(false);
    });
  });

  describe("key rules", () => {
    it.each([
      ["members", () => import("./member-cms/media/[key]/route"), "member-ann.jpg"],
      ["members", () => import("./member-cms/media/[key]/route"), `member-ann-${UUID}.gif`],
      ["publications", () => import("./publications-cms/media/[key]/route"), `author-${UUID}.jpg`],
      ["publications", () => import("./publications-cms/media/[key]/route"), "../secret"],
    ])("%s answers 404 for the key '%s' without asking the API", async (_name, load, key) => {
      const { GET } = await load();

      const response = await GET(get(), keyContext(key));

      expect(response.status).toBe(404);
      expect(cmsApi).not.toHaveBeenCalled();
    });

    it.each([
      ["articles", () => import("./articles-cms/media/[key]/route"), "/articles/cover-1.png"],
      ["projects", () => import("./projects-cms/media/[key]/route"), "/projects/cover-1.png"],
      ["research", () => import("./research-cms/media/[key]/route"), "/research/cover-1.png"],
    ])("%s redirects a bundled key to its public file", async (name, load, location) => {
      const { GET } = await load();

      const response = await GET(get("/api/x/media/k"), keyContext(`static/${name}/cover-1.png`));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`http://localhost${location}`);
      expect(cmsApi).not.toHaveBeenCalled();
    });

    it("does not treat a key with a dot segment as a bundled file", async () => {
      cmsApi.mockResolvedValue(new Response(null, { status: 404 }));
      const { GET } = await import("./articles-cms/media/[key]/route");

      const response = await GET(get(), keyContext("static/../etc/passwd"));

      expect(response.status).toBe(404);
      expect(cmsApi).toHaveBeenCalledTimes(1);
      expect(cmsApi).toHaveBeenCalledWith("/cms/articles/media/static%2F..%2Fetc%2Fpasswd", {
        redirect: "manual",
      });
      expect(response.headers.has("location")).toBe(false);
    });
  });

  describe("response policy", () => {
    async function serve(source: Response, viaRedirect = true) {
      cmsApi.mockResolvedValue(
        viaRedirect
          ? new Response(null, { status: 302, headers: { location: "https://store.example/o" } })
          : source,
      );
      fetchWithTimeout.mockResolvedValue(source);
      const { GET } = await import("./events-cms/media/[key]/route");
      return GET(get(), keyContext("file"));
    }

    it.each([
      "text/html",
      "text/html; charset=utf-8",
      "TEXT/HTML",
      "image/svg+xml",
      "application/xml",
      "application/javascript",
      "application/atom+xml",
      "text/javascript",
    ])("sends the type '%s' as a download so that it never runs on the site", async (type) => {
      const response = await serve(
        new Response("<script>1</script>", { headers: { "content-type": type } }),
      );

      expect(response.headers.get("content-type")).toBe("application/octet-stream");
      expect(response.headers.get("content-disposition")).toBe("attachment");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it.each(["image/png", "application/pdf", "text/plain", "application/json"])(
      "leaves the type '%s' as it is",
      async (type) => {
        const response = await serve(new Response("x", { headers: { "content-type": type } }));

        expect(response.headers.get("content-type")).toBe(type);
        expect(response.headers.has("content-disposition")).toBe(false);
      },
    );

    it("says octet stream when the store names no type and sets no length that it does not know", async () => {
      const response = await serve(new Response(new Uint8Array([1, 2])));

      expect(response.headers.get("content-type")).toBe("application/octet-stream");
      expect(response.headers.has("content-length")).toBe(false);
    });

    it("serves the answer of the API itself when it carries no redirect", async () => {
      const response = await serve(
        new Response("inline", { headers: { "content-type": "image/gif" } }),
        false,
      );

      expect(fetchWithTimeout).not.toHaveBeenCalled();
      expect(await response.text()).toBe("inline");
    });

    it("answers with the status of the store when the file is not there", async () => {
      const response = await serve(new Response("gone", { status: 403 }));

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
    });

    it("keeps the status of the API when it has no file and no redirect", async () => {
      const response = await serve(new Response("missing", { status: 404 }), false);

      expect(response.status).toBe(404);
    });

    it("does not throw when the store sends 200 with no body", async () => {
      // The exact answer is not pinned. The route only has to return a response and not crash on a missing body.
      const response = await serve(new Response(null, { status: 200 }));

      expect(response).toBeInstanceOf(Response);
    });
  });
});

describe("video routes of the CMS collections", () => {
  const routes = [
    {
      name: "home",
      load: () => import("./home-cms/video/[key]/route"),
      key: `home-video-${UUID}.mp4`,
      path: `/cms/home/video/home-video-${UUID}.mp4`,
      cache: "private, max-age=31536000, immutable",
    },
    {
      name: "projects",
      load: () => import("./projects-cms/video/[key]/route"),
      key: `demo-my-project-${UUID}.webm`,
      path: `/cms/projects/video/demo-my-project-${UUID}.webm`,
      cache: "private, no-cache",
    },
  ];

  describe.each(routes)("$name", ({ load, key, path, cache }) => {
    async function play(source: Response, headers: Record<string, string> = {}) {
      cmsApi.mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "https://store.example/v" } }),
      );
      fetchWithTimeout.mockResolvedValue(source);
      const { GET } = await load();
      return GET(get("/", headers), keyContext(key));
    }

    it("relays the whole file with its cache policy when there is no range", async () => {
      const response = await play(
        new Response("video", {
          headers: {
            "content-type": "video/mp4",
            "content-length": "5",
            etag: '"abc"',
            "last-modified": "Wed, 01 Jan 2026 00:00:00 GMT",
          },
        }),
      );

      expect(cmsApi).toHaveBeenCalledWith(path, { redirect: "manual" });
      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "https://store.example/v",
        { cache: "no-store", headers: {} },
        10_000,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe(cache);
      expect(response.headers.get("accept-ranges")).toBe("bytes");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("etag")).toBe('"abc"');
      expect(response.headers.get("last-modified")).toBe("Wed, 01 Jan 2026 00:00:00 GMT");
      expect(response.headers.get("content-length")).toBe("5");
      expect(response.headers.has("content-range")).toBe(false);
    });

    it("relays a range to the store and answers 206 with the range of the answer", async () => {
      const response = await play(
        new Response("ab", {
          status: 206,
          headers: {
            "content-type": "video/mp4",
            "content-range": "bytes 0-1/5",
            "content-length": "2",
          },
        }),
        { range: "bytes=0-1" },
      );

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        "https://store.example/v",
        { cache: "no-store", headers: { range: "bytes=0-1" } },
        10_000,
      );
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe("bytes 0-1/5");
      expect(await response.text()).toBe("ab");
    });

    it("answers 200 and not 206 when the visitor sent no range", async () => {
      const response = await play(
        new Response("ab", { status: 206, headers: { "content-type": "video/mp4" } }),
      );

      expect(response.status).toBe(200);
    });

    it("picks the type from the key when the store names none", async () => {
      const response = await play(new Response(new Uint8Array([1])));

      expect(response.headers.get("content-type")).toBe(
        key.endsWith(".webm") ? "video/webm" : "video/mp4",
      );
    });

    it("answers with the status of the store when the file is not there", async () => {
      const response = await play(new Response("no", { status: 416 }));

      expect(response.status).toBe(416);
    });

    it("answers 404 for a key that does not match the pattern, without asking the API", async () => {
      const { GET } = await load();

      const response = await GET(get(), keyContext("../secret.mp4"));

      expect(response.status).toBe(404);
      expect(cmsApi).not.toHaveBeenCalled();
    });

    it("answers with the status of the API when it sends no redirect", async () => {
      cmsApi.mockResolvedValue(new Response(null, { status: 404 }));
      const { GET } = await load();

      const response = await GET(get(), keyContext(key));

      expect(response.status).toBe(404);
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    it("answers 502 when the API answer has no status to relay", async () => {
      cmsApi.mockResolvedValue({ status: 0, headers: new Headers() });
      const { GET } = await load();

      expect((await GET(get(), keyContext(key))).status).toBe(502);
    });
  });
});

describe("GET /api/publications-cms/paper/[key]", () => {
  const KEY = `paper-my-paper-${UUID}.pdf`;

  async function read(key: string, headers: Record<string, string> = {}) {
    const { GET } = await import("./publications-cms/paper/[key]/route");
    return GET(get("/", headers), keyContext(key));
  }

  it.each([
    "paper.pdf",
    "static/publications/../x.pdf",
    "static/publications/a b.pdf",
    `paper-x-${UUID}.exe`,
    "static/other/x.pdf",
  ])("answers 404 for the key '%s' without asking the API", async (key) => {
    const response = await read(key);

    expect(response.status).toBe(404);
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it.each([
    ["static/publications/seed.pdf", "/publications/seed.pdf"],
    ["static/publications/2025/lab-paper.pdf", "/publications/2025/lab-paper.pdf"],
  ])("redirects the bundled key %s to a root relative address", async (key, location) => {
    const response = await read(key);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(location);
    expect(cmsApi).not.toHaveBeenCalled();
  });

  it("relays the range of the reader and answers 206 with the range of the store", async () => {
    cmsApi.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://store.example/p.pdf" } }),
    );
    fetchWithTimeout.mockResolvedValue(
      new Response("%PDF", {
        status: 206,
        headers: {
          "content-type": "application/pdf",
          "content-range": "bytes 0-3/9",
          "content-length": "4",
        },
      }),
    );

    const response = await read(KEY, { range: "bytes=0-3" });

    expect(cmsApi).toHaveBeenCalledWith(`/cms/publications/paper/${KEY}`, { redirect: "manual" });
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      "https://store.example/p.pdf",
      { cache: "no-store", headers: { range: "bytes=0-3" } },
      10_000,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-3/9");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("%PDF");
  });

  it("answers 200 with a PDF type when there is no range and the store names no type", async () => {
    cmsApi.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://store.example/p.pdf" } }),
    );
    fetchWithTimeout.mockResolvedValue(new Response(new Uint8Array([1]), { status: 206 }));

    const response = await read(KEY);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(fetchWithTimeout.mock.calls[0]?.[1]).toEqual({ cache: "no-store", headers: {} });
  });

  it("answers with the status of the store when the file is not there", async () => {
    cmsApi.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://store.example/p.pdf" } }),
    );
    fetchWithTimeout.mockResolvedValue(new Response("no", { status: 404 }));

    expect((await read(KEY)).status).toBe(404);
  });

  it("answers with the status of the API when it sends no redirect", async () => {
    cmsApi.mockResolvedValue(new Response(null, { status: 404 }));

    expect((await read(KEY)).status).toBe(404);
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("answers 502 when the API answer has no status to relay", async () => {
    cmsApi.mockResolvedValue({ status: 0, headers: new Headers() });

    expect((await read(KEY)).status).toBe(502);
  });
});

describe("POST /api/careers-cms/[slug]/apply", () => {
  const context = { params: Promise.resolve({ slug: "backend dev" }) };

  async function apply(request: Request) {
    const { POST } = await import("./careers-cms/[slug]/apply/route");
    return POST(request, context);
  }

  function multipart(headers: Record<string, string> = {}) {
    const form = new FormData();
    form.set("fullName", "Ann Lee");
    return new Request("http://localhost/api/careers-cms/x/apply", {
      method: "POST",
      body: form,
      headers,
    });
  }

  beforeEach(() => {
    vi.stubEnv("ADMIN_PASSPHRASE", "the-admin-passphrase");
  });

  it.each(["application/json", "text/plain", "multipart/form-datax", ""])(
    "refuses the content type '%s' with 400",
    async (contentType) => {
      const response = await apply(
        new Request("http://localhost/x", {
          method: "POST",
          // A string body would make the Request add text/plain, so the missing type case sends bytes
          body: new TextEncoder().encode("{}"),
          headers: contentType ? { "content-type": contentType } : {},
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        message: "The application must be submitted as a form.",
      });
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    },
  );

  it("refuses a body above the limit of the environment plus 1 MB of framing with 413", async () => {
    vi.stubEnv("CMS_MAX_CV_BYTES", String(2 * 1024 * 1024));

    const response = await apply(multipart({ "content-length": String(3 * 1024 * 1024 + 1) }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ message: "The CV must be under 2 MB." });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("lets a body at the limit plus the framing through", async () => {
    vi.stubEnv("CMS_MAX_CV_BYTES", String(2 * 1024 * 1024));
    fetchWithTimeout.mockResolvedValue(Response.json({ ok: true }));

    const response = await apply(multipart({ "content-length": String(3 * 1024 * 1024) }));

    expect(response.status).toBe(200);
  });

  it("streams the form with the boundary, the passphrase and the visitor headers", async () => {
    fetchWithTimeout.mockResolvedValue(Response.json({ id: "a1" }, { status: 201 }));
    const request = multipart({
      "x-forwarded-for": "203.0.113.20",
      "user-agent": "TestAgent/1.0",
    });

    const response = await apply(request);

    const [url, init, timeout] = fetchWithTimeout.mock.calls[0] as [
      string,
      RequestInit & { duplex?: string },
      number,
    ];
    expect(url).toBe("http://api.test/api/cms/jobs/backend%20dev/apply");
    expect(init.method).toBe("POST");
    expect(init.duplex).toBe("half");
    expect(init.body).toBe(request.body);
    expect((init.headers as Record<string, string>)["content-type"]).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    expect(init.headers).toMatchObject({
      "x-cms-passphrase": "the-admin-passphrase",
      "x-visitor-ip": "203.0.113.20",
      "x-visitor-user-agent": "TestAgent/1.0",
    });
    expect(timeout).toBe(1_800_000);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "a1" });
  });

  it("relays the error and the message of the API", async () => {
    fetchWithTimeout.mockResolvedValue(
      Response.json({ message: "Applications are closed." }, { status: 409 }),
    );

    const response = await apply(multipart());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "Applications are closed." });
  });

  it("keeps the status and gives a readable message when the API answers with a page", async () => {
    fetchWithTimeout.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    const response = await apply(multipart());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "We could not submit your application right now. Please try again.",
    });
  });
});

describe("POST /api/events-cms/[slug]/register", () => {
  async function register(body: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import("./events-cms/[slug]/register/route");
    return POST(
      new Request("http://localhost/api/events-cms/x/register", {
        method: "POST",
        body: JSON.stringify(body),
        headers,
      }),
      { params: Promise.resolve({ slug: "open day" }) },
    );
  }

  it("forwards the registration with the visitor headers and relays the answer", async () => {
    cmsApi.mockResolvedValue(Response.json({ id: "r1" }, { status: 201 }));

    const response = await register(
      { name: "Ann" },
      {
        "x-forwarded-for": "203.0.113.30",
        "user-agent": "TestAgent/1.0",
        referer: "https://labmgm.org/events/open-day",
      },
    );

    expect(cmsApi).toHaveBeenCalledWith("/cms/events/open%20day/register", {
      body: JSON.stringify({ name: "Ann" }),
      headers: {
        "x-visitor-ip": "203.0.113.30",
        "x-visitor-user-agent": "TestAgent/1.0",
        "x-visitor-referer": "https://labmgm.org/events/open-day",
      },
      method: "POST",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "r1" });
  });

  it("sends no visitor headers when the request carries none", async () => {
    cmsApi.mockResolvedValue(Response.json({}));

    await register({ name: "Ann" });

    expect(cmsApi.mock.calls[0]?.[1]).toMatchObject({ headers: {} });
  });

  it("relays an error of the API with its message", async () => {
    cmsApi.mockResolvedValue(Response.json({ message: "The event is full." }, { status: 409 }));

    const response = await register({ name: "Ann" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "The event is full." });
  });

  it("keeps the status and gives a readable message when the API answers with a page", async () => {
    cmsApi.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));

    const response = await register({ name: "Ann" });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "We could not submit your registration right now. Please try again.",
    });
  });
});

describe("POST /api/csp-report", () => {
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // The counter of the minute lives in the module, so each test gets a fresh one
    vi.resetModules();
  });

  async function report(body: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import("./csp-report/route");
    return POST(
      new Request("http://localhost/api/csp-report", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers,
      }),
    );
  }

  const logged = () => warn.mock.calls.map((call) => JSON.parse(String(call[1])));

  it("writes one line for a report of the report-uri format and drops the query string", async () => {
    const response = await report({
      "csp-report": {
        "document-uri": "https://labmgm.org/admin?token=secret#frag",
        "blocked-uri": "https://evil.example/x.js?a=1",
        "effective-directive": "script-src",
        "violated-directive": "script-src 'self'",
        "source-file": "https://labmgm.org/app.js#L1",
        "line-number": 12,
        disposition: "report",
      },
    });

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe("csp-report");
    expect(logged()).toEqual([
      {
        page: "https://labmgm.org/admin",
        blocked: "https://evil.example/x.js",
        directive: "script-src",
        violated: "script-src 'self'",
        source: "https://labmgm.org/app.js",
        line: 12,
        disposition: "report",
      },
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
  });

  it("reads the camel case fields of the Reporting API from a list of reports", async () => {
    const response = await report([
      {
        type: "csp-violation",
        body: {
          documentURL: "https://labmgm.org/a?x=1",
          blockedURL: "inline",
          effectiveDirective: "style-src",
          sourceFile: "https://labmgm.org/b.js",
        },
      },
    ]);

    expect(response.status).toBe(204);
    expect(logged()[0]).toMatchObject({
      page: "https://labmgm.org/a",
      blocked: "inline",
      directive: "style-src",
      source: "https://labmgm.org/b.js",
    });
  });

  it("cuts a long field to 200 characters and ignores a line number that is not a number", async () => {
    await report({
      "csp-report": { "violated-directive": "x".repeat(500), "line-number": "12" },
    });

    const [entry] = logged();
    expect(entry.violated).toHaveLength(200);
    expect(entry.line).toBeUndefined();
  });

  it("looks at the first 10 reports of a list only", async () => {
    const item = { "csp-report": { "violated-directive": "img-src" } };

    await report(Array.from({ length: 15 }, () => item));

    expect(warn).toHaveBeenCalledTimes(10);
  });

  it("skips items that are not reports and still answers 204", async () => {
    const response = await report([null, 5, "text", {}, { "csp-report": "no" }, { body: null }]);

    expect(response.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON", async () => {
    const response = await report("{nope");

    expect(response.status).toBe(400);
    expect(warn).not.toHaveBeenCalled();
  });

  it("answers 400 for an empty body", async () => {
    expect((await report("")).status).toBe(400);
  });

  it("answers 400 when reading the body fails", async () => {
    const { POST } = await import("./csp-report/route");
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });

    const response = await POST(
      new Request("http://localhost/api/csp-report", {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(400);
  });

  it("answers 413 for a declared length above 8 KiB without reading the body", async () => {
    const response = await report("{}", { "content-length": String(8 * 1024 + 1) });

    expect(response.status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("answers 413 for a body above 8 KiB that declares no length", async () => {
    const { POST } = await import("./csp-report/route");
    const bytes = new TextEncoder().encode(JSON.stringify({ pad: "x".repeat(9000) }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });

    const response = await POST(
      new Request("http://localhost/api/csp-report", {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(413);
  });

  it("writes at most 60 lines in a minute and starts a new count after the minute", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const item = { "csp-report": { "violated-directive": "img-src" } };

    for (let index = 0; index < 70; index += 1) await report(item);
    expect(warn).toHaveBeenCalledTimes(60);

    now.mockReturnValue(1_000_000 + 59_999);
    await report(item);
    expect(warn).toHaveBeenCalledTimes(60);

    now.mockReturnValue(1_000_000 + 60_000);
    await report(item);
    expect(warn).toHaveBeenCalledTimes(61);
  });

  it("stops the lines of one list at the limit but still answers 204", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const item = { "csp-report": { "violated-directive": "img-src" } };
    for (let index = 0; index < 58; index += 1) await report(item);

    const response = await report(Array.from({ length: 5 }, () => item));

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(60);
  });
});
