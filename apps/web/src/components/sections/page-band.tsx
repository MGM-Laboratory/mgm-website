import { CtaFooter } from "@/components/sections/cta-footer";
import { FlairShape, type PatternKind, type PatternTone } from "@/components/process/pattern-tile";

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
  tone: Exclude<PatternTone, "background" | "canvas" | "white">;
  motif: PatternKind;
}) {
  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden bg-[var(--surface-muted)]">
          <div className="relative mx-auto w-full max-w-[1200px] px-[55px] pt-24 pb-20">
            <FlairShape
              kind={motif}
              tone={tone}
              className="pointer-events-none absolute -top-10 -right-10 size-64 opacity-25 sm:size-80 dark:opacity-35"
            />
            <div className="relative max-w-3xl">
              <p className="text-sm font-semibold tracking-wide text-brand-blue uppercase">
                {eyebrow}
              </p>
              <h1 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-[var(--ink)] dark:text-white">
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-[var(--ink-2)] dark:text-white/65">{description}</p>
            </div>
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
