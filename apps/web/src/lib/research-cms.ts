import { formatArticleDate, slugify as slugifyText, type ArticleBlock } from "@/lib/article-cms";
import type { Member } from "@/data/members";

/** Shared types and helpers for the research initiatives editorial workflow. */

export const RESEARCH_AREAS = ["website", "mobile", "hci-ux", "game-xr"] as const;
export const RESEARCH_STATUSES = ["exploring", "active", "completed"] as const;

export type ResearchArea = (typeof RESEARCH_AREAS)[number];
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export const RESEARCH_AREA_LABELS: Record<ResearchArea, string> = {
  website: "Website",
  mobile: "Mobile",
  "hci-ux": "HCI/UX",
  "game-xr": "Game & XR",
};

/**
 * The stable public descriptions of the four focus areas, shown on the
 * research index. Keep in sync with the copy in the research seed data.
 */
export const RESEARCH_AREA_DESCRIPTIONS: Record<ResearchArea, string> = {
  website: "Accessible, useful, and maintainable web experiences.",
  mobile: "Context-aware mobile tools for everyday and field use.",
  "hci-ux": "Interaction design, usability, trust, accessibility, and evaluation.",
  "game-xr": "Playful interaction, immersive learning, AR, VR, and spatial experiences.",
};

export const RESEARCH_STATUS_LABELS: Record<ResearchStatus, string> = {
  exploring: "Exploring",
  active: "Active",
  completed: "Completed",
};

export type ResearchMilestone = {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  title: string;
  summary: string;
  relatedUrl?: string;
  relatedLabel?: string;
};

export type ResearchOutputLink = {
  id: string;
  type: "project" | "publication" | "article";
  label: string;
  href: string;
  /** Reserved for the future Projects CMS; linked records use href today. */
  recordSlug?: string;
};

export type ResearchPartner = {
  name: string;
  url?: string;
};

export type ResearchDraft = {
  slug: string;
  title: string;
  summary: string;
  question: string;
  context?: string;
  contribution?: string;
  areas: ResearchArea[];
  status: ResearchStatus;
  /** YYYY-MM-DD. */
  startDate?: string;
  endDate?: string;
  featured: boolean;
  draft: boolean;
  methods: string[];
  memberSlugs: string[];
  /** S3 media key, or a `static/<public-path>` key for bundled seed art. */
  coverKey?: string;
  coverAlt?: string;
  milestones: ResearchMilestone[];
  outputs: ResearchOutputLink[];
  partners?: ResearchPartner[];
  seoTitle?: string;
  seoDescription?: string;
};

export type CmsResearchRecord = {
  research: ResearchDraft;
  body: ArticleBlock[];
  slug: string;
  updatedAt?: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string) {
  return slugifyText(value);
}

export function isResearchSlug(value: string) {
  return SLUG_PATTERN.test(value);
}

export function emptyResearchDraft(): ResearchDraft {
  return {
    slug: "",
    title: "",
    summary: "",
    question: "",
    areas: [],
    status: "exploring",
    featured: false,
    draft: true,
    methods: [],
    memberSlugs: [],
    milestones: [],
    outputs: [],
  };
}

export function draftToResearch(draft: ResearchDraft): ResearchDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    question: draft.question.trim(),
    context: draft.context?.trim() || undefined,
    contribution: draft.contribution?.trim() || undefined,
    startDate: draft.startDate || undefined,
    endDate: draft.endDate || undefined,
    areas: [...new Set(draft.areas)],
    methods: [...new Set(draft.methods.map((method) => method.trim()).filter(Boolean))],
    memberSlugs: [...new Set(draft.memberSlugs)],
    coverAlt: draft.coverAlt?.trim() || undefined,
    seoTitle: draft.seoTitle?.trim() || undefined,
    seoDescription: draft.seoDescription?.trim() || undefined,
    milestones: draft.milestones.map((milestone) => ({
      ...milestone,
      title: milestone.title.trim(),
      summary: milestone.summary.trim(),
      relatedUrl: milestone.relatedUrl?.trim() || undefined,
      relatedLabel: milestone.relatedLabel?.trim() || undefined,
    })),
    outputs: draft.outputs.map((output) => ({
      ...output,
      label: output.label.trim(),
      href: output.href.trim(),
      recordSlug: output.recordSlug?.trim() || undefined,
    })),
    partners: draft.partners?.length ? draft.partners : undefined,
  };
}

export function researchToDraft(research: ResearchDraft): ResearchDraft {
  return {
    ...research,
    context: research.context ?? "",
    contribution: research.contribution ?? "",
    startDate: research.startDate ?? "",
    endDate: research.endDate ?? "",
    areas: [...research.areas],
    methods: [...research.methods],
    memberSlugs: [...research.memberSlugs],
    coverAlt: research.coverAlt ?? "",
    milestones: research.milestones.map((milestone) => ({ ...milestone })),
    outputs: research.outputs.map((output) => ({ ...output })),
    partners: research.partners ? research.partners.map((partner) => ({ ...partner })) : [],
    seoTitle: research.seoTitle ?? "",
    seoDescription: research.seoDescription ?? "",
  };
}

export function publishedResearch(records: readonly CmsResearchRecord[]) {
  return records.filter((record) => !record.research.draft);
}

/** The spotlight initiative: the newest published record marked featured. */
export function featuredResearch(records: readonly CmsResearchRecord[]) {
  return (
    publishedResearch(records)
      .filter((record) => record.research.featured)
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))[0] ??
    undefined
  );
}

export function researchMembers(record: CmsResearchRecord, members: readonly Member[]) {
  return record.research.memberSlugs
    .map((slug) => members.find((member) => member.slug === slug))
    .filter((member): member is Member => Boolean(member));
}

/** The most recent meaningful milestone, newest date first. */
export function latestMilestone(research: ResearchDraft) {
  return [...research.milestones].sort((left, right) => right.date.localeCompare(left.date))[0];
}

/** The representative year for year filters: start date wins, end date falls back. */
export function researchYear(research: ResearchDraft) {
  const value = research.startDate ?? research.endDate;
  return value ? value.slice(0, 4) : undefined;
}

/** Resolves a cover key to a loadable URL — bundled seed art or CMS media. */
export function researchCoverUrl(coverKey?: string) {
  if (!coverKey) return undefined;
  if (coverKey.startsWith("static/")) return `/${coverKey.slice("static/".length)}`;
  return `/api/research-cms/media/${encodeURIComponent(coverKey)}`;
}

/** "Sabtu, 31 Agustus 2024" — the same long form articles and publications use. */
export function formatResearchDate(value: string) {
  return formatArticleDate(value);
}

/** "31 Agustus 2024" without the weekday, for compact timeline entries. */
export function formatResearchDateShort(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** A date range label like "2025 — present" (no em dashes in site copy). */
export function formatResearchPeriod(research: ResearchDraft) {
  const start = research.startDate?.slice(0, 4);
  const end = research.endDate?.slice(0, 4);
  if (!start && !end) return undefined;
  if (start && end && start === end) return start;
  return `${start ?? "Unknown"} to ${end ?? "present"}`;
}
