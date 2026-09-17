import { RevealSection } from "./reveal-section";

export function AboutHero() {
  return (
    <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col justify-center px-6 py-24 sm:px-10 sm:py-32 lg:px-16">
      <noscript>
        <style>{".reveal-item{opacity:1 !important}"}</style>
      </noscript>

      <RevealSection className="relative z-10 mx-auto max-w-3xl" stagger={0.14}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-red uppercase opacity-0">
          About us
        </p>
        <h1 className="reveal-item mt-4 font-display text-[clamp(2.75rem,7vw,4.75rem)] leading-[0.98] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          Media. Game. Mobile.
        </h1>
        <p className="reveal-item mt-6 max-w-xl text-[1.125rem] text-[var(--ink-2)] opacity-0 dark:text-white/70">
          We&apos;re a small lab at FILKOM, Universitas Brawijaya. We build games, apps, and
          websites, and we still get excited every time someone actually uses one.
        </p>
      </RevealSection>
    </section>
  );
}
