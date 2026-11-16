// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { PROJECT_THEME_IDS } from "@repo/shared";
import { describe, expect, it } from "vitest";

import {
  contributorKind,
  draftToProject,
  emptyProjectDraft,
  featuredProjects,
  formatProjectDate,
  formatProjectDateShort,
  formatProjectPeriod,
  formatVideoSize,
  isProjectSlug,
  nextPublishedProject,
  normalizeDescription,
  parseVimeoId,
  parseYoutubeId,
  projectDescriptionParagraphs,
  projectGalleryKeys,
  projectMediaSections,
  projectMediaUrl,
  projectThemeId,
  projectToDraft,
  projectVideoUrl,
  publishedProjects,
  safeProjectHref,
  slugify,
  type CmsProjectRecord,
  type ProjectDraft,
} from "./project-cms";

function project(extra: Partial<ProjectDraft> = {}): ProjectDraft {
  return { ...emptyProjectDraft(), slug: "p", title: "P", draft: false, ...extra };
}

function record(
  slug: string,
  extra: Partial<ProjectDraft> = {},
  updatedAt?: string,
): CmsProjectRecord {
  return { slug, body: [], updatedAt, project: project({ slug, ...extra }) };
}

describe("slugs and kinds", () => {
  it("slugifies and checks slugs", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(isProjectSlug("hello-world")).toBe(true);
    expect(isProjectSlug("Hello")).toBe(false);
  });

  it("decides contributor kind from the explicit kind or the member link", () => {
    expect(contributorKind({ id: "1", name: "A", kind: "residence" })).toBe("residence");
    expect(contributorKind({ id: "1", name: "A", memberSlug: "a" })).toBe("residence");
    expect(contributorKind({ id: "1", name: "A" })).toBe("non-residence");
  });
});

describe("emptyProjectDraft", () => {
  it("starts as an unpublished planned draft", () => {
    expect(emptyProjectDraft()).toMatchObject({
      status: "planned",
      draft: true,
      featured: false,
      videoMode: "none",
      media: [],
    });
  });
});

describe("draftToProject", () => {
  it("trims fields and drops empty entries", () => {
    const result = draftToProject(
      project({
        title: " T ",
        summary: " S ",
        categories: ["website", "website", "game"],
        techStack: [" a ", "a", ""],
        startDate: "",
        endDate: "2025-01-01",
        role: " ",
        platform: " Web ",
        coverAlt: " ",
        videoUrl: " ",
        videoName: " v ",
        links: [{ id: "1", label: " L ", url: " https://x.test " }],
        contributors: [
          { id: "1", name: " Ada ", role: " Lead ", affiliation: " ", url: " u " },
          { id: "2", name: "  " },
        ],
        organizations: [{ name: " Org ", url: " " }, { name: "" }],
        outputs: [{ id: "o", type: "article", label: " Out ", href: " /a ", recordSlug: " " }],
        seoTitle: " ",
        seoDescription: " d ",
        description: "  a   b \n\n\n  c ",
        cta: { label: " Go ", url: " /go " },
        services: [" s ", "s", ""],
        media: [
          { id: "m", kind: "image", size: "normal", key: "k", width: 1, height: 2, alt: " " },
        ],
      }),
    );

    expect(result).toMatchObject({
      title: "T",
      summary: "S",
      categories: ["website", "game"],
      techStack: ["a"],
      startDate: undefined,
      endDate: "2025-01-01",
      role: undefined,
      platform: "Web",
      coverAlt: undefined,
      videoUrl: undefined,
      videoName: "v",
      seoTitle: undefined,
      seoDescription: "d",
      description: "a b\n\nc",
      cta: { label: "Go", url: "/go" },
      services: ["s"],
    });
    expect(result.links).toEqual([{ id: "1", label: "L", url: "https://x.test" }]);
    expect(result.contributors).toEqual([
      { id: "1", name: "Ada", role: "Lead", affiliation: undefined, url: "u" },
    ]);
    expect(result.organizations).toEqual([{ name: "Org", url: undefined }]);
    expect(result.outputs[0]).toMatchObject({ label: "Out", href: "/a", recordSlug: undefined });
    expect(result.media?.[0].alt).toBeUndefined();
  });

  it("drops an incomplete call to action and tolerates missing optional lists", () => {
    const base = project();
    delete (base as Partial<ProjectDraft>).services;
    delete (base as Partial<ProjectDraft>).media;
    delete (base as Partial<ProjectDraft>).description;

    expect(draftToProject({ ...base, cta: { label: "Go", url: " " } })).toMatchObject({
      cta: undefined,
      services: [],
      media: [],
      description: undefined,
    });
    expect(draftToProject({ ...base, cta: undefined }).cta).toBeUndefined();
  });
});

