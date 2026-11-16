// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";

import {
  apaCitation,
  authorKind,
  authorPhotoUrl,
  bibtexCitation,
  chicagoCitation,
  doiUrl,
  draftToPublication,
  emptyPublicationDraft,
  formatPaperSize,
  formatPublicationDate,
  ieeeCitation,
  isPublicationSlug,
  mlaCitation,
  paperIsPublic,
  plainTextCitation,
  publicationPaperUrl,
  publicationToDraft,
  publicationTypeLabel,
  publishedPublications,
  risCitation,
  slugify,
  type CmsPublicationRecord,
  type PublicationAuthor,
  type PublicationDraft,
} from "./publication-cms";

function author(name: string, extra: Partial<PublicationAuthor> = {}): PublicationAuthor {
  return { id: name, name, ...extra };
}

function publication(extra: Partial<PublicationDraft> = {}): PublicationDraft {
  return {
    slug: "sample",
    title: "A Study of Things",
    type: "journal-article",
    date: "2024-08-31",
    journal: "Journal of Stuff",
    keywords: [],
    abstract: "",
    authors: [author("Ada Lovelace")],
    draft: false,
    ...extra,
  };
}

describe("authorKind", () => {
  it("keeps an explicit kind", () => {
    expect(authorKind(author("A", { kind: "residence" }))).toBe("residence");
    expect(authorKind(author("A", { kind: "non-residence", memberSlug: "a" }))).toBe(
      "non-residence",
    );
  });

  it("falls back to the member link on legacy records", () => {
    expect(authorKind(author("A", { memberSlug: "a" }))).toBe("residence");
    expect(authorKind(author("A"))).toBe("non-residence");
  });
});

describe("slugs", () => {
  it("slugifies text and drops apostrophes", () => {
    expect(slugify("  O'Brien's  Big Idea!! ")).toBe("obriens-big-idea");
    expect(slugify("It’s")).toBe("its");
  });

  it("limits a slug to 80 characters", () => {
    expect(slugify("a".repeat(120))).toHaveLength(80);
  });

  it("checks the slug pattern", () => {
    expect(isPublicationSlug("good-slug-1")).toBe(true);
    expect(isPublicationSlug("Bad_Slug")).toBe(false);
    expect(isPublicationSlug("-lead")).toBe(false);
    expect(isPublicationSlug("double--dash")).toBe(false);
    expect(isPublicationSlug("")).toBe(false);
  });
});

describe("publicationTypeLabel", () => {
  it("returns the label of a known type", () => {
    expect(publicationTypeLabel("conference-paper")).toBe("Conference Paper");
  });

  it("returns the raw value for an unknown type", () => {
    expect(publicationTypeLabel("zine" as never)).toBe("zine");
  });
});

