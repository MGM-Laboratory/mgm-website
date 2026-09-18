import { CtaFooter } from "@/components/sections/cta-footer";
import { WebsiteHero } from "./website-hero";

export function WebsiteFocusPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <WebsiteHero />
      </main>
      <CtaFooter />
    </div>
  );
}
