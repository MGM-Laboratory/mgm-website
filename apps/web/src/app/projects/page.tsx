import type { Metadata } from "next";

import { ShowcaseSection } from "@/components/sections/showcase-section";
import { CtaFooter } from "@/components/sections/cta-footer";
import { PROJECTS } from "@/data/projects";

export const metadata: Metadata = {
  title: "Projects — MGM Laboratory",
  description: "A selection of research-driven products the lab has built end to end.",
};

export default function ProjectsPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <h1 className="sr-only">Projects</h1>
        <div className="pt-8 sm:pt-12" />
        <ShowcaseSection
          id="projects"
          title="Projects"
          intro="A selection of research-driven products the lab has built end to end."
          items={PROJECTS}
        />
      </main>
      <CtaFooter />
    </div>
  );
}