describe("projectToDraft", () => {
  it("fills editor defaults and copies nested values", () => {
    const source = project({
      categories: ["game"],
      coverKey: "cover",
      contributors: [{ id: "1", name: "A", memberSlug: "a" }],
      links: [{ id: "l", label: "L", url: "u" }],
      organizations: [{ name: "O" }],
      outputs: [{ id: "o", type: "research", label: "R", href: "/r" }],
      cta: { label: "Go", url: "/go" },
    });
    const draft = projectToDraft(source);

    expect(draft).toMatchObject({
      startDate: "",
      endDate: "",
      role: "",
      platform: "",
      coverAlt: "",
      videoUrl: "",
      videoName: "",
      seoTitle: "",
      seoDescription: "",
    });
    expect(draft.contributors[0]).toMatchObject({ kind: "residence", role: "", url: "" });
    expect(draft.links[0]).not.toBe(source.links[0]);
    expect(draft.cta).toEqual({ label: "Go", url: "/go" });
    expect(draft.cta).not.toBe(source.cta);
    expect(draft.media?.map((item) => item.id)).toEqual(["cover"]);
  });

  it("tolerates a record without cta, services or description", () => {
    const base = project();
    delete (base as Partial<ProjectDraft>).services;
    delete (base as Partial<ProjectDraft>).description;

    expect(projectToDraft(base)).toMatchObject({ cta: undefined, services: [], description: "" });
  });
});

describe("description helpers", () => {
  it("normalizes paragraphs", () => {
    expect(normalizeDescription(" a \n b \n\n\n\n c ")).toBe("a b\n\nc");
    expect(normalizeDescription("  \n\n ")).toBe("");
  });

  it("uses the description, then the summary, then nothing", () => {
    expect(projectDescriptionParagraphs(project({ description: "a\n\nb", summary: "s" }))).toEqual([
      "a",
      "b",
    ]);
    expect(projectDescriptionParagraphs(project({ description: "", summary: "s" }))).toEqual(["s"]);
    expect(projectDescriptionParagraphs(project({ description: "", summary: "" }))).toEqual([]);
  });
});

describe("projectThemeId", () => {
  it("keeps the picked theme", () => {
    expect(projectThemeId({ slug: "x", theme: "graphite" })).toBe("graphite");
  });

  it("picks the same listed theme for a slug every time", () => {
    const picked = projectThemeId({ slug: "x" });

    expect(picked).toBe(projectThemeId({ slug: "x" }));
    expect(PROJECT_THEME_IDS).toContain(picked);
  });
});

describe("projectMediaSections", () => {
  it("returns the stored sections when there are some", () => {
    const media = [
      { id: "m", kind: "image" as const, size: "full" as const, key: "k", width: 0, height: 0 },
    ];
    expect(projectMediaSections(project({ media }))).toBe(media);
  });

  it("derives cover, gallery and uploaded video, skipping duplicates", () => {
    const sections = projectMediaSections(
      project({
        coverKey: "c",
        coverAlt: "x".repeat(250),
        galleryKeys: ["c", "g1", "g2"],
        videoMode: "upload",
        videoKey: "v",
        videoName: "Demo walk through",
      }),
    );

    expect(sections.map((item) => [item.id, item.kind, item.size, item.key])).toEqual([
      ["cover", "image", "full", "c"],
      ["gallery-1", "image", "normal", "g1"],
      ["gallery-2", "image", "normal", "g2"],
      ["demo-video", "video", "full", "v"],
    ]);
    expect(sections[0].alt).toHaveLength(200);
    expect(sections[3].alt).toBe("Demo walk through");
  });

  it("gives no alt to a video named like a file", () => {
    const sections = projectMediaSections(
      project({ videoMode: "upload", videoKey: "v", videoName: "demo.MP4 " }),
    );
    expect(sections[0].alt).toBeUndefined();
  });

  it("gives no alt to a video without a name and ignores other video modes", () => {
    expect(
      projectMediaSections(project({ videoMode: "upload", videoKey: "v" }))[0].alt,
    ).toBeUndefined();
    expect(projectMediaSections(project({ videoMode: "youtube", videoKey: "v" }))).toEqual([]);
    expect(projectMediaSections(project({ videoMode: "upload" }))).toEqual([]);
  });

  it("fills missing sizes from the measurements", () => {
    const sections = projectMediaSections(project({ coverKey: "c", galleryKeys: ["g"] }), {
      c: [800, 600],
    });

    expect(sections[0]).toMatchObject({ width: 800, height: 600 });
    expect(sections[1]).toMatchObject({ width: 0, height: 0 });
  });

  it("keeps a stored size over a measurement", () => {
    const media = [
      { id: "m", kind: "image" as const, size: "normal" as const, key: "k", width: 5, height: 6 },
    ];
    expect(projectMediaSections(project({ media }), { k: [1, 2] })[0]).toMatchObject({
      width: 5,
      height: 6,
    });
  });
});

