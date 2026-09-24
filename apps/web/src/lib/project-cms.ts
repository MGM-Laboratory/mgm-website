import {
  PROJECT_DETAIL_LIMITS,
  PROJECT_THEME_IDS,
  type ProjectCta,
  type ProjectMediaItem,
  type ProjectThemeId,
} from "@repo/shared";

import { formatArticleDate, slugify as slugifyText, type ArticleBlock } from "@/lib/article-cms";

export {
  PROJECT_DETAIL_LIMITS,
  PROJECT_MEDIA_SIZES,
  PROJECT_THEME_IDS,
  type ProjectCta,
  type ProjectMediaItem,
  type ProjectMediaSize,
  type ProjectThemeId,
} from "@repo/shared";

/** Shared types and helpers for the projects editorial workflow. */

export const PROJECT_CATEGORIES = ["website", "mobile", "hci-ux", "game"] as const;
export const PROJECT_STATUSES = ["planned", "in-progress", "completed", "archived"] as const;
export const PROJECT_VIDEO_MODES = ["none", "upload", "url", "youtube"] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectVideoMode = (typeof PROJECT_VIDEO_MODES)[number];

export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = {
  website: "Website",
  mobile: "Mobile",
  "hci-ux": "HCI/UX",
  game: "Game",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planned",
  "in-progress": "In progress",
  completed: "Completed",
  archived: "Archived",
};

export type ProjectContributorKind = "residence" | "non-residence";

export type ProjectContributor = {
  id: string;
  /** Residence contributors resolve through the member CMS; non-residence
   *  contributors carry their own portrait and public link. Omitted on
   *  older records, where the presence of memberSlug decides. */
  kind?: ProjectContributorKind;
  name: string;
  /** What they did on this project, e.g. "Lead Developer" (optional). */
  role?: string;
  affiliation?: string;
  memberSlug?: string;
  url?: string;
  photoKey?: string;
  photoPosition?: { x: number; y: number; zoom: number };
};

/** Legacy records decide residence by the presence of a member link. */
export function contributorKind(contributor: ProjectContributor): ProjectContributorKind {
  if (contributor.kind) return contributor.kind;
  return contributor.memberSlug ? "residence" : "non-residence";
}

export type ProjectOrganization = { name: string; url?: string };
export type ProjectLink = { id: string; label: string; url: string };

export type ProjectOutputLink = {
  id: string;
  type: "research" | "publication" | "article";
  label: string;
  href: string;
  recordSlug?: string;
};

export type ProjectDraft = {
  slug: string;
  title: string;
  summary: string;
  categories: ProjectCategory[];
  techStack: string[];
  status: ProjectStatus;
  /** YYYY-MM-DD. */
  startDate?: string;
  endDate?: string;
  /** The lab's role on the project, e.g. "Design & development partner". */
  role?: string;
  /** Free-text platform summary, e.g. "Web, iOS, Android". */
  platform?: string;
  featured: boolean;
  draft: boolean;
  /** S3 media key, or a `static/<public-path>` key for bundled seed art. */
  coverKey?: string;
  coverAlt?: string;
  galleryKeys: string[];
  videoMode: ProjectVideoMode;
  /** S3 media key (upload mode). */
  videoKey?: string;
  videoName?: string;
  videoSize?: number;
  /** A direct file / Vimeo URL (url mode) or a YouTube URL (youtube mode). */
  videoUrl?: string;
  links: ProjectLink[];
  contributors: ProjectContributor[];
  organizations: ProjectOrganization[];
  outputs: ProjectOutputLink[];
  seoTitle?: string;
  seoDescription?: string;
  /** Detail page palette; absent on older records (see `projectThemeId`). */
  theme?: ProjectThemeId;
  /** Detail page copy, blank-line separated paragraphs; falls back to the summary. */
  description?: string;
  /** The detail page's call-to-action button. */
  cta?: ProjectCta;
  services?: string[];
  /** Ordered detail page media; absent on older records (see `projectMediaSections`). */
  media?: ProjectMediaItem[];
};

export type CmsProjectRecord = {
  project: ProjectDraft;
  body: ArticleBlock[];
  slug: string;
  updatedAt?: string;
  /** Measured pixel sizes of images the record stores without one, by media key
   *  (only on single-record reads). */
  mediaSizes?: Record<string, [number, number]>;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string) {
  return slugifyText(value);
}

export function isProjectSlug(value: string) {
  return SLUG_PATTERN.test(value);
}

export function emptyProjectDraft(): ProjectDraft {
  return {
    slug: "",
    title: "",
    summary: "",
    categories: [],
    techStack: [],
    status: "planned",
    featured: false,
    draft: true,
    galleryKeys: [],
    videoMode: "none",
    links: [],
    contributors: [],
    organizations: [],
    outputs: [],
    description: "",
    services: [],
    media: [],
  };
}

