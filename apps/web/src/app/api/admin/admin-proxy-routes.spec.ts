import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminPermission, requireSuperadmin, cmsApi } = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  requireSuperadmin: vi.fn(),
  cmsApi: vi.fn(),
}));

vi.mock("@/lib/admin-session", () => ({
  requireAdminPermission,
  requireSuperadmin,
  getAdminSession: vi.fn(),
  clearAdminSession: vi.fn(),
}));
vi.mock("@/lib/cms-api", () => ({ apiBaseUrl: () => "http://api.test/api", cmsApi }));

type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;
// A route module also exports `dynamic` and `runtime`, so only the method named by the case is read as a handler
type RouteModule = Record<string, unknown>;

type Case = {
  name: string;
  load: () => Promise<RouteModule>;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** The page and action that the handler asks for, or "superadmin" for the superadmin only gate */
  gate: readonly [string, string] | "superadmin";
  params?: Record<string, string>;
  /** Added to the request address */
  query?: string;
  body?: unknown;
  /** The path that the API receives */
  path: string;
  /** What the API receives besides the path, undefined for a plain read */
  init?: { method: string; body?: string };
};

const json = (value: unknown) => JSON.stringify(value);
const payload = { record: { title: "x" } };

const cases: Case[] = [
  {
    name: "admins list",
    load: () => import("./admins/route"),
    method: "GET",
    gate: "superadmin",
    path: "/cms/admins",
  },
  {
    name: "admins create",
    load: () => import("./admins/route"),
    method: "POST",
    gate: "superadmin",
    body: payload,
    path: "/cms/admins",
    init: { method: "POST", body: json(payload) },
  },
  {
    name: "admins update",
    load: () => import("./admins/[slug]/route"),
    method: "PUT",
    gate: "superadmin",
    params: { slug: "a b/c" },
    body: payload,
    path: "/cms/admins/a%20b%2Fc",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "admins delete",
    load: () => import("./admins/[slug]/route"),
    method: "DELETE",
    gate: "superadmin",
    params: { slug: "a b/c" },
    path: "/cms/admins/a%20b%2Fc",
    init: { method: "DELETE" },
  },
  {
    name: "applications list",
    load: () => import("./applications/route"),
    method: "GET",
    gate: ["careers", "read"],
    path: "/cms/jobs/applications",
  },
  {
    name: "application detail",
    load: () => import("./applications/[slug]/route"),
    method: "GET",
    gate: ["careers", "read"],
    params: { slug: "ann lee" },
    path: "/cms/jobs/applications/ann%20lee",
  },
  {
    name: "application state",
    load: () => import("./applications/[slug]/route"),
    method: "PUT",
    gate: ["careers", "write"],
    params: { slug: "ann" },
    body: { state: "reviewed" },
    path: "/cms/jobs/applications/ann/state",
    init: { method: "PUT", body: json({ state: "reviewed" }) },
  },
  {
    name: "applications bulk",
    load: () => import("./applications/bulk/route"),
    method: "POST",
    gate: ["careers", "write"],
    body: { ids: ["a"], action: "archive" },
    path: "/cms/jobs/applications/bulk",
    init: { method: "POST", body: json({ ids: ["a"], action: "archive" }) },
  },
  {
    name: "articles list",
    load: () => import("./articles/route"),
    method: "GET",
    gate: ["articles", "read"],
    path: "/cms/articles/admin",
  },
  {
    name: "article save",
    load: () => import("./articles/[slug]/route"),
    method: "PUT",
    gate: ["articles", "write"],
    params: { slug: "post" },
    body: payload,
    path: "/cms/articles/post",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "article delete",
    load: () => import("./articles/[slug]/route"),
    method: "DELETE",
    gate: ["articles", "delete"],
    params: { slug: "post" },
    path: "/cms/articles/post",
    init: { method: "DELETE" },
  },
  {
    name: "article cover",
    load: () => import("./articles/[slug]/cover/route"),
    method: "POST",
    gate: ["articles", "write"],
    params: { slug: "post" },
    body: { image: "data" },
    path: "/cms/articles/post/cover",
    init: { method: "POST", body: json({ image: "data" }) },
  },
  {
    name: "careers list",
    load: () => import("./careers/route"),
    method: "GET",
    gate: ["careers", "read"],
    path: "/cms/jobs/admin",
  },
  {
    name: "career save",
    load: () => import("./careers/[slug]/route"),
    method: "PUT",
    gate: ["careers", "write"],
    params: { slug: "role" },
    body: payload,
    path: "/cms/jobs/role",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "career delete",
    load: () => import("./careers/[slug]/route"),
    method: "DELETE",
    gate: ["careers", "delete"],
    params: { slug: "role" },
    path: "/cms/jobs/role",
    init: { method: "DELETE" },
  },
  {
    name: "career media",
    load: () => import("./careers/[slug]/media/route"),
    method: "POST",
    gate: ["careers", "write"],
    params: { slug: "role" },
    body: { image: "data" },
    path: "/cms/jobs/role/media",
    init: { method: "POST", body: json({ image: "data" }) },
  },
  {
    name: "contact inquiries list",
    load: () => import("./contact-inquiries/route"),
    method: "GET",
    gate: ["contact-inquiries", "read"],
    path: "/cms/contact-inquiries",
  },
  {
    name: "contact inquiry state",
    load: () => import("./contact-inquiries/[slug]/route"),
    method: "PUT",
    gate: ["contact-inquiries", "write"],
    params: { slug: "msg" },
    body: { state: "read" },
    path: "/cms/contact-inquiries/msg/state",
    init: { method: "PUT", body: json({ state: "read" }) },
  },
  {
    name: "contact inquiries bulk",
    load: () => import("./contact-inquiries/bulk/route"),
    method: "POST",
    gate: ["contact-inquiries", "write"],
    body: { ids: ["a"], action: "read" },
    path: "/cms/contact-inquiries/bulk",
    init: { method: "POST", body: json({ ids: ["a"], action: "read" }) },
  },
  {
    name: "mail provider status",
    load: () => import("./contact-settings/mail-provider-status/route"),
    method: "GET",
    gate: ["contact", "read"],
    path: "/cms/contact-settings/mail-provider-status",
  },
  {
    name: "contact settings read",
    load: () => import("./contact-settings/route"),
    method: "GET",
    gate: ["contact", "read"],
    path: "/cms/contact-settings",
  },
  {
    name: "events list",
    load: () => import("./events/route"),
    method: "GET",
    gate: ["events", "read"],
    path: "/cms/events/admin",
  },
  {
    name: "event save",
    load: () => import("./events/[slug]/route"),
    method: "PUT",
    gate: ["events", "write"],
    params: { slug: "talk" },
    body: payload,
    path: "/cms/events/talk",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "event delete",
    load: () => import("./events/[slug]/route"),
    method: "DELETE",
    gate: ["events", "delete"],
    params: { slug: "talk" },
    path: "/cms/events/talk",
    init: { method: "DELETE" },
  },
  {
    name: "event media",
    load: () => import("./events/[slug]/media/route"),
    method: "POST",
    gate: ["events", "write"],
    params: { slug: "talk" },
    body: { image: "data" },
    path: "/cms/events/talk/media",
    init: { method: "POST", body: json({ image: "data" }) },
  },
  {
    name: "registrations list",
    load: () => import("./events/registrations/route"),
    method: "GET",
    gate: ["events", "read"],
    path: "/cms/events/registrations",
  },
  {
    name: "registration state",
    load: () => import("./events/registrations/[slug]/route"),
    method: "PUT",
    gate: ["events", "write"],
    params: { slug: "reg" },
    body: { state: "approved" },
    path: "/cms/events/registrations/reg/state",
    init: { method: "PUT", body: json({ state: "approved" }) },
  },
  {
    name: "registrations bulk",
    load: () => import("./events/registrations/bulk/route"),
    method: "POST",
    gate: ["events", "write"],
    body: { ids: ["a"], action: "approve" },
    path: "/cms/events/registrations/bulk",
    init: { method: "POST", body: json({ ids: ["a"], action: "approve" }) },
  },
  {
    name: "resolve maps link",
    load: () => import("./events/resolve-maps-link/route"),
    method: "POST",
    gate: ["events", "write"],
    body: { url: "https://maps.example/x" },
    path: "/cms/events/resolve-maps-link",
    init: { method: "POST", body: json({ url: "https://maps.example/x" }) },
  },
  {
    name: "home read",
    load: () => import("./home-content/route"),
    method: "GET",
    gate: ["home", "read"],
    path: "/cms/home",
  },
  {
    name: "home save",
    load: () => import("./home-content/route"),
    method: "PUT",
    gate: ["home", "write"],
    body: payload,
    path: "/cms/home",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "link analytics",
    load: () => import("./links/[id]/analytics/route"),
    method: "GET",
    gate: ["links", "read"],
    params: { id: "l 1" },
    path: "/shortlinks/admin/links/l%201/analytics",
  },
  {
    name: "link update",
    load: () => import("./links/[id]/route"),
    method: "PUT",
    gate: ["links", "write"],
    params: { id: "l1" },
    body: payload,
    path: "/shortlinks/admin/links/l1",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "link delete",
    load: () => import("./links/[id]/route"),
    method: "DELETE",
    gate: ["links", "delete"],
    params: { id: "l1" },
    path: "/shortlinks/admin/links/l1",
    init: { method: "DELETE" },
  },
  {
    name: "domain connect",
    load: () => import("./links/domains/[id]/connect/route"),
    method: "POST",
    gate: ["links", "write"],
    params: { id: "d1" },
    path: "/shortlinks/admin/domains/d1/connect",
    init: { method: "POST", body: "{}" },
  },
  {
    name: "domain check",
    load: () => import("./links/domains/[id]/route"),
    method: "GET",
    gate: ["links", "read"],
    params: { id: "d1" },
    path: "/shortlinks/admin/domains/d1",
  },
  {
    name: "domain delete",
    load: () => import("./links/domains/[id]/route"),
    method: "DELETE",
    gate: ["links", "delete"],
    params: { id: "d1" },
    path: "/shortlinks/admin/domains/d1",
    init: { method: "DELETE" },
  },
  {
    name: "domains list",
    load: () => import("./links/domains/route"),
    method: "GET",
    gate: ["links", "read"],
    path: "/shortlinks/admin/domains",
  },
  {
    name: "domain add",
    load: () => import("./links/domains/route"),
    method: "POST",
    gate: ["links", "write"],
    body: { host: "go.example.org" },
    path: "/shortlinks/admin/domains",
    init: { method: "POST", body: json({ host: "go.example.org" }) },
  },
  {
    name: "links list without a filter",
    load: () => import("./links/route"),
    method: "GET",
    gate: ["links", "read"],
    path: "/shortlinks/admin/links",
  },
  {
    name: "links list with both filters",
    load: () => import("./links/route"),
    method: "GET",
    gate: ["links", "read"],
    query: "?search=a%20b&domainId=d1&ignored=1",
    path: "/shortlinks/admin/links?search=a+b&domainId=d1",
  },
  {
    name: "link create",
    load: () => import("./links/route"),
    method: "POST",
    gate: ["links", "write"],
    body: payload,
    path: "/shortlinks/admin/links",
    init: { method: "POST", body: json(payload) },
  },
  {
    name: "member save",
    load: () => import("./members/[slug]/route"),
    method: "PUT",
    gate: ["members", "write"],
    params: { slug: "ann" },
    body: payload,
    path: "/cms/members/ann",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "member delete",
    load: () => import("./members/[slug]/route"),
    method: "DELETE",
    gate: ["members", "delete"],
    params: { slug: "ann" },
    path: "/cms/members/ann",
    init: { method: "DELETE" },
  },
  {
    name: "projects list",
    load: () => import("./projects/route"),
    method: "GET",
    gate: ["projects", "read"],
    path: "/cms/projects/admin",
  },
  {
    name: "project save",
    load: () => import("./projects/[slug]/route"),
    method: "PUT",
    gate: ["projects", "write"],
    params: { slug: "demo" },
    body: payload,
    path: "/cms/projects/demo",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "project delete",
    load: () => import("./projects/[slug]/route"),
    method: "DELETE",
    gate: ["projects", "delete"],
    params: { slug: "demo" },
    path: "/cms/projects/demo",
    init: { method: "DELETE" },
  },
  {
    name: "project media",
    load: () => import("./projects/[slug]/media/route"),
    method: "POST",
    gate: ["projects", "write"],
    params: { slug: "demo" },
    body: { image: "data" },
    path: "/cms/projects/demo/media",
    init: { method: "POST", body: json({ image: "data" }) },
  },
  {
    name: "contributor photo",
    load: () => import("./projects/contributor-photo/route"),
    method: "POST",
    gate: ["projects", "write"],
    body: { image: "data" },
    path: "/cms/projects/contributor-photo",
    init: { method: "POST", body: json({ image: "data" }) },
  },
  {
    name: "publications list",
    load: () => import("./publications/route"),
    method: "GET",
    gate: ["publications", "read"],
    path: "/cms/publications/admin",
  },
  {
    name: "publication save",
    load: () => import("./publications/[slug]/route"),
    method: "PUT",
    gate: ["publications", "write"],
    params: { slug: "paper" },
    body: payload,
    path: "/cms/publications/paper",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "publication delete",
    load: () => import("./publications/[slug]/route"),
    method: "DELETE",
    gate: ["publications", "delete"],
    params: { slug: "paper" },
    path: "/cms/publications/paper",
    init: { method: "DELETE" },
  },
  {
    name: "author photo",
    load: () => import("./publications/author-photo/route"),
    method: "POST",
    gate: ["publications", "write"],
    body: { image: "data" },
    path: "/cms/publications/author-photo",
    init: { method: "POST", body: json({ image: "data" }) },
  },
  {
    name: "research list",
    load: () => import("./research/route"),
    method: "GET",
    gate: ["research", "read"],
    path: "/cms/research/admin",
  },
  {
    name: "research save",
    load: () => import("./research/[slug]/route"),
    method: "PUT",
    gate: ["research", "write"],
    params: { slug: "study" },
    body: payload,
    path: "/cms/research/study",
    init: { method: "PUT", body: json(payload) },
  },
  {
    name: "research delete",
    load: () => import("./research/[slug]/route"),
    method: "DELETE",
    gate: ["research", "delete"],
    params: { slug: "study" },
    path: "/cms/research/study",
    init: { method: "DELETE" },
  },
  {
    name: "research cover",
    load: () => import("./research/[slug]/cover/route"),
    method: "POST",
    gate: ["research", "write"],
    params: { slug: "study" },
    body: { image: "data" },
    path: "/cms/research/study/cover",
    init: { method: "POST", body: json({ image: "data" }) },
  },
];

