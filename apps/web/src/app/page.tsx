import { Hero } from "@/components/hero/hero";
import { ProcessSection } from "@/components/process/process-section";
import { CoreCompetenciesSection } from "@/components/sections/core-competencies";
import { ShowcaseSection } from "@/components/sections/showcase-section";
import { ArticlesSection } from "@/components/sections/articles-section";
import { CtaFooter } from "@/components/sections/cta-footer";
import { PROJECTS } from "@/data/projects";
import { publishedArticles } from "@/lib/article-cms";
import { ensureArticleCmsSeeded } from "@/lib/article-cms-seed";

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
  const initialArticles = await ensureArticleCmsSeeded()
    .then(publishedArticles)
    .catch(() => []);
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <Hero />
        <ProcessSection />
        <CoreCompetenciesSection />
        <ShowcaseSection
          id="projects"
          title="Projects"
          intro="A selection of research-driven products the lab has built end to end."
          items={PROJECTS}
        />
        <ShowcaseSection
          id="achievements"
          title="Achievements"
          intro="Milestones the lab has reached along the way."
          items={ACHIEVEMENTS}
        />
        <ArticlesSection initialRecords={initialArticles} />
      </main>
      <CtaFooter />
    </div>
  );
}
