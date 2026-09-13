import type { CmsPublicationRecord } from "@/lib/publication-cms";

/**
 * Seed publications shown on a fresh database (local or Railway) until the
 * editorial team publishes real papers. Every entry is editable through the
 * admin workspace — the bootstrap only runs when the publications collection
 * is empty, so publishing or deleting any of these keeps them gone.
 */
export const SEED_PUBLICATIONS: CmsPublicationRecord[] = [
  {
    slug: "touch-first-research-tools-for-field-work",
    publication: {
      slug: "touch-first-research-tools-for-field-work",
      title: "Designing Touch-First Research Tools for Field Work",
      type: "journal-article",
      date: "2024-08-31",
      journal: "Journal of Usability Studies",
      volume: "12",
      issue: "3",
      pages: "45–58",
      publisher: "Usability Professionals Association",
      doi: "10.5555/example.touch-first",
      license: "CC BY 4.0",
      keywords: ["usability study", "field research", "mobile capture", "prototyping"],
      abstract:
        "Researchers in the field rarely sit at a desk. Notes are taken on phones, data is captured between conversations, and prototypes are tested in hallways. Yet most research tooling still assumes a keyboard, a large screen, and an uninterrupted hour. This paper reports on a usability study of a touch-first capture tool designed for student research groups at MGM Laboratory, and extracts four constraints — one-handed input, offline-first storage, reviewable capture, and cross-device continuity — that should drive the design of any field capture software.",
      authors: [
        {
          id: "a1",
          name: "Muhammad Gilang Hafizh",
          affiliation: "MGM Laboratory, University of Brawijaya",
          memberSlug: "muhammad-gilang-hafizh",
        },
        {
          id: "a2",
          name: "Kania Khalifa Kurniadi",
          affiliation: "MGM Laboratory, University of Brawijaya",
          memberSlug: "kania-khalifa-kurniadi",
        },
        {
          id: "a3",
          name: "Ayu Paramitha",
          affiliation: "Faculty of Computer Science, University of Brawijaya",
        },
      ],
      draft: false,
      paperKey: "static/publications/touch-first-field-work.pdf",
      paperName: "touch-first-field-work.pdf",
      paperSize: 18089,
    },
  },
  {
    slug: "capture-before-you-classify",
    publication: {
      slug: "capture-before-you-classify",
      title: "Capture Before You Classify: Deferring Annotation in Field Notes",
      type: "conference-paper",
      date: "2024-09-14",
      journal: "Proceedings of the 8th International Conference on HCI and Usability (CHIuXiD)",
      pages: "112–119",
      publisher: "ACM",
      doi: "10.5555/example.capture-classify",
      license: "CC BY-NC 4.0",
      keywords: ["annotation", "field notes", "interaction design"],
      abstract:
        "Asking field researchers to classify their own notes breaks their flow. In a two-week study with eight participants, we moved classification from the capture moment to a post-session review stage and measured a measurable improvement in entry completeness. This paper describes the review interface and argues that capture tools should optimise for speed and defer structure.",
      authors: [
        {
          id: "b1",
          name: "Muhammad Naufal Mathara Rahman",
          affiliation: "MGM Laboratory, University of Brawijaya",
          memberSlug: "muhammad-naufal-mathara-rahman",
        },
        {
          id: "b2",
          name: "Muhammad Gilang Hafizh",
          affiliation: "MGM Laboratory, University of Brawijaya",
          memberSlug: "muhammad-gilang-hafizh",
        },
      ],
      draft: false,
    },
  },
];
