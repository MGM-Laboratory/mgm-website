// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import type { Member } from "@/data/members";

import {
  draftToResearch,
  emptyResearchDraft,
  featuredResearch,
  formatResearchDate,
  formatResearchDateShort,
  formatResearchPeriod,
  isResearchSlug,
  latestMilestone,
  publishedResearch,
  researchCoverUrl,
  researchMembers,
  researchToDraft,
  researchYears,
  safeResearchHref,
  slugify,
  type CmsResearchRecord,
  type ResearchDraft,
} from "./research-cms";

function research(extra: Partial<ResearchDraft> = {}): ResearchDraft {
  return { ...emptyResearchDraft(), slug: "r", title: "R", draft: false, ...extra };
}

function record(
  slug: string,
  extra: Partial<ResearchDraft> = {},
  updatedAt?: string,
): CmsResearchRecord {
  return { slug, body: [], updatedAt, research: research({ slug, ...extra }) };
}

describe("slugs", () => {
  it("slugifies and checks slugs", () => {
    expect(slugify("Hello There")).toBe("hello-there");
    expect(isResearchSlug("a-b")).toBe(true);
    expect(isResearchSlug("A_b")).toBe(false);
  });
});

describe("emptyResearchDraft", () => {
  it("starts as an exploring draft", () => {
    expect(emptyResearchDraft()).toMatchObject({
      status: "exploring",
      draft: true,
      featured: false,
    });
  });
});

describe("draftToResearch", () => {
  it("trims text and removes duplicates", () => {
    const result = draftToResearch(
      research({
        title: " T ",
        summary: " S ",
        question: " Q ",
        context: " ",
        contribution: " C ",
        startDate: "",
        endDate: "2025-01-01",
        areas: ["website", "website", "mobile"],
        methods: [" a ", "a", ""],
        memberSlugs: ["x", "x"],
        coverAlt: " ",
        seoTitle: " t ",
        seoDescription: "",
        milestones: [
          {
            id: "1",
            date: "2025-01-01",
            title: " M ",
            summary: " s ",
            relatedUrl: " ",
            relatedLabel: " l ",
          },
        ],
        outputs: [{ id: "o", type: "project", label: " L ", href: " /h ", recordSlug: " " }],
        partners: [],
      }),
    );

    expect(result).toMatchObject({
      title: "T",
      summary: "S",
      question: "Q",
      context: undefined,
      contribution: "C",
      startDate: undefined,
      endDate: "2025-01-01",
      areas: ["website", "mobile"],
      methods: ["a"],
      memberSlugs: ["x"],
      coverAlt: undefined,
      seoTitle: "t",
      seoDescription: undefined,
      partners: undefined,
    });
    expect(result.milestones[0]).toMatchObject({
      title: "M",
      summary: "s",
      relatedUrl: undefined,
      relatedLabel: "l",
    });
    expect(result.outputs[0]).toMatchObject({ label: "L", href: "/h", recordSlug: undefined });
  });

  it("keeps partners when there are some", () => {
    const partners = [{ name: "P" }];
    expect(draftToResearch(research({ partners })).partners).toBe(partners);
  });
});

describe("researchToDraft", () => {
  it("fills editor defaults and copies nested values", () => {
    const source = research({
      milestones: [{ id: "1", date: "2025-01-01", title: "t", summary: "s" }],
      outputs: [{ id: "o", type: "article", label: "l", href: "/h" }],
      partners: [{ name: "P" }],
    });
    const draft = researchToDraft(source);

    expect(draft).toMatchObject({
      context: "",
      contribution: "",
      startDate: "",
      endDate: "",
      coverAlt: "",
      seoTitle: "",
      seoDescription: "",
    });
    expect(draft.milestones[0]).not.toBe(source.milestones[0]);
    expect(draft.outputs[0]).not.toBe(source.outputs[0]);
    expect(draft.partners?.[0]).not.toBe(source.partners?.[0]);
  });

  it("defaults partners to an empty list", () => {
    expect(researchToDraft(research()).partners).toEqual([]);
  });
});

