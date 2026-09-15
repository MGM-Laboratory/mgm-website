import type { CmsResearchRecord } from "@/lib/research-cms";

/**
 * Starter records for the Research Initiatives CMS. No published research
 * is seeded: every claim on the public pages must come from verified,
 * user-supplied material. This single record is an internal draft template
 * (draft: true) that shows editors how the fields read together; it is
 * filtered out of every public feed and never appears on the site.
 */
export const SEED_RESEARCH: readonly CmsResearchRecord[] = [
  {
    slug: "example-initiative-draft",
    research: {
      slug: "example-initiative-draft",
      title: "Example initiative (internal draft)",
      summary:
        "A placeholder record for editors. Replace every field with a real, verified initiative before publishing, or delete this record.",
      question: "What question does this study set out to answer?",
      context: "Describe the situation or problem that motivates the study.",
      contribution:
        "Describe what the study intends to add, and how it connects to the lab's work.",
      areas: ["hci-ux"],
      status: "exploring",
      startDate: "",
      endDate: "",
      featured: false,
      draft: true,
      methods: ["Example method"],
      memberSlugs: [],
      milestones: [],
      outputs: [],
      partners: [],
      seoTitle: "",
      seoDescription: "",
    },
    body: [],
  },
];
