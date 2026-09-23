import type { Metadata } from "next";

import { ProjectsGrid } from "@/components/projects/projects-grid";
import { ProjectsHero } from "@/components/projects/projects-hero";
import { CtaFooter } from "@/components/sections/cta-footer";
import { publishedProjects, type CmsProjectRecord } from "@/lib/project-cms";
import { fetchProjectFeed } from "@/lib/project-cms-server";

export const metadata: Metadata = {
  title: "Projects — MGM Laboratory",
  description: "A selection of research-driven products the lab has built end to end.",
};

// Projects resolves entirely at request time: the CMS is the source of
// truth and admin publishes must reach the public page immediately.
export const revalidate = 0;

export default async function ProjectsPage() {
  let records: CmsProjectRecord[] = [];
  try {
    records = publishedProjects(await fetchProjectFeed());
  } catch {
    records = [];
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col overflow-x-clip bg-[#fcfcfc] dark:bg-[#0e1116]">
      <main className="flex-1 px-6 sm:px-10 lg:px-14">
        <ProjectsHero count={records.length} />

        {records.length ? (
          <ProjectsGrid records={records} />
        ) : (
          // Same id and scroll margin as the grid, so the hero's "Jump to
          // the project list" arrow still has a target (the native fragment
          // jump under reduced motion included). Focusable from script only,
          // so keyboard focus can follow the arrow's jump here.
          <div
            id="projects"
            tabIndex={-1}
            className="scroll-mt-24 rounded-2xl border border-[var(--line)] px-8 py-16 text-center"
          >
            <p className="font-display text-xl font-semibold text-[#0e1116] dark:text-white">
              No projects yet
            </p>
            <p className="mt-2 text-[var(--ink-3)]">
              The lab&apos;s first case studies are on their way.
            </p>
          </div>
        )}
      </main>
      <CtaFooter />
    </div>
  );
}