describe("listing", () => {
  it("drops drafts", () => {
    expect(
      publishedResearch([record("a"), record("b", { draft: true })]).map((entry) => entry.slug),
    ).toEqual(["a"]);
  });

  it("picks the newest published featured record", () => {
    const records = [
      record("old", { featured: true }, "2024-01-01"),
      record("new", { featured: true }, "2025-01-01"),
      record("draft", { featured: true, draft: true }, "2030-01-01"),
      record("plain", {}, "2031-01-01"),
    ];

    expect(featuredResearch(records)?.slug).toBe("new");
  });

  it("copes with a missing save time and with nothing featured", () => {
    expect(
      featuredResearch([record("a", { featured: true }), record("b", { featured: true }, "2024")])
        ?.slug,
    ).toBe("b");
    expect(featuredResearch([record("a")])).toBeUndefined();
    expect(featuredResearch([])).toBeUndefined();
  });

  it("resolves members in order and skips unknown slugs", () => {
    const members = [{ slug: "b" }, { slug: "a" }] as unknown as Member[];

    expect(
      researchMembers(record("x", { memberSlugs: ["a", "zz", "b"] }), members).map(
        (member) => member.slug,
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("milestones and years", () => {
  it("finds the latest milestone", () => {
    const items = research({
      milestones: [
        { id: "1", date: "2024-01-01", title: "old", summary: "" },
        { id: "2", date: "2025-06-01", title: "new", summary: "" },
      ],
    });

    expect(latestMilestone(items)?.title).toBe("new");
    expect(latestMilestone(research())).toBeUndefined();
  });

  it("lists the years of the span and the milestones, sorted without repeats", () => {
    expect(
      researchYears(
        research({
          startDate: "2023-05-01",
          endDate: "2025-01-01",
          milestones: [
            { id: "1", date: "2024-02-01", title: "", summary: "" },
            { id: "2", date: "2023-09-01", title: "", summary: "" },
          ],
        }),
      ),
    ).toEqual(["2023", "2024", "2025"]);
    expect(researchYears(research())).toEqual([]);
  });
});

describe("urls", () => {
  it("resolves cover keys", () => {
    expect(researchCoverUrl()).toBeUndefined();
    expect(researchCoverUrl("static/a.png")).toBe("/a.png");
    expect(researchCoverUrl("a b")).toBe("/api/research-cms/media/a%20b");
  });

  it("allows only web urls and site paths", () => {
    expect(safeResearchHref("https://x.test")).toBe("https://x.test");
    expect(safeResearchHref("/path")).toBe("/path");
    expect(safeResearchHref("//x.test")).toBeUndefined();
    expect(safeResearchHref("javascript:alert(1)")).toBeUndefined();
    expect(safeResearchHref("mailto:a@b.test")).toBeUndefined();
  });
});

describe("formatters", () => {
  it("formats dates", () => {
    expect(formatResearchDate("2024-08-31")).toBe("Saturday, August 31, 2024");
    expect(formatResearchDateShort("2024-08-31")).toBe("31 Agustus 2024");
    expect(formatResearchDateShort("2024")).toBe("2024");
  });

  it("formats the period", () => {
    expect(formatResearchPeriod(research())).toBeUndefined();
    expect(formatResearchPeriod(research({ startDate: "2025-01-01", endDate: "2025-06-01" }))).toBe(
      "2025",
    );
    expect(formatResearchPeriod(research({ startDate: "2024-01-01" }))).toBe("2024 to present");
    expect(formatResearchPeriod(research({ endDate: "2025-01-01" }))).toBe("Unknown to 2025");
    expect(formatResearchPeriod(research({ startDate: "2023-01-01", endDate: "2025-01-01" }))).toBe(
      "2023 to 2025",
    );
  });
});
