"use client";

import { ProjectCard } from "@/components/projects/project-card";
import { HOME_CHAPTERS } from "@/components/home-extras/chapters";
import { KineticHeading } from "@/components/home-extras/kinetic-heading";
import { SeeMoreLink } from "@/components/home-extras/see-more-link";
import type { CmsProjectRecord } from "@/lib/project-cms";

/** The same project cards used by /projects, limited to the CMS featured set. */
export function FeaturedProjectsSection({
  records,
  unfeaturedCount,
}: Readonly<{ records: readonly CmsProjectRecord[]; unfeaturedCount: number }>) {
  if (records.length === 0) return null;

  return (
    <section
      id="projects"
      aria-labelledby="featured-projects-heading"
      className="bg-background px-6 pt-20 pb-24 sm:px-10 sm:pt-28 sm:pb-32 lg:px-14"
    >
      <div className="mx-auto max-w-[90rem]">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-6 sm:mb-14">
          <div>
            <KineticHeading
              id="featured-projects-heading"
              chapter={HOME_CHAPTERS.projects}
              text="Featured work"
              className="font-display text-[clamp(2.5rem,5vw,5.5rem)] leading-[1.05] font-semibold tracking-tight text-foreground"
            />
            <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground/70">
              Selected projects from the lab. Open one to explore the work behind it.
            </p>
          </div>
          <SeeMoreLink href="/projects">See all projects</SeeMoreLink>
        </div>

        <div className="grid grid-cols-1 gap-x-7 gap-y-14 md:grid-cols-2 md:gap-y-20">
          {records.map((record, index) => (
            <ProjectCard key={record.slug} record={record} index={index} standalone />
          ))}
        </div>
        {unfeaturedCount > 0 ? (
          <div className="mt-16 flex justify-center sm:mt-20">
            <SeeMoreLink href="/projects">
              See {unfeaturedCount} more {unfeaturedCount === 1 ? "project" : "projects"}
            </SeeMoreLink>
          </div>
        ) : null}
      </div>
    </section>
  );
}