function requestFor(testCase: Case) {
  const hasBody = testCase.body !== undefined;
  return new Request(`http://localhost/api/admin/x${testCase.query ?? ""}`, {
    method: testCase.method,
    body: hasBody ? json(testCase.body) : undefined,
  });
}

async function call(testCase: Case) {
  const module = await testCase.load();
  const handler = module[testCase.method] as Handler | undefined;
  if (!handler) throw new Error(`${testCase.name} has no ${testCase.method} handler`);
  const context = { params: Promise.resolve(testCase.params ?? {}) } as never;
  return handler(requestFor(testCase), context);
}

const session = { role: "admin", permissions: {} };

function allowGate(testCase: Case) {
  const gate = testCase.gate === "superadmin" ? requireSuperadmin : requireAdminPermission;
  gate.mockResolvedValue({ status: 200, session });
}

describe("admin proxy routes", () => {
  beforeEach(() => {
    requireAdminPermission.mockReset();
    requireSuperadmin.mockReset();
    cmsApi.mockReset();
    cmsApi.mockResolvedValue(Response.json({ upstream: true }, { status: 201 }));
  });

  describe.each(cases)("$name", (testCase) => {
    const gateMock = () =>
      testCase.gate === "superadmin" ? requireSuperadmin : requireAdminPermission;

    it.each([
      [401, "Unauthorized"],
      [403, "Forbidden"],
    ])("answers %i and never calls the API", async (status, message) => {
      gateMock().mockResolvedValue({ status });

      const response = await call(testCase);

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: message });
      expect(cmsApi).not.toHaveBeenCalled();
    });

    it("asks the gate for the page and action of the handler", async () => {
      allowGate(testCase);

      await call(testCase);

      if (testCase.gate === "superadmin") {
        expect(requireSuperadmin).toHaveBeenCalledTimes(1);
        expect(requireAdminPermission).not.toHaveBeenCalled();
      } else {
        expect(requireAdminPermission).toHaveBeenCalledWith(...testCase.gate);
        expect(requireSuperadmin).not.toHaveBeenCalled();
      }
    });

    it("forwards the path, method and body and relays the answer of the API", async () => {
      allowGate(testCase);

      const response = await call(testCase);

      expect(cmsApi).toHaveBeenCalledTimes(1);
      const [path, init] = cmsApi.mock.calls[0] as [string, RequestInit | undefined];
      expect(path).toBe(testCase.path);
      if (testCase.init) expect(init).toEqual(testCase.init);
      else expect(init).toBeUndefined();
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ upstream: true });
    });

    it("relays an error status and message of the API unchanged", async () => {
      allowGate(testCase);
      cmsApi.mockResolvedValue(Response.json({ message: "Not found." }, { status: 404 }));

      const response = await call(testCase);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ message: "Not found." });
    });
  });
});

