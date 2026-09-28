import { Hero } from "@/components/hero/hero";
import { ProcessSection } from "@/components/process/process-section";
import { CoreCompetenciesSection } from "@/components/sections/core-competencies";
import { TrustedBySection } from "@/components/sections/trusted-by-section";
import { ArticlesSection } from "@/components/sections/articles-section";
import { PublicationsPreviewSection } from "@/components/sections/publications-preview-section";
import { FeaturedProjectsSection } from "@/components/sections/featured-projects-section";
import { CtaFooter } from "@/components/sections/cta-footer";
import { ReelSection } from "@/components/reel/reel-section";
import { ReelPlayerHost } from "@/components/reel/player/reel-player-host";
import { HOME_CHAPTERS } from "@/components/home-extras/chapters";
import { HomeFinale } from "@/components/home-extras/home-finale";
import { publishedArticles } from "@/lib/article-cms";
import { ensureArticleFeed } from "@/lib/article-cms-seed";
import { fetchHomeContent } from "@/lib/home-cms-server";
import { featuredProjects, publishedProjects, type CmsProjectRecord } from "@/lib/project-cms";
import { fetchProjectFeed } from "@/lib/project-cms-server";
import { publishedPublications, type CmsPublicationRecord } from "@/lib/publication-cms";
import { ensurePublicationFeed } from "@/lib/publication-cms-seed";

const HOMEPAGE_PREVIEW_LIMIT = 10;

export default async function Home() {
  // Only the newest ten records of each kind render on the homepage, so the
  // server fetches the light feed and trims it before it reaches the client.
  const [initialArticles, projectFeed, publications, homeContent] = await Promise.all([
    ensureArticleFeed()
      .then((records) => publishedArticles(records).slice(0, HOMEPAGE_PREVIEW_LIMIT))
      .catch(() => [] as Awaited<ReturnType<typeof ensureArticleFeed>>),
    fetchProjectFeed().catch(() => [] as CmsProjectRecord[]),
    ensurePublicationFeed()
      .then((records) => publishedPublications(records).slice(0, HOMEPAGE_PREVIEW_LIMIT))
      .catch(() => [] as CmsPublicationRecord[]),
    fetchHomeContent(),
  ]);
  const projects = featuredProjects(projectFeed).slice(0, HOMEPAGE_PREVIEW_LIMIT);
  const unfeaturedCount = publishedProjects(projectFeed).filter(
    (record) => !record.project.featured,
  ).length;

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <Hero />
        <ProcessSection />
        <ReelSection content={homeContent} />
        <FeaturedProjectsSection records={projects} unfeaturedCount={unfeaturedCount} />
        <CoreCompetenciesSection />
        <TrustedBySection compact chapter={HOME_CHAPTERS.trustedBy} />
        <PublicationsPreviewSection records={publications} />
        <ArticlesSection initialRecords={initialArticles} />
      </main>
      <CtaFooter lead={<HomeFinale />} />
      <ReelPlayerHost />
    </div>
  );
}
