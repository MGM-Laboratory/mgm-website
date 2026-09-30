import { Hero } from "@/components/hero/hero";
import { ProcessSection } from "@/components/process/process-section";
import { FeaturedProjectsSection } from "@/components/sections/featured-projects-section";
import { CtaFooter } from "@/components/sections/cta-footer";
import { ReelSection } from "@/components/reel/reel-section";
import { ReelPlayerHost } from "@/components/reel/player/reel-player-host";
import { StorySection } from "@/components/story/story-section";
import { fetchHomeContent } from "@/lib/home-cms-server";
import { featuredProjects, publishedProjects, type CmsProjectRecord } from "@/lib/project-cms";
import { fetchProjectFeed } from "@/lib/project-cms-server";

const HOMEPAGE_PREVIEW_LIMIT = 10;

export default async function Home() {
  // Only the newest featured projects render on the homepage, so the server
  // fetches the light feed and trims it before it reaches the client.
  const [projectData, homeContent] = await Promise.all([
    fetchProjectFeed()
      .then((records) => ({
        projects: featuredProjects(records).slice(0, HOMEPAGE_PREVIEW_LIMIT),
        unfeaturedCount: publishedProjects(records).filter((record) => !record.project.featured)
          .length,
      }))
      .catch(() => ({ projects: [] as CmsProjectRecord[], unfeaturedCount: 0 })),
    fetchHomeContent(),
  ]);
  const { projects, unfeaturedCount } = projectData;

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <Hero />
        <ProcessSection />
        <ReelSection content={homeContent} />
        <FeaturedProjectsSection records={projects} unfeaturedCount={unfeaturedCount} />
        {/* The story: the deck, the table, five worlds, and your turn (docs/homepage-story.md). */}
        <StorySection />
      </main>
      <CtaFooter />
      <ReelPlayerHost />
    </div>
  );
}