describe("listing", () => {
  it("lists published projects by newest activity", () => {
    const records = [
      record("ended", { endDate: "2024-01-01", startDate: "2020-01-01" }),
      record("started", { startDate: "2025-01-01" }),
      record("saved", {}, "2023-01-01T00:00:00Z"),
      record("blank"),
      record("draft", { draft: true, endDate: "2030-01-01" }),
    ];

    expect(publishedProjects(records).map((entry) => entry.slug)).toEqual([
      "started",
      "ended",
      "saved",
      "blank",
    ]);
  });

  it("lists only featured published projects", () => {
    const records = [
      record("a", { featured: true, endDate: "2024-01-01" }),
      record("b", { featured: true, draft: true }),
      record("c"),
    ];
    expect(featuredProjects(records).map((entry) => entry.slug)).toEqual(["a"]);
  });

  it("finds the next project and wraps around", () => {
    const records = [
      record("a", { endDate: "2025-01-03" }),
      record("b", { endDate: "2025-01-02" }),
      record("c", { endDate: "2025-01-01" }),
    ];

    expect(nextPublishedProject(records, "a")?.slug).toBe("b");
    expect(nextPublishedProject(records, "c")?.slug).toBe("a");
  });

  it("has no next project when alone", () => {
    expect(nextPublishedProject([record("a")], "a")).toBeUndefined();
    expect(nextPublishedProject([], "a")).toBeUndefined();
  });
});

describe("urls and keys", () => {
  it("resolves media and video keys", () => {
    expect(projectMediaUrl()).toBeUndefined();
    expect(projectMediaUrl("static/a.png")).toBe("/a.png");
    expect(projectMediaUrl("x/y z")).toBe("/api/projects-cms/media/x%2Fy%20z");
    expect(projectVideoUrl()).toBeUndefined();
    expect(projectVideoUrl("static/v.mp4")).toBe("/v.mp4");
    expect(projectVideoUrl("x/y")).toBe("/api/projects-cms/video/x%2Fy");
  });

  it("lists the cover then the gallery without duplicates", () => {
    expect(projectGalleryKeys(project({ coverKey: "c", galleryKeys: ["g", "c", "g"] }))).toEqual([
      "c",
      "g",
    ]);
    expect(projectGalleryKeys(project({ galleryKeys: ["g"] }))).toEqual(["g"]);
  });

  it("allows only web urls and site paths as links", () => {
    expect(safeProjectHref("https://x.test/a")).toBe("https://x.test/a");
    expect(safeProjectHref("HTTP://x.test")).toBe("HTTP://x.test");
    expect(safeProjectHref("/local")).toBe("/local");
    expect(safeProjectHref("//evil.test")).toBeUndefined();
    expect(safeProjectHref("javascript:alert(1)")).toBeUndefined();
    expect(safeProjectHref("data:text/html,x")).toBeUndefined();
    expect(safeProjectHref("relative")).toBeUndefined();
  });

  it("parses video ids", () => {
    expect(parseYoutubeId("https://www.youtube.com/watch?v=abc_DEF-123")).toBe("abc_DEF-123");
    expect(parseYoutubeId("https://youtu.be/abcdef1")).toBe("abcdef1");
    expect(parseYoutubeId("https://youtube.com/shorts/abcdef1")).toBe("abcdef1");
    expect(parseYoutubeId("https://example.test/watch?v=abcdef1")).toBeUndefined();
    expect(parseVimeoId("https://vimeo.com/123456")).toBe("123456");
    expect(parseVimeoId("https://player.vimeo.com/video/987")).toBe("987");
    expect(parseVimeoId("https://example.test/1")).toBeUndefined();
  });
});

describe("formatters", () => {
  it("formats dates", () => {
    expect(formatProjectDate("2024-08-31")).toBe("Saturday, August 31, 2024");
    expect(formatProjectDateShort("2024-08-31")).toBe("31 Agustus 2024");
    expect(formatProjectDateShort("2024-08")).toBe("2024-08");
  });

  it("formats the period", () => {
    expect(formatProjectPeriod(project())).toBeUndefined();
    expect(formatProjectPeriod(project({ startDate: "2025-01-01", endDate: "2025-12-31" }))).toBe(
      "2025",
    );
    expect(formatProjectPeriod(project({ startDate: "2024-01-01" }))).toBe("2024 to present");
    expect(formatProjectPeriod(project({ endDate: "2025-01-01" }))).toBe("Unknown to 2025");
    expect(formatProjectPeriod(project({ startDate: "2023-01-01", endDate: "2025-01-01" }))).toBe(
      "2023 to 2025",
    );
  });

  it("formats video sizes", () => {
    expect(formatVideoSize()).toBeUndefined();
    expect(formatVideoSize(1)).toBe("1 KB");
    expect(formatVideoSize(5 * 1024)).toBe("5 KB");
    expect(formatVideoSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
