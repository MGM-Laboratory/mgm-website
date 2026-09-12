import { CtaFooter } from "@/components/sections/cta-footer";
import { CompetencyMotifShape } from "./competency-motif";
import type { Competency, CompetencyColor } from "@/data/competencies";

const BAND_BG: Record<CompetencyColor, string> = {
  blue: "bg-brand-blue",
  red: "bg-brand-red",
  yellow: "bg-brand-yellow",
  green: "bg-brand-green",
};

export function CompetencyPageContent({ competency }: { competency: Competency }) {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <section
          className={`relative overflow-hidden px-6 py-20 text-white sm:px-10 sm:py-28 lg:px-16 ${BAND_BG[competency.color]}`}
        >
          <CompetencyMotifShape
            motif={competency.motif}
            stroke="rgba(255,255,255,0.18)"
            className="-top-10 -right-10 size-64 sm:size-80"
          />
          <div className="relative mx-auto max-w-3xl">
            <p className="text-sm font-semibold tracking-wide text-white/70 uppercase">
              Core Competency
            </p>
            <h1 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight">
              {competency.title}
            </h1>
            <p className="mt-5 max-w-xl text-white/85">{competency.longDescription}</p>
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