describe("PUT /api/admin/contact-settings", () => {
  const settings = {
    emails: ["lab@example.org"],
    address: "Malang",
    lat: -7.9,
    lng: 112.6,
    strategy: "weighted",
    providers: ["resend"],
  };

  async function put(role: string, body: unknown = settings) {
    requireAdminPermission.mockResolvedValue({ status: 200, session: { role } });
    const { PUT } = await import("./contact-settings/route");
    return PUT(
      new Request("http://localhost/api/admin/contact-settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    );
  }

  beforeEach(() => {
    requireAdminPermission.mockReset();
    cmsApi.mockReset();
    cmsApi.mockResolvedValue(Response.json({ ok: true }));
  });

  it("sends the whole form with PUT for the superadmin", async () => {
    await put("superadmin");

    expect(requireAdminPermission).toHaveBeenCalledWith("contact", "write");
    expect(cmsApi).toHaveBeenCalledWith("/cms/contact-settings", {
      body: JSON.stringify(settings),
      method: "PUT",
    });
  });

  it("sends only the contact details with PATCH for an ordinary admin", async () => {
    await put("admin");

    expect(cmsApi).toHaveBeenCalledWith("/cms/contact-settings", {
      body: JSON.stringify({
        emails: settings.emails,
        address: settings.address,
        lat: settings.lat,
        lng: settings.lng,
      }),
      method: "PATCH",
    });
    expect(String(cmsApi.mock.calls[0]?.[1]?.body)).not.toContain("strategy");
  });

  it("answers 403 without reading the body when the admin has no write permission", async () => {
    requireAdminPermission.mockResolvedValue({ status: 403 });
    const { PUT } = await import("./contact-settings/route");

    const response = await PUT(
      new Request("http://localhost/x", { method: "PUT", body: "not json" }),
    );

    expect(response.status).toBe(403);
    expect(cmsApi).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/logout", () => {
  it("clears the session and redirects with a relative address", async () => {
    const { clearAdminSession } = await import("@/lib/admin-session");
    const { POST } = await import("./logout/route");

    const response = await POST();

    expect(clearAdminSession).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login");
  });
});

describe("GET /api/admin/me", () => {
  it("answers 401 without a session", async () => {
    const { getAdminSession } = await import("@/lib/admin-session");
    vi.mocked(getAdminSession).mockResolvedValue(null);
    const { GET } = await import("./me/route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns the session of the signed in admin", async () => {
    const { getAdminSession } = await import("@/lib/admin-session");
    const viewer = { id: "ann", role: "admin", permissions: { articles: ["read"] } };
    vi.mocked(getAdminSession).mockResolvedValue(viewer as never);
    const { GET } = await import("./me/route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(viewer);
  });
});
