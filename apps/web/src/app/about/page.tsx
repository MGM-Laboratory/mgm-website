import type { Metadata } from "next";

import { CtaFooter } from "@/components/sections/cta-footer";
import { TrustedBySection } from "@/components/sections/trusted-by-section";
import { ShowcaseSection } from "@/components/sections/showcase-section";
import { ProjectPreviewCard } from "@/components/projects/project-preview-card";
import { AboutHero } from "@/components/about/about-hero";
import { BauhausField } from "@/components/about/bauhaus-field";
import { StorySection } from "@/components/about/story-section";
import { TeamSpotlight } from "@/components/about/team-spotlight";
import { FlowingCompetencies } from "@/components/about/flowing-competencies";
import { FaqSection } from "@/components/about/faq-section";
import { publishedProjects, type CmsProjectRecord } from "@/lib/project-cms";
import { fetchProjectFeed } from "@/lib/project-cms-server";
import type { CmsMemberRecord } from "@/lib/member-cms";
import { ensureMemberCmsSeeded } from "@/lib/member-cms-seed";

export const metadata: Metadata = {
  title: "About Us | MGM Laboratory",
  description: "Who we are, how we started, and what we build at MGM Laboratory.",
};

const PROJECT_PREVIEW_LIMIT = 6;

export default async function AboutPage() {
  const [projects, memberRecords] = await Promise.all([
    fetchProjectFeed()
      .then((records) => publishedProjects(records).slice(0, PROJECT_PREVIEW_LIMIT))
      .catch(() => [] as CmsProjectRecord[]),
    ensureMemberCmsSeeded().catch(() => [] as CmsMemberRecord[]),
  ]);

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <div className="relative overflow-hidden bg-[var(--surface-muted)]">
          <BauhausField />
          <div className="relative z-10">
            <AboutHero />
            <StorySection />
          </div>
        </div>

        <FlowingCompetencies />
        <TeamSpotlight initialRecords={memberRecords} />

        <ShowcaseSection
          id="about-projects"
          title="What we've built"
          intro="A few of the projects that came out of the lab."
          seeMoreHref="/projects"
          emptyMessage="Our first projects are on their way."
          count={projects.length}
          compact
        >
          {projects.map((record) => (
            <article key={record.slug} className="reveal-card w-[320px] shrink-0 opacity-0">
              <ProjectPreviewCard record={record} />
            </article>
          ))}
        </ShowcaseSection>

        <TrustedBySection compact />
        <FaqSection />
      </main>
      <CtaFooter />
    </div>
  );
}
