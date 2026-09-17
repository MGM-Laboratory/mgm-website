import { RESEARCH_CUTOFF } from "@/data/about-content";
import { BauhausField } from "./bauhaus-field";
import { RevealSection } from "./reveal-section";

export function AboutHero() {
  return (
    <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col justify-center overflow-hidden bg-[var(--surface-inverse)] px-6 py-24 sm:px-10 sm:py-32 lg:px-16">
      <BauhausField />

      <noscript>
        <style>{".reveal-item{opacity:1 !important}"}</style>
      </noscript>

      <RevealSection className="relative z-10 mx-auto max-w-3xl" stagger={0.14}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-red uppercase opacity-0">
          About Us — an evidence ledger
        </p>
        <h1 className="reveal-item mt-4 font-display text-[clamp(2.75rem,7vw,4.75rem)] leading-[0.98] font-semibold tracking-tight text-white opacity-0">
          Media. Game. Mobile.
        </h1>
        <p className="reveal-item mt-6 max-w-xl text-[1.125rem] text-white/70 opacity-0">
          MGM Laboratory works inside FILKOM, Universitas Brawijaya. Instead of a mission statement,
          this page reads like the public record actually supports it — every claim footnoted, its
          confidence tier shown, including where sources contradict each other or the record simply
          runs out.
        </p>
        <p className="reveal-item mt-4 text-sm text-white/45 opacity-0">
          Evidence reviewed {RESEARCH_CUTOFF}. Look for the Evidence Lens fixed at the bottom of the
          screen — it filters every claim on this page by how sure the record actually is.
        </p>
      </RevealSection>
    </section>
  );
}