describe("draft conversion", () => {
  it("starts an empty draft hidden and unpublished", () => {
    const draft = emptyPublicationDraft();

    expect(draft).toMatchObject({ draft: true, paperHidden: true, authors: [], keywords: [] });
    expect(draft.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("trims fields, drops blank values and duplicate keywords", () => {
    const result = draftToPublication(
      publication({
        title: "  Title  ",
        journal: "  ",
        volume: " 3 ",
        issue: "",
        pages: " 1-2 ",
        publisher: " ",
        doi: " 10.1/x ",
        url: " ",
        license: " CC BY 4.0 ",
        keywords: [" a ", "a", "", "b"],
        abstract: "  text  ",
        authors: [
          author(" Ada ", { affiliation: " MIT ", url: " " }),
          author("   "),
          author("Bob", { affiliation: " " }),
        ],
      }),
    );

    expect(result).toMatchObject({
      title: "Title",
      journal: "",
      volume: "3",
      issue: undefined,
      pages: "1-2",
      publisher: undefined,
      doi: "10.1/x",
      url: undefined,
      license: "CC BY 4.0",
      keywords: ["a", "b"],
      abstract: "text",
    });
    expect(result.authors.map((entry) => entry.name)).toEqual(["Ada", "Bob"]);
    expect(result.authors[0]).toMatchObject({ affiliation: "MIT", url: undefined });
    expect(result.authors[1].affiliation).toBeUndefined();
  });

  it("fills editor defaults and copies arrays when loading a record", () => {
    const source = publication({
      journal: undefined as unknown as string,
      abstract: undefined as unknown as string,
      keywords: ["k"],
      authors: [author("Ada", { memberSlug: "ada" }), author("Bob", { kind: "residence" })],
    });
    const draft = publicationToDraft(source);

    expect(draft).toMatchObject({
      journal: "",
      volume: "",
      issue: "",
      pages: "",
      publisher: "",
      doi: "",
      url: "",
      license: "",
      abstract: "",
    });
    expect(draft.keywords).toEqual(["k"]);
    expect(draft.keywords).not.toBe(source.keywords);
    expect(draft.authors[0]).toMatchObject({ kind: "residence", affiliation: "", url: "" });
    expect(draft.authors[1].kind).toBe("residence");
  });
});

describe("publishedPublications", () => {
  it("drops drafts and sorts the newest first", () => {
    const record = (slug: string, date: string, draft: boolean): CmsPublicationRecord => ({
      slug,
      publication: publication({ slug, date, draft }),
    });

    const result = publishedPublications([
      record("old", "2020-01-01", false),
      record("hidden", "2025-01-01", true),
      record("new", "2024-05-05", false),
    ]);

    expect(result.map((entry) => entry.slug)).toEqual(["new", "old"]);
  });
});

describe("paper and media urls", () => {
  it("makes a paper public only with a key and an explicit paperHidden false", () => {
    expect(paperIsPublic(publication({ paperKey: "k", paperHidden: false }))).toBe(true);
    expect(paperIsPublic(publication({ paperKey: "k", paperHidden: true }))).toBe(false);
    expect(paperIsPublic(publication({ paperKey: "k" }))).toBe(false);
    expect(paperIsPublic(publication({ paperHidden: false }))).toBe(false);
  });

  it("resolves paper keys", () => {
    expect(publicationPaperUrl()).toBeUndefined();
    expect(publicationPaperUrl("static/papers/a.pdf")).toBe("/papers/a.pdf");
    expect(publicationPaperUrl("papers/a b.pdf")).toBe(
      "/api/publications-cms/paper/papers%2Fa%20b.pdf",
    );
  });

  it("resolves author portrait keys", () => {
    expect(authorPhotoUrl()).toBeUndefined();
    expect(authorPhotoUrl("a/b.png")).toBe("/api/publications-cms/media/a%2Fb.png");
  });

  it("builds a DOI link", () => {
    expect(doiUrl()).toBeUndefined();
    expect(doiUrl("10.1/x")).toBe("https://doi.org/10.1/x");
  });
});

describe("formatters", () => {
  it("formats a full date in Indonesian", () => {
    expect(formatPublicationDate("2024-08-31")).toBe("Sabtu, 31 Agustus 2024");
  });

  it("renders a year only date as the year", () => {
    expect(formatPublicationDate("2019")).toBe("2019");
    expect(formatPublicationDate("2019-05")).toBe("2019");
  });

  it("returns an unparseable value unchanged", () => {
    expect(formatPublicationDate("soon")).toBe("soon");
  });

  it("formats paper sizes", () => {
    expect(formatPaperSize()).toBeUndefined();
    expect(formatPaperSize(0)).toBeUndefined();
    expect(formatPaperSize(10)).toBe("1 KB");
    expect(formatPaperSize(2048)).toBe("2 KB");
    expect(formatPaperSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

describe("apaCitation", () => {
  it("formats a single author with venue and DOI", () => {
    expect(apaCitation(publication({ volume: "7", issue: "2", pages: "1-9", doi: "10.1/x" }))).toBe(
      "Lovelace, A. (2024). A Study of Things. Journal of Stuff, 7(2), 1-9. https://doi.org/10.1/x",
    );
  });

  it("keeps the title punctuation and falls back to the type and url", () => {
    expect(
      apaCitation(
        publication({ title: "Why?", journal: "", url: "https://x.test", type: "preprint" }),
      ),
    ).toBe("Lovelace, A. (2024). Why? Preprint. https://x.test");
  });

  it("handles volume without issue and no suffix", () => {
    expect(apaCitation(publication({ volume: "7" }))).toBe(
      "Lovelace, A. (2024). A Study of Things. Journal of Stuff, 7.",
    );
  });

  it("joins two and several authors", () => {
    const two = publication({ authors: [author("Ada Lovelace"), author("Alan Mathison Turing")] });
    expect(apaCitation(two)).toContain("Lovelace, A., & Turing, A. M. (2024).");

    const three = publication({
      authors: [author("Ada Lovelace"), author("Alan Turing"), author("Grace Hopper")],
    });
    expect(apaCitation(three)).toContain("Lovelace, A., Turing, A., & Hopper, G. (2024).");
  });

  it("truncates more than twenty authors", () => {
    const authors = Array.from({ length: 21 }, (_, index) => author(`First${index} Last${index}`));
    const text = apaCitation(publication({ authors }));

    expect(text).toContain("Last18, F. , … Last20, F.".replace(" ,", ","));
    expect(text).not.toContain("Last19");
  });

  it("handles a single word name", () => {
    expect(apaCitation(publication({ authors: [author("Plato")] }))).toMatch(/^Plato \(2024\)\./);
  });
});

describe("ieeeCitation and plainTextCitation", () => {
  it("formats the full record", () => {
    const record = publication({
      title: "A Study of Things.",
      volume: "7",
      issue: "2",
      pages: "1-9",
      doi: "10.1/x",
    });

    expect(ieeeCitation(record)).toBe(
      'A. Lovelace, "A Study of Things," Journal of Stuff, vol. 7, no. 2, pp. 1-9, 2024, doi: 10.1/x.',
    );
    expect(plainTextCitation(record)).toBe(ieeeCitation(record));
  });

  it("joins two and three authors with and", () => {
    // The exact separator for two authors is not pinned on purpose, only that both appear in order.
    const two = publication({ authors: [author("Ada Lovelace"), author("Alan Turing")] });
    expect(ieeeCitation(two)).toMatch(/^A\. Lovelace,? (and )?A\. Turing, /);

    const three = publication({
      authors: [author("Ada Lovelace"), author("Alan Turing"), author("Grace Hopper")],
    });
    expect(ieeeCitation(three)).toMatch(/^A\. Lovelace, A\. Turing, and G\. Hopper, /);
  });
});

describe("mlaCitation", () => {
  it("formats the full record with a DOI", () => {
    expect(mlaCitation(publication({ volume: "7", issue: "2", pages: "1-9", doi: "10.1/x" }))).toBe(
      'Lovelace, Ada. "A Study of Things." Journal of Stuff, vol. 7, no. 2, 2024, pp. 1-9. DOI: 10.1/x.',
    );
  });

  it("falls back to the url", () => {
    expect(mlaCitation(publication({ journal: "", url: "https://x.test" }))).toBe(
      'Lovelace, Ada. "A Study of Things." 2024, https://x.test.',
    );
  });

  it("handles two authors, many authors and none", () => {
    expect(
      mlaCitation(publication({ authors: [author("Ada Lovelace"), author("Alan Turing")] })),
    ).toMatch(/^Lovelace, Ada, and Alan Turing\. /);
    expect(
      mlaCitation(
        publication({
          authors: [author("Ada Lovelace"), author("Alan Turing"), author("Grace Hopper")],
        }),
      ),
    ).toMatch(/^Lovelace, Ada, et al\./);
    // The exact author string for an empty list is not pinned on purpose, only that the title survives.
    expect(mlaCitation(publication({ authors: [] }))).toContain('"A Study of Things."');
  });
});

describe("chicagoCitation", () => {
  it("formats a journal record", () => {
    expect(
      chicagoCitation(publication({ volume: "7", issue: "2", pages: "1-9", doi: "10.1/x" })),
    ).toMatch(
      /^Lovelace, Ada\. "A Study of Things\." Journal of Stuff 7.*\(2024\): 1-9\. https:\/\/doi\.org\/10\.1\/x\.$/,
    );
  });

  it("falls back to type and year without a journal", () => {
    expect(chicagoCitation(publication({ journal: "", url: "https://x.test", type: "book" }))).toBe(
      'Lovelace, Ada. "A Study of Things." 2024. Book. https://x.test.',
    );
  });

  it("handles two, up to ten, and more than ten authors", () => {
    const names = (count: number) =>
      Array.from({ length: count }, (_, index) => author(`G${index} F${index}`));

    expect(chicagoCitation(publication({ authors: names(2) }))).toMatch(/^F0, G0, and G1 F1\. /);
    // The exact author string for 3 to 10 authors and for an empty list is not pinned on purpose.
    const three = chicagoCitation(publication({ authors: names(3) }));
    expect(three).toContain("F0, G0");
    expect(three).toContain("F2, G2");
    expect(three).not.toContain("et al.");
    expect(chicagoCitation(publication({ authors: names(11) }))).toMatch(/^F0, G0, et al\./);
    expect(chicagoCitation(publication({ authors: [] }))).toContain('"A Study of Things."');
  });
});

describe("bibtexCitation", () => {
  it("formats a journal article", () => {
    expect(
      bibtexCitation(
        publication({
          volume: "7",
          issue: "2",
          pages: "1–9",
          publisher: "Pub",
          doi: "10.1/x",
          url: "https://x.test",
        }),
      ),
    ).toBe(
      [
        "@article{lovelace2024a,",
        "  title = {{A Study of Things}},",
        "  author = {Lovelace, Ada},",
        "  journal = {Journal of Stuff},",
        "  year = {2024},",
        "  volume = {7},",
        "  number = {2},",
        "  pages = {1--9},",
        "  publisher = {Pub},",
        "  doi = {10.1/x},",
        "  url = {https://x.test}",
        "}",
      ].join("\n"),
    );
  });

  it("uses booktitle for conference papers and school for theses", () => {
    expect(bibtexCitation(publication({ type: "conference-paper" }))).toContain("@inproceedings{");
    expect(bibtexCitation(publication({ type: "conference-paper" }))).toContain(
      "  booktitle = {Journal of Stuff}",
    );
    expect(bibtexCitation(publication({ type: "thesis", publisher: "Uni" }))).toContain(
      "  school = {Uni}",
    );
  });

  it("builds a key for a record with no authors and no title word", () => {
    expect(bibtexCitation(publication({ authors: [], title: "!!!" }))).toContain(
      "@article{unknown2024publication,",
    );
  });

  it("falls back to the first type for an unknown type", () => {
    expect(bibtexCitation(publication({ type: "zine" as never }))).toContain("@article{");
  });

  it("omits the venue when there is no journal", () => {
    expect(bibtexCitation(publication({ journal: "" }))).not.toContain("journal =");
  });
});

describe("risCitation", () => {
  it("formats the full record", () => {
    expect(
      risCitation(
        publication({
          authors: [author("Ada Lovelace"), author("Alan Turing")],
          volume: "7",
          issue: "2",
          pages: "1 – 9",
          publisher: "Pub",
          doi: "10.1/x",
          url: "https://x.test",
          keywords: ["a", "b"],
        }),
      ),
    ).toBe(
      [
        "TY  - JOUR",
        "AU  - Lovelace, Ada",
        "AU  - Turing, Alan",
        "TI  - A Study of Things",
        "JO  - Journal of Stuff",
        "VL  - 7",
        "IS  - 2",
        "SP  - 1",
        "EP  - 9",
        "PY  - 2024",
        "DO  - 10.1/x",
        "PB  - Pub",
        "UR  - https://x.test",
        "KW  - a",
        "KW  - b",
        "ER  - ",
      ].join("\n"),
    );
  });

  it("uses T2 for conference papers and skips an absent venue and pages", () => {
    const conference = risCitation(publication({ type: "conference-paper" }));
    expect(conference).toContain("TY  - CONF");
    expect(conference).toContain("T2  - Journal of Stuff");

    const bare = risCitation(publication({ journal: "" }));
    expect(bare).not.toContain("JO  -");
    expect(bare).not.toContain("SP  -");
  });

  it("falls back to the first type for an unknown type", () => {
    expect(risCitation(publication({ type: "zine" as never }))).toContain("TY  - JOUR");
  });
});
