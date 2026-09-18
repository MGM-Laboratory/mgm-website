import { CtaFooter } from "@/components/sections/cta-footer";
import { FocusHero } from "./focus-hero";
import { MonitorWall } from "./monitor-wall";
import { ShipTerminal } from "./ship-terminal";

/**
 * The Website focus page's own bespoke build — deliberately not the shared
 * `CompetencyPageContent` band that /game, /mobile, and /ux still use, so
 * this page can go bold without touching the other three.
 */
export function WebsiteFocusPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <FocusHero />
        <MonitorWall />
        <ShipTerminal />
      </main>
      <CtaFooter />
    </div>
  );
}
