import { CtaFooter } from "@/components/sections/cta-footer";
import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";

const BAND_BG: Record<Exclude<PatternTone, "canvas" | "white">, string> = {
  blue: "bg-brand-blue",
  red: "bg-brand-red",
  yellow: "bg-brand-yellow",
  green: "bg-brand-green",
};

// A single generic hero band shared by every stand-alone nav page (About,
// Member, Careers, Events, Focus/Our Work pages that aren't a Core
// Competency) — same visual language as CompetencyPageContent's band,
// without needing a `Competency` record for pages that don't have one.
export function PageBand({
  eyebrow,
  title,
  description,
  tone,
  motif,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tone: keyof typeof BAND_BG;
  motif: PatternKind;
}) {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <section
          className={`relative overflow-hidden px-6 py-20 text-white sm:px-10 sm:py-28 lg:px-16 ${BAND_BG[tone]}`}
        >
          <FlairShape
            kind={motif}
            tone="white"
            className="pointer-events-none absolute -top-10 -right-10 size-64 opacity-20 sm:size-80"
          />
          <div className="relative mx-auto max-w-3xl">
            <p className="text-sm font-semibold tracking-wide text-white/70 uppercase">{eyebrow}</p>
            <h1 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight">
              {title}
            </h1>
            <p className="mt-5 max-w-xl text-white/85">{description}</p>
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
