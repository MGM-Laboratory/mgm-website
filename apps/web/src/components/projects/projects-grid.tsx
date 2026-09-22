"use client";

import { ProjectCard } from "@/components/projects/project-card";
import type { CmsProjectRecord } from "@/lib/project-cms";
import { useFadeUpOnScroll } from "@/lib/scroll-reveal";

/**
 * The full project index: every published project, two cards per row on
 * desktop, revealed in one staggered sweep as the grid scrolls into view.
 */
export function ProjectsGrid({ records }: { records: CmsProjectRecord[] }) {
  const rootRef = useFadeUpOnScroll<HTMLElement>(".projects-grid-card", {
    start: "top 82%",
    stagger: 0.05,
    y: 36,
  });

  return (
    <section
      ref={rootRef}
      id="projects"
      className="grid scroll-mt-24 grid-cols-1 gap-x-7 gap-y-16 pb-28 md:grid-cols-2 md:gap-y-20 md:pb-36"
    >
      {records.map((record) => (
        <ProjectCard className="projects-grid-card" key={record.slug} record={record} />
      ))}
    </section>
  );
}
