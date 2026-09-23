"use client";

import Link from "next/link";

import { ProjectCardCover } from "@/components/projects/project-card-cover";
import { ProjectCardFooter } from "@/components/projects/project-card-footer";
import {
  projectGalleryKeys,
  projectMediaUrl,
  PROJECT_CATEGORY_LABELS,
  type CmsProjectRecord,
} from "@/lib/project-cms";
import { cn } from "@/lib/utils";

/**
 * The public list card, modeled on lusion.co/projects: a forced 3:2 cover
 * (project-card-cover.tsx, drawn by the page's WebGL cover stage when it
 * runs), then a one-line categories row and a one-line title
 * (project-card-footer.tsx). Both halves hang their hover effects off this
 * link root, which each finds from its own element (`closest("a")`).
 *
 * The link carries an explicit accessible name: the visual text is split
 * into per-character pieces for its animations, which screen readers would
 * otherwise read letter by letter.
 */
export function ProjectCard({
  record,
  index,
  className,
}: {
  record: CmsProjectRecord;
  index: number;
  className?: string;
}) {
  const { project } = record;
  const coverUrl = projectGalleryKeys(project)
    .map((key) => projectMediaUrl(key))
    .find((url): url is string => Boolean(url));
  const categories = project.categories
    .map((category) => PROJECT_CATEGORY_LABELS[category])
    .filter(Boolean);

  return (
    <Link
      href={`/projects/${record.slug}`}
      aria-label={categories.length ? `${project.title} (${categories.join(", ")})` : project.title}
      // A designed keyboard ring around the whole card (the hover effects
      // also follow :focus-visible); an outline, never a transform, since
      // the cover stage and the footer animate the card's insides. The
      // scroll margins keep a focus-scrolled card's ring clear of the fixed
      // header (64px) and the viewport's bottom edge.
      className={cn(
        "group block scroll-mt-20 scroll-mb-4 rounded-[23px] focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-[var(--focus)]",
        className,
      )}
    >
      <ProjectCardCover
        coverUrl={coverUrl}
        alt={project.coverAlt || ""}
        slug={record.slug}
        index={index}
      />
      <ProjectCardFooter title={project.title} categories={categories} />
    </Link>
  );
}
