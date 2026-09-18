import { CtaFooter } from "@/components/sections/cta-footer";
import { BuildTypesSection } from "./build-types-section";
import { PipelineSection } from "./pipeline-section";
import { ProofSection } from "./proof-section";
import { ToolkitSection } from "./toolkit-section";
import { WebsiteHero } from "./website-hero";

export function WebsiteFocusPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <WebsiteHero />
        <BuildTypesSection />
        <ToolkitSection />
        <PipelineSection />
        <ProofSection />
      </main>
      <CtaFooter />
    </div>
  );
}