export function draftToProject(draft: ProjectDraft): ProjectDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    categories: [...new Set(draft.categories)],
    techStack: [...new Set(draft.techStack.map((item) => item.trim()).filter(Boolean))],
    startDate: draft.startDate || undefined,
    endDate: draft.endDate || undefined,
    role: draft.role?.trim() || undefined,
    platform: draft.platform?.trim() || undefined,
    coverAlt: draft.coverAlt?.trim() || undefined,
    galleryKeys: [...draft.galleryKeys],
    videoUrl: draft.videoUrl?.trim() || undefined,
    videoName: draft.videoName?.trim() || undefined,
    links: draft.links.map((link) => ({ ...link, label: link.label.trim(), url: link.url.trim() })),
    contributors: draft.contributors
      .map((contributor) => ({
        ...contributor,
        name: contributor.name.trim(),
        role: contributor.role?.trim() || undefined,
        affiliation: contributor.affiliation?.trim() || undefined,
        url: contributor.url?.trim() || undefined,
      }))
      .filter((contributor) => Boolean(contributor.name)),
    organizations: draft.organizations
      .map((organization) => ({
        ...organization,
        name: organization.name.trim(),
        url: organization.url?.trim() || undefined,
      }))
      .filter((organization) => Boolean(organization.name)),
    outputs: draft.outputs.map((output) => ({
      ...output,
      label: output.label.trim(),
      href: output.href.trim(),
      recordSlug: output.recordSlug?.trim() || undefined,
    })),
    seoTitle: draft.seoTitle?.trim() || undefined,
    seoDescription: draft.seoDescription?.trim() || undefined,
    description: normalizeDescription(draft.description ?? "") || undefined,
    cta:
      draft.cta && draft.cta.label.trim() && draft.cta.url.trim()
        ? { label: draft.cta.label.trim(), url: draft.cta.url.trim() }
        : undefined,
    services: [...new Set((draft.services ?? []).map((item) => item.trim()).filter(Boolean))],
    media: (draft.media ?? []).map((item) => ({
      ...item,
      alt: item.alt?.trim() || undefined,
      posterKey: item.posterKey || undefined,
    })),
  };
}

export function projectToDraft(project: ProjectDraft): ProjectDraft {
  return {
    ...project,
    categories: [...project.categories],
    techStack: [...project.techStack],
    startDate: project.startDate ?? "",
    endDate: project.endDate ?? "",
    role: project.role ?? "",
    platform: project.platform ?? "",
    coverAlt: project.coverAlt ?? "",
    galleryKeys: [...project.galleryKeys],
    videoUrl: project.videoUrl ?? "",
    videoName: project.videoName ?? "",
    links: project.links.map((link) => ({ ...link })),
    contributors: project.contributors.map((contributor) => ({
      ...contributor,
      kind: contributorKind(contributor),
      role: contributor.role ?? "",
      affiliation: contributor.affiliation ?? "",
      url: contributor.url ?? "",
    })),
    organizations: project.organizations.map((organization) => ({ ...organization })),
    outputs: project.outputs.map((output) => ({ ...output })),
    seoTitle: project.seoTitle ?? "",
    seoDescription: project.seoDescription ?? "",
    description: project.description ?? "",
    cta: project.cta ? { ...project.cta } : undefined,
    services: [...(project.services ?? [])],
    // Older records have no media sections yet: the editor starts from the
    // same list the public page derives, so saving keeps what visitors see.
    media: projectMediaSections(project).map((item) => ({ ...item })),
  };
}

