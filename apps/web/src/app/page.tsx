import { Hero } from "@/components/hero/hero";
import { ProcessSection } from "@/components/process/process-section";
import { CoreCompetenciesSection } from "@/components/sections/core-competencies";
import { TrustedBySection } from "@/components/sections/trusted-by-section";
import { ShowcaseSection, ShowcaseCard } from "@/components/sections/showcase-section";
import { ArticlesSection } from "@/components/sections/articles-section";
import { PublicationsPreviewSection } from "@/components/sections/publications-preview-section";
import { CtaFooter } from "@/components/sections/cta-footer";
import { HomeVideoSection } from "@/components/sections/home-video-section";
import { ProjectPreviewCard } from "@/components/projects/project-preview-card";
import { publishedArticles } from "@/lib/article-cms";
import { ensureArticleFeed } from "@/lib/article-cms-seed";
import { fetchHomeContent } from "@/lib/home-cms-server";
import { publishedProjects, type CmsProjectRecord } from "@/lib/project-cms";
import { fetchProjectFeed } from "@/lib/project-cms-server";
import { publishedPublications, type CmsPublicationRecord } from "@/lib/publication-cms";
import { ensurePublicationFeed } from "@/lib/publication-cms-seed";

const HOMEPAGE_PREVIEW_LIMIT = 10;

const ACHIEVEMENTS = [
  {
    title: "Best Research Prototype",
    description: "Recognized at a national interactive-media showcase for early prototype work.",
  },
  {
    title: "Campus Innovation Award",
    description: "Awarded for a mobile-first research tool built with the local community.",
  },
  {
    title: "Published Case Study",
    description: "A usability study from the lab was featured in a regional design publication.",
  },
];

export default async function Home() {
  // Only the newest ten records of each kind render on the homepage, so the
  // server fetches the light feed and trims it before it reaches the client.
  const [initialArticles, projects, publications, homeContent] = await Promise.all([
    ensureArticleFeed()
      .then((records) => publishedArticles(records).slice(0, HOMEPAGE_PREVIEW_LIMIT))
      .catch(() => [] as Awaited<ReturnType<typeof ensureArticleFeed>>),
    fetchProjectFeed()
      .then((records) => publishedProjects(records).slice(0, HOMEPAGE_PREVIEW_LIMIT))
      .catch(() => [] as CmsProjectRecord[]),
    ensurePublicationFeed()
      .then((records) => publishedPublications(records).slice(0, HOMEPAGE_PREVIEW_LIMIT))
      .catch(() => [] as CmsPublicationRecord[]),
    fetchHomeContent(),
  ]);

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <Hero />
        <ProcessSection />
        <CoreCompetenciesSection />
        <TrustedBySection />
        <HomeVideoSection content={homeContent} />
        <ShowcaseSection
          id="projects"
          title="Projects"
          intro="A selection of research-driven products the lab has built end to end."
          seeMoreHref="/projects"
          emptyMessage="No projects yet — the lab's first case studies are on their way."
          count={projects.length}
        >
          {projects.map((record) => (
            <article key={record.slug} className="reveal-card w-[320px] shrink-0 opacity-0">
              <ProjectPreviewCard record={record} />
            </article>
          ))}
        </ShowcaseSection>
        <PublicationsPreviewSection records={publications} />
        <ShowcaseSection
          id="achievements"
          title="Achievements"
          intro="Milestones the lab has reached along the way."
          count={ACHIEVEMENTS.length}
        >
          {ACHIEVEMENTS.map((item) => (
            <article key={item.title} className="reveal-card w-[320px] shrink-0 opacity-0">
              <ShowcaseCard {...item} />
            </article>
          ))}
        </ShowcaseSection>
        <ArticlesSection initialRecords={initialArticles} />
      </main>
      <CtaFooter />
    </div>
  );
}
