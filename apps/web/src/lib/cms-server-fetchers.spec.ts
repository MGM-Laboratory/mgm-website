import { beforeEach, describe, expect, it, vi } from "vitest";

const { cmsApi } = vi.hoisted(() => ({
  cmsApi: vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
}));

vi.mock("@/lib/cms-api", () => ({ cmsApi }));

import { fetchAdminAccounts } from "./admin-records";
import { fetchArticleFeed, fetchArticleRecord, fetchArticleRecords } from "./article-cms-server";
import {
  fetchCareerAdminList,
  fetchCareerApplications,
  fetchCareerFeed,
  fetchCareerRecord,
} from "./career-cms-server";
import { fetchContactInquiries } from "./contact-inquiries-cms-server";
import {
  fetchEventAdminList,
  fetchEventBySlug,
  fetchEventRegistrations,
  fetchEventsFeed,
} from "./events-cms-server";
import { fetchHomeContent } from "./home-cms-server";
import { fetchLinksAdminSnapshot } from "./links-cms-server";
import { fetchMemberRecords } from "./member-cms-server";
import {
  fetchProjectAdminList,
  fetchProjectFeed,
  fetchProjectRecord,
  readProjectDetail,
} from "./project-cms-server";
import {
  fetchPublicationFeed,
  fetchPublicationRecord,
  fetchPublicationRecords,
} from "./publication-cms-server";
import {
  ensureResearchCmsSeeded,
  fetchResearchAdminList,
  fetchResearchFeed,
  fetchResearchRecord,
} from "./research-cms-server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const fail = (status = 500) => new Response("", { status });

beforeEach(() => {
  cmsApi.mockReset();
});

// Each row is a reader that answers the records of one path and throws on failure
const throwingLists: [string, () => Promise<unknown>, string][] = [
  ["article records", () => fetchArticleRecords(), "/cms/articles"],
  ["article feed", () => fetchArticleFeed(), "/cms/articles/feed"],
  ["member records", () => fetchMemberRecords(), "/cms/members"],
  ["publication records", () => fetchPublicationRecords(), "/cms/publications"],
  ["publication feed", () => fetchPublicationFeed(), "/cms/publications/feed"],
  ["project admin list", () => fetchProjectAdminList(), "/cms/projects/admin"],
  ["project feed", () => fetchProjectFeed(), "/cms/projects/feed"],
  ["research admin list", () => fetchResearchAdminList(), "/cms/research/admin"],
  ["research feed", () => fetchResearchFeed(), "/cms/research/feed"],
  ["event feed", () => fetchEventsFeed(), "/cms/events"],
  ["admin accounts", () => fetchAdminAccounts(), "/cms/admins"],
];

describe.each(throwingLists)("%s", (_name, read, path) => {
  it("returns the records of the answer", async () => {
    cmsApi.mockResolvedValue(json({ records: [{ slug: "a" }] }));

    expect(await read()).toEqual([{ slug: "a" }]);
    expect(cmsApi).toHaveBeenCalledWith(path);
  });

  it("returns an empty list when the answer has no records", async () => {
    cmsApi.mockResolvedValue(json({}));

    expect(await read()).toEqual([]);
  });

  it("throws when the API refuses", async () => {
    cmsApi.mockResolvedValue(fail());

    await expect(read()).rejects.toThrow(/could not be read/);
  });
});

const quietLists: [string, () => Promise<unknown>, string][] = [
  ["career feed", () => fetchCareerFeed(), "/cms/jobs"],
  ["career admin list", () => fetchCareerAdminList(), "/cms/jobs/admin"],
  ["career applications", () => fetchCareerApplications(), "/cms/jobs/applications"],
  ["event admin list", () => fetchEventAdminList(), "/cms/events/admin"],
  ["event registrations", () => fetchEventRegistrations(), "/cms/events/registrations"],
  ["contact inquiries", () => fetchContactInquiries(), "/cms/contact-inquiries"],
];

describe.each(quietLists)("%s", (_name, read, path) => {
  it("returns the records of the answer", async () => {
    cmsApi.mockResolvedValue(json({ records: [{ slug: "a" }] }));

    expect(await read()).toEqual([{ slug: "a" }]);
    expect(cmsApi).toHaveBeenCalledWith(path);
  });

  it("returns an empty list when the answer has no records", async () => {
    cmsApi.mockResolvedValue(json({}));

    expect(await read()).toEqual([]);
  });

  it("returns an empty list when the API refuses", async () => {
    cmsApi.mockResolvedValue(fail());

    expect(await read()).toEqual([]);
  });
});

const singles: [string, (slug: string) => Promise<unknown>, string][] = [
  ["article", (slug) => fetchArticleRecord(slug), "/cms/articles/"],
  ["publication", (slug) => fetchPublicationRecord(slug), "/cms/publications/"],
  ["project", (slug) => fetchProjectRecord(slug), "/cms/projects/"],
  ["research", (slug) => fetchResearchRecord(slug), "/cms/research/"],
  ["event", (slug) => fetchEventBySlug(slug), "/cms/events/"],
  ["career", (slug) => fetchCareerRecord(slug), "/cms/jobs/"],
];

