import { BauhausField } from "@/components/about/bauhaus-field";
import { CtaFooter } from "@/components/sections/cta-footer";
import { DeviceStatsSection } from "./device-stats-section";
import { HistorySection } from "./history-section";
import { MobileHero } from "./mobile-hero";
import { StorePipelineSection } from "./store-pipeline-section";
import { ToolkitSection } from "./toolkit-section";

export function MobileFocusPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <div className="relative overflow-hidden bg-[var(--surface-muted)]">
          <BauhausField />
          <div className="relative z-10">
            <MobileHero />
          </div>
        </div>
        <DeviceStatsSection />
        <ToolkitSection />
        <StorePipelineSection />
        <HistorySection />
      </main>
      <CtaFooter />
    </div>
  );
}
