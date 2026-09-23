import {
  nextPublishedProject,
  projectDescriptionParagraphs,
  projectMediaSections,
  projectMediaUrl,
  projectThemeId,
  projectVideoUrl,
  safeProjectHref,
  type CmsProjectRecord,
  type ProjectThemeId,
} from "@/lib/project-cms";

/**
 * The detail page's view of a CMS record: every URL resolved, every
 * fallback applied (description to summary, services to tech stack, media
 * derived from the cover, gallery and demo video on older records), and
 * nothing the page doesn't render. Built on the server, so the client
 * receives plain, serialisable data.
 */

export type DetailMediaItem = {
  id: string;
  kind: "image" | "video";
  /** "full" runs edge to edge, the full viewport height; "normal" sits in the padded band. */
  full: boolean;
  src: string;
  poster?: string;
  /** Intrinsic size; 0 when unknown (the page assumes 16:9 until the file loads). */
  width: number;
  height: number;
  alt: string;
};

export type DetailLink = { label: string; href: string; external: boolean };
export type DetailCredit = { name: string; role?: string };

export type DetailNext = { slug: string; title: string; themeId: ProjectThemeId };

export type DetailData = {
  slug: string;
  title: string;
  paragraphs: string[];
  cta?: DetailLink;
  services: string[];
  links: DetailLink[];
  credits: DetailCredit[];
  media: DetailMediaItem[];
  themeId: ProjectThemeId;
  coverUrl?: string;
  next?: DetailNext;
};

function link(label: string, url: string | undefined): DetailLink | undefined {
  const href = url ? safeProjectHref(url.trim()) : undefined;
  const text = label.trim();
  if (!href || !text) return undefined;
  return { label: text, href, external: /^https?:\/\//i.test(href) };
}

function uniqueLinks(links: (DetailLink | undefined)[]) {
  const seen = new Set<string>();
  return links.filter((entry): entry is DetailLink => {
    if (!entry || seen.has(entry.href)) return false;
    seen.add(entry.href);
    return true;
  });
}

export function projectDetailData(
  record: CmsProjectRecord,
  feed: readonly CmsProjectRecord[],
): DetailData {
  const { project } = record;
  const title = project.title.trim();
  const sections = projectMediaSections(project, record.mediaSizes);
  const total = sections.length;

  const media = sections.flatMap((section, index): DetailMediaItem[] => {
    const src =
      section.kind === "video" ? projectVideoUrl(section.key) : projectMediaUrl(section.key);
    if (!src) return [];
    const noun = section.kind === "video" ? "video" : "image";
    return [
      {
        id: section.id,
        kind: section.kind,
        full: section.size === "full",
        src,
        poster: section.kind === "video" ? projectMediaUrl(section.posterKey) : undefined,
        width: section.width,
        height: section.height,
        alt: section.alt?.trim() || `${title}, ${noun} ${index + 1} of ${total}`,
      },
    ];
  });

  // A demo video linked rather than uploaded (YouTube, Vimeo or a file URL)
  // can't loop silently in the strip, so it becomes a link instead.
  const demoLink =
    project.videoMode === "url" || project.videoMode === "youtube"
      ? link("Demo video", project.videoUrl)
      : undefined;

  const next = nextPublishedProject(feed, record.slug);
  const services = (project.services?.length ? project.services : project.techStack)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    slug: record.slug,
    title,
    paragraphs: projectDescriptionParagraphs(project),
    cta: project.cta ? link(project.cta.label, project.cta.url) : undefined,
    services: [...new Set(services)],
    links: uniqueLinks([
      ...project.links.map((entry) => link(entry.label, entry.url)),
      demoLink,
      ...project.organizations.map((entry) => link(entry.name, entry.url)),
      ...project.outputs.map((entry) => link(entry.label, entry.href)),
    ]),
    credits: project.contributors
      .map((entry) => ({ name: entry.name.trim(), role: entry.role?.trim() || undefined }))
      .filter((entry) => entry.name),
    media,
    themeId: projectThemeId(project),
    coverUrl:
      projectMediaUrl(project.coverKey) ?? media.find((entry) => entry.kind === "image")?.src,
    next:
      next && next.slug !== record.slug
        ? {
            slug: next.slug,
            title: next.project.title.trim(),
            themeId: projectThemeId(next.project),
          }
        : undefined,
  };
}