describe.each(singles)("single %s record", (_name, read, prefix) => {
  it("returns the record and encodes the slug", async () => {
    cmsApi.mockResolvedValue(json({ record: { slug: "a b" } }));

    expect(await read("a b/c")).toEqual({ slug: "a b" });
    expect(cmsApi).toHaveBeenCalledWith(`${prefix}a%20b%2Fc`);
  });

  it("returns undefined for a missing record", async () => {
    cmsApi.mockResolvedValue(fail(404));

    expect(await read("x")).toBeUndefined();
  });

  it("returns undefined when the answer has no record", async () => {
    cmsApi.mockResolvedValue(json({}));

    expect(await read("x")).toBeUndefined();
  });

  it("throws on any other failure", async () => {
    cmsApi.mockResolvedValue(fail(500));

    await expect(read("x")).rejects.toThrow(/could not be read/);
  });
});

describe("fetchHomeContent", () => {
  it("returns the saved record", async () => {
    cmsApi.mockResolvedValue(json({ record: { videoMode: "upload", videoKey: "k" } }));

    expect(await fetchHomeContent()).toEqual({ videoMode: "upload", videoKey: "k" });
  });

  it("falls back to the default without a record, on a refusal and on a network error", async () => {
    cmsApi.mockResolvedValueOnce(json({}));
    const withoutRecord = await fetchHomeContent();
    cmsApi.mockResolvedValueOnce(fail());
    const refused = await fetchHomeContent();
    cmsApi.mockRejectedValueOnce(new Error("offline"));
    const offline = await fetchHomeContent();

    expect(refused).toEqual(withoutRecord);
    expect(offline).toEqual(withoutRecord);
  });
});

describe("fetchLinksAdminSnapshot", () => {
  it("combines the domains and the links", async () => {
    cmsApi.mockImplementation(async (path) =>
      path.endsWith("/domains") ? json({ domains: [{ id: "d" }] }) : json({ links: [{ id: "l" }] }),
    );

    expect(await fetchLinksAdminSnapshot()).toEqual({
      domains: [{ id: "d" }],
      links: [{ id: "l" }],
    });
  });

  it("uses empty lists for a refusal or a missing key", async () => {
    cmsApi.mockImplementation(async (path) => (path.endsWith("/domains") ? fail() : json({})));

    expect(await fetchLinksAdminSnapshot()).toEqual({ domains: [], links: [] });
  });
});

describe("readProjectDetail", () => {
  it("returns the record with the feed", async () => {
    cmsApi.mockImplementation(async (path) =>
      path === "/cms/projects/feed"
        ? json({ records: [{ slug: "f" }] })
        : json({ record: { slug: "p" } }),
    );

    expect(await readProjectDetail("p")).toEqual({ record: { slug: "p" }, feed: [{ slug: "f" }] });
  });

  it("counts a failed feed as empty and keeps a missing record undefined", async () => {
    cmsApi.mockImplementation(async (path) => (path === "/cms/projects/feed" ? fail() : fail(404)));

    expect(await readProjectDetail("p")).toEqual({ record: undefined, feed: [] });
  });

  it("lets a failed record read throw", async () => {
    cmsApi.mockResolvedValue(fail());

    await expect(readProjectDetail("p")).rejects.toThrow(/could not be read/);
  });
});

describe("ensureResearchCmsSeeded", () => {
  it("returns the existing records without importing", async () => {
    cmsApi.mockResolvedValue(json({ records: [{ slug: "a" }] }));

    expect(await ensureResearchCmsSeeded()).toEqual([{ slug: "a" }]);
    expect(cmsApi).toHaveBeenCalledTimes(1);
  });

  it("imports the seed when the store is empty, once for parallel callers, and rereads", async () => {
    let imported = false;
    cmsApi.mockImplementation(async (path, init) => {
      if (path === "/cms/research/bootstrap") {
        imported = true;
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body)).records.length).toBeGreaterThan(0);
        return json({});
      }
      return json({ records: imported ? [{ slug: "seeded" }] : [] });
    });

    const [first, second] = await Promise.all([
      ensureResearchCmsSeeded(),
      ensureResearchCmsSeeded(),
    ]);

    expect(first).toEqual([{ slug: "seeded" }]);
    expect(second).toEqual([{ slug: "seeded" }]);
    expect(cmsApi.mock.calls.filter(([path]) => path === "/cms/research/bootstrap")).toHaveLength(
      1,
    );
  });

  it("throws when the import fails and lets the next call try again", async () => {
    cmsApi.mockImplementation(async (path) =>
      path === "/cms/research/bootstrap" ? fail() : json({ records: [] }),
    );
    // the earlier test left a finished import behind, so only a fresh module can fail here
    vi.resetModules();
    const fresh = await import("./research-cms-server");

    await expect(fresh.ensureResearchCmsSeeded()).rejects.toThrow(/could not be imported/);

    cmsApi.mockImplementation(async (path) =>
      path === "/cms/research/bootstrap" ? json({}) : json({ records: [{ slug: "later" }] }),
    );
    expect(await fresh.ensureResearchCmsSeeded()).toEqual([{ slug: "later" }]);
  });
});
