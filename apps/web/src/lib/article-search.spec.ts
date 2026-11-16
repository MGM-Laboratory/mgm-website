import { describe, expect, it } from "vitest";

import type { CmsArticleRecord } from "@/lib/article-cms";

import { bodyText, highlightSnippet, searchArticles, tokenize } from "./article-search";

type Overrides = {
  title?: string;
  subtitle?: string;
  categories?: string[];
  date?: string;
  draft?: boolean;
  content?: unknown[];
  coverKey?: string;
};

function record(slug: string, overrides: Overrides = {}): CmsArticleRecord {
  return {
    slug,
    content: (overrides.content ?? []) as CmsArticleRecord["content"],
    article: {
      slug,
      title: overrides.title ?? "Untitled",
      subtitle: overrides.subtitle ?? "",
      date: overrides.date ?? "2025-01-01",
      categories: overrides.categories ?? [],
      authorSlugs: [],
      draft: overrides.draft ?? false,
      coverKey: overrides.coverKey,
    },
  };
}

function paragraph(text: string) {
  return { id: text, type: "paragraph", content: [{ type: "text", text, styles: {} }] };
}

describe("tokenize", () => {
  it("lowercases and splits on anything that is not a letter or digit", () => {
    expect(tokenize("Hello, World-42!  ")).toEqual(["hello", "world", "42"]);
    expect(tokenize("")).toEqual([]);
    expect(tokenize("---")).toEqual([]);
  });
});

describe("bodyText", () => {
  it("joins the prose of the blocks and skips metadata keys", () => {
    const text = bodyText(
      record("a", {
        content: [
          paragraph("First part"),
          { id: "x", type: "paragraph", content: [] },
          {
            id: "y",
            type: "paragraph",
            content: [
              "plain string",
              {
                type: "link",
                href: "https://skip.test",
                content: [{ type: "text", text: "linked" }],
              },
              null,
              42,
            ],
          },
          {
            id: "z",
            type: "table",
            content: { rows: [{ cells: [[{ type: "text", text: "cell" }]] }] },
          },
        ],
      }),
    );

    expect(text).toBe("First part plain string linked cell");
    expect(text).not.toContain("skip.test");
  });
});

