import { BauhausField } from "@/components/about/bauhaus-field";
import { CtaFooter } from "@/components/sections/cta-footer";
import { BandoarSection } from "./bandoar-section";
import { GameHero } from "./game-hero";
import { PlatformsSection } from "./platforms-section";
import { ReleasePipelineSection } from "./release-pipeline-section";
import { StudioToolkitSection } from "./studio-toolkit-section";

export function GameFocusPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <div className="relative overflow-hidden bg-[var(--surface-muted)]">
          <BauhausField />
          <div className="relative z-10">
            <GameHero />
          </div>
        </div>
        <PlatformsSection />
        <StudioToolkitSection />
        <ReleasePipelineSection />
        <BandoarSection />
      </main>
      <CtaFooter />
    </div>
  );
}
