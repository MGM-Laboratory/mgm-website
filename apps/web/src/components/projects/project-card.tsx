import Link from "next/link";

import { ProjectThumbnailCarousel } from "@/components/projects/project-thumbnail-carousel";
import {
  projectGalleryKeys,
  projectMediaUrl,
  PROJECT_CATEGORY_LABELS,
  type CmsProjectRecord,
} from "@/lib/project-cms";

/**
 * The public list card: a big preview built for two-per-row desktop grids.
 * The thumbnail carousel is a sibling of the title link, never nested
 * inside it — a link wrapping interactive prev/next controls is invalid and
 * would hijack every click on the card.
 */
export function ProjectCard({ record }: { record: CmsProjectRecord }) {
  const { project } = record;
  const images = projectGalleryKeys(project)
    .map((key) => projectMediaUrl(key))
    .filter((url): url is string => Boolean(url));

  return (
    <div className="group flex flex-col">
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] dark:border-white/10">
        <ProjectThumbnailCarousel
          alt={project.title}
          className="aspect-[16/10] w-full"
          images={images}
        />
      </div>
      <Link className="mt-5 block min-w-0" href={`/projects/${record.slug}`}>
        {project.categories.length ? (
          <div className="flex flex-wrap gap-x-[9px] gap-y-1">
            {project.categories.map((category) => (
              <span
                className="text-[11px] font-medium tracking-[0.12em] text-[#464646] uppercase dark:text-[#b9bcc6]"
                key={category}
              >
                {PROJECT_CATEGORY_LABELS[category]}
              </span>
            ))}
          </div>
        ) : null}
        <h2 className="mt-3 font-display text-[1.5rem] leading-snug font-medium text-[#0e1116] transition group-hover:text-brand-blue dark:text-white">
          {project.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-[var(--ink-2)] dark:text-white/65">
          {project.summary}
        </p>
        {project.techStack.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.techStack.slice(0, 6).map((tech) => (
              <span
                className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-3)] dark:bg-white/[0.06] dark:text-white/50"
                key={tech}
              >
                {tech}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
    </div>
  );
}