describe("searchArticles", () => {
  it("returns nothing for an empty query", () => {
    expect(searchArticles([record("a")], "")).toEqual([]);
    expect(searchArticles([record("a")], " !! ")).toEqual([]);
  });

  it("skips drafts", () => {
    expect(searchArticles([record("a", { title: "Robots", draft: true })], "robots")).toEqual([]);
  });

  it("ranks a title hit above a body hit", () => {
    const results = searchArticles(
      [
        record("body", { title: "Other", content: [paragraph("all about robots here")] }),
        record("title", { title: "Robots" }),
      ],
      "robots",
    );

    expect(results.map((entry) => entry.slug)).toEqual(["title", "body"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("counts subtitle, category and caption hits", () => {
    const results = searchArticles(
      [
        record("sub", { subtitle: "about lasers" }),
        record("cat", { categories: ["Lasers"] }),
        record("cap", {
          content: [
            { id: "i", type: "image", props: { caption: "a laser beam" }, content: undefined },
          ],
        }),
        record("none", { title: "Cooking" }),
      ],
      "laser",
    );

    expect(results.map((entry) => entry.slug).sort()).toEqual(["cap", "cat", "sub"]);
  });

  it("ignores an image block without a caption string", () => {
    expect(
      searchArticles(
        [record("a", { content: [{ id: "i", type: "image", props: { caption: 3 } }] })],
        "caption",
      ),
    ).toEqual([]);
    expect(
      searchArticles([record("a", { content: [{ id: "i", type: "image" }] })], "caption"),
    ).toEqual([]);
  });

  it("forgives a small typo, one for short terms and two for longer ones", () => {
    const records = [record("a", { title: "Quantum" }), record("b", { title: "Cats" })];

    expect(searchArticles(records, "quantim").map((entry) => entry.slug)).toEqual(["a"]);
    expect(searchArticles(records, "quanttm").map((entry) => entry.slug)).toEqual(["a"]);
    expect(searchArticles(records, "qxxxtum")).toEqual([]);
    expect(searchArticles(records, "cots").map((entry) => entry.slug)).toEqual(["b"]);
    expect(searchArticles(records, "dogs")).toEqual([]);
  });

  it("does not match a word that is far longer than the allowed edit distance", () => {
    expect(searchArticles([record("a", { title: "Supercalifragilistic" })], "cat")).toEqual([]);
  });

  it("gives a bonus when the whole phrase is in the title or subtitle", () => {
    const [inTitle] = searchArticles(
      [record("t", { title: "Deep learning intro" })],
      "deep learning",
    );
    const [inSubtitle] = searchArticles(
      [record("s", { title: "Intro", subtitle: "on deep learning" })],
      "deep learning",
    );
    const [scattered] = searchArticles(
      [record("x", { title: "Deep intro to learning" })],
      "deep learning",
    );

    expect(inTitle.score).toBeGreaterThan(scattered.score);
    expect(inSubtitle.score).toBeGreaterThan(0);
  });

  it("breaks score ties by the newest date and honors the limit", () => {
    const results = searchArticles(
      [
        record("old", { title: "Robots", date: "2020-01-01" }),
        record("new", { title: "Robots", date: "2025-01-01" }),
        record("mid", { title: "Robots", date: "2023-01-01" }),
      ],
      "robots",
      2,
    );

    expect(results.map((entry) => entry.slug)).toEqual(["new", "mid"]);
  });

  it("copies the card fields into the result", () => {
    const [result] = searchArticles(
      [record("a", { title: "Robots", subtitle: "Sub", categories: ["Tech"], coverKey: "k" })],
      "robots",
    );

    expect(result).toMatchObject({
      slug: "a",
      title: "Robots",
      subtitle: "Sub",
      date: "2025-01-01",
      categories: ["Tech"],
      coverKey: "k",
    });
  });

  it("builds a snippet around the first match with ellipses", () => {
    const filler = "word ".repeat(60);
    const [result] = searchArticles(
      [record("a", { title: "Zzz", content: [paragraph(`${filler}needle ${filler}`)] })],
      "needle",
    );

    expect(result.snippet.startsWith("...")).toBe(true);
    expect(result.snippet.endsWith("...")).toBe(true);
    expect(result.snippet).toContain("needle");
  });

  it("does not add ellipses when the whole text fits around the match", () => {
    const [result] = searchArticles(
      [record("a", { title: "Zzz", content: [paragraph("a short needle text")] })],
      "needle",
    );

    expect(result.snippet).toBe("a short needle text");
  });

  it("falls back to the subtitle or the body when the match is only fuzzy", () => {
    const [withSubtitle] = searchArticles(
      [record("a", { title: "Quantum", subtitle: "A subtitle" })],
      "quantim",
    );
    expect(withSubtitle.snippet).toBe("A subtitle");

    const [withBody] = searchArticles(
      [record("b", { title: "Quantum", content: [paragraph("body words")] })],
      "quantim",
    );
    expect(withBody.snippet).toBe("body words");
  });

  it("shortens a long fallback", () => {
    const [result] = searchArticles(
      [record("a", { title: "Quantum", subtitle: "s".repeat(400) })],
      "quantim",
    );

    expect(result.snippet).toBe(`${"s".repeat(180)}...`);
  });
});

describe("searching inline content shapes", () => {
  it("indexes plain string content, nested arrays and objects without a text field", () => {
    const records = [
      record("plain", {
        title: "Aaa",
        content: [{ id: "1", type: "paragraph", content: ["alpha beta"] }],
      }),
      record("table", {
        title: "Bbb",
        content: [
          {
            id: "2",
            type: "table",
            content: { rows: [{ cells: [[{ type: "text", text: "gamma" }]] }] },
          },
        ],
      }),
    ];

    expect(searchArticles(records, "alpha").map((entry) => entry.slug)).toEqual(["plain"]);
    expect(searchArticles(records, "gamma").map((entry) => entry.slug)).toEqual(["table"]);
  });

  it("does not index the metadata keys of a link", () => {
    const record1 = record("link", {
      title: "Ccc",
      content: [
        {
          id: "3",
          type: "paragraph",
          content: [
            {
              type: "link",
              href: "https://hidden.test",
              content: [{ type: "text", text: "visible" }],
            },
          ],
        },
      ],
    });

    expect(searchArticles([record1], "hidden")).toEqual([]);
    expect(searchArticles([record1], "visible")).toHaveLength(1);
  });
});

describe("highlightSnippet", () => {
  it("returns one plain segment for an empty query", () => {
    expect(highlightSnippet("some text", "")).toEqual([{ text: "some text", hit: false }]);
  });

  it("marks every term hit regardless of case", () => {
    expect(highlightSnippet("Robots and ROBOTS", "robots")).toEqual([
      { text: "", hit: false },
      { text: "Robots", hit: true },
      { text: " and ", hit: false },
      { text: "ROBOTS", hit: true },
      { text: "", hit: false },
    ]);
  });

  it("treats a query as words, not as a pattern", () => {
    expect(highlightSnippet("a.b (c)", ".* (")).toEqual([{ text: "a.b (c)", hit: false }]);
  });
});
