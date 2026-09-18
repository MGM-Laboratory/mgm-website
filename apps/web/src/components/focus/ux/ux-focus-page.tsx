import { BauhausField } from "@/components/about/bauhaus-field";
import { CtaFooter } from "@/components/sections/cta-footer";
import { ClosingSection } from "./closing-section";
import { EquipmentSection } from "./equipment-section";
import { ProcessSection } from "./process-section";
import { ResearchSection } from "./research-section";
import { UxHero } from "./ux-hero";

export function UxFocusPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <div className="relative overflow-hidden bg-[var(--surface-muted)]">
          <BauhausField />
          <div className="relative z-10">
            <UxHero />
          </div>
        </div>
        <ResearchSection />
        <EquipmentSection />
        <ProcessSection />
        <ClosingSection />
      </main>
      <CtaFooter />
    </div>
  );
}