/** Trims each paragraph and collapses runs of blank lines to one. */
export function normalizeDescription(value: string) {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** The detail page's paragraphs: the description, else the summary. */
export function projectDescriptionParagraphs(project: ProjectDraft) {
  const text = normalizeDescription(project.description || project.summary || "");
  return text ? text.split("\n\n") : [];
}

function hashSlug(slug: string) {
  let hash = 2166136261;
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * The project's palette: the one an editor picked, else a stable pick from
 * the slug, so older records still get a considered theme of their own.
 */
export function projectThemeId(project: Pick<ProjectDraft, "slug" | "theme">): ProjectThemeId {
  if (project.theme && (PROJECT_THEME_IDS as readonly string[]).includes(project.theme)) {
    return project.theme;
  }
  return PROJECT_THEME_IDS[hashSlug(project.slug) % PROJECT_THEME_IDS.length];
}

/**
 * The detail page's ordered media. Records without media sections (saved
 * before they existed, or with none added yet) derive theirs: the cover runs
 * full height first, gallery images follow at the normal size, and an
 * uploaded demo video closes full height.
 */
export function projectMediaSections(
  project: ProjectDraft,
  sizes?: Record<string, [number, number]>,
): ProjectMediaItem[] {
  const sections = derivedMediaSections(project);
  if (!sizes) return sections;
  // Fill in sizes the record didn't store (older uploads) from the API's
  // measurements, so the page can lay out before the files load.
  return sections.map((item) => {
    const size = !item.width || !item.height ? sizes[item.key] : undefined;
    return size ? { ...item, width: size[0], height: size[1] } : item;
  });
}

const SECTION_ALT_MAX = PROJECT_DETAIL_LIMITS.mediaAltMax;
const VIDEO_FILE_NAME = /\.(mp4|webm|mov|m4v|mkv|avi)$/i;

function derivedMediaSections(project: ProjectDraft): ProjectMediaItem[] {
  if (project.media?.length) return project.media;
  const sections: ProjectMediaItem[] = [];
  const seen = new Set<string>();
  const push = (item: ProjectMediaItem) => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    sections.push(item);
  };
  if (project.coverKey) {
    push({
      id: "cover",
      kind: "image",
      size: "full",
      key: project.coverKey,
      width: 0,
      height: 0,
      // The cover's alt may run to 300 characters, a section's to 200.
      alt: project.coverAlt?.slice(0, SECTION_ALT_MAX),
    });
  }
  project.galleryKeys.forEach((key, index) =>
    push({ id: `gallery-${index}`, kind: "image", size: "normal", key, width: 0, height: 0 }),
  );
  if (project.videoMode === "upload" && project.videoKey) {
    push({
      id: "demo-video",
      kind: "video",
      size: "full",
      key: project.videoKey,
      width: 0,
      height: 0,
      // An uploaded demo's name is usually its file name: no use as alt text.
      alt:
        project.videoName && !VIDEO_FILE_NAME.test(project.videoName.trim())
          ? project.videoName
          : undefined,
    });
  }
  return sections;
}

/** The project after this one in list order, wrapping around; undefined when alone. */
export function nextPublishedProject(
  records: readonly CmsProjectRecord[],
  slug: string,
): CmsProjectRecord | undefined {
  const ordered = publishedProjects(records);
  if (ordered.length < 2) return undefined;
  const index = ordered.findIndex((record) => record.slug === slug);
  return ordered[(index + 1) % ordered.length];
}

/** Newest activity first: the end date, falling back to the start date, then the save time. */
function projectSortKey(record: CmsProjectRecord) {
  return record.project.endDate ?? record.project.startDate ?? record.updatedAt ?? "";
}

export function publishedProjects(records: readonly CmsProjectRecord[]) {
  return records
    .filter((record) => !record.project.draft)
    .sort((left, right) => projectSortKey(right).localeCompare(projectSortKey(left)));
}

/** Published projects an admin has flagged for spotlight placement (the homepage card swap). */
export function featuredProjects(records: readonly CmsProjectRecord[]) {
  return publishedProjects(records).filter((record) => record.project.featured);
}

/** Resolves a media key to a loadable URL — bundled seed art or CMS media. */
export function projectMediaUrl(key?: string) {
  if (!key) return undefined;
  if (key.startsWith("static/")) return `/${key.slice("static/".length)}`;
  return `/api/projects-cms/media/${encodeURIComponent(key)}`;
}

/** Resolves an uploaded video key (or bundled `static/` art) to a loadable, range-seekable URL. */
export function projectVideoUrl(key?: string) {
  if (!key) return undefined;
  if (key.startsWith("static/")) return `/${key.slice("static/".length)}`;
  return `/api/projects-cms/video/${encodeURIComponent(key)}`;
}

/** The card carousel / gallery source list: the cover first, then the gallery, deduplicated. */
export function projectGalleryKeys(project: ProjectDraft) {
  const keys = [project.coverKey, ...project.galleryKeys].filter((key): key is string =>
    Boolean(key),
  );
  return [...new Set(keys)];
}

/**
 * CMS-authored links are trusted but rendered publicly, so non-web schemes
 * are refused outright. Site paths (a single leading slash, never
 * protocol-relative) and http(s) URLs only; javascript:, data:, and
 * everything else must render as plain text instead of a link.
 */
export function safeProjectHref(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/(?!\/)/.test(value)) return value;
  return undefined;
}

export function parseYoutubeId(url: string) {
  return url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i)?.[1];
}

export function parseVimeoId(url: string) {
  return url.match(/vimeo\.com\/(?:video\/)?(\d+)/i)?.[1];
}

/** "Sabtu, 31 Agustus 2024" — the same long form articles and publications use. */
export function formatProjectDate(value: string) {
  return formatArticleDate(value);
}

/** "31 Agustus 2024" without the weekday, for compact cards and meta rows. */
export function formatProjectDateShort(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** A date range label like "2025 to present" (no em dashes in site copy). */
export function formatProjectPeriod(project: ProjectDraft) {
  const start = project.startDate?.slice(0, 4);
  const end = project.endDate?.slice(0, 4);
  if (!start && !end) return undefined;
  if (start && end && start === end) return start;
  return `${start ?? "Unknown"} to ${end ?? "present"}`;
}

export function formatVideoSize(bytes?: number) {
  if (!bytes) return undefined;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
