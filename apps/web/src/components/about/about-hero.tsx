import { RevealSection } from "./reveal-section";
import { AboutLanyard } from "./lanyard/about-lanyard";

export function AboutHero() {
  return (
    <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col justify-center px-6 py-24 sm:px-10 sm:py-32 lg:px-16">
      <noscript>
        <style>{".reveal-item{opacity:1 !important}"}</style>
      </noscript>

      <RevealSection className="relative z-10 mx-auto max-w-3xl lg:mr-auto lg:ml-16" stagger={0.14}>
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

      {/* Interactive 3D lanyard — desktop only (a WASM physics stack isn't
          worth the weight or the drag-interaction cost on a touch/mobile
          viewport that has no room for it beside the text anyway). Confined
          to the hero's own box (unlike the homepage's version of this
          component): this section sits inside page.tsx's `relative z-10`
          wrapper, which both caps any z-index inside it below the fixed
          header's z-50 and clips anything above its own top edge via
          `overflow-hidden` on its parent — so reaching up behind the header
          the way the homepage did isn't possible here regardless of
          z-index. AboutLanyard's own drag-time z-index bump still runs, just
          scoped to rising above this page's own content instead. */}
      <div className="absolute inset-y-10 right-0 hidden w-[38%] lg:block">
        <AboutLanyard
          className="h-full w-full"
          position={[0, 0, 20]}
          gravity={[0, -40, 0]}
          frontImage="/lanyard/front.png"
          backImage="/lanyard/back.png"
          lanyardImage="/lanyard/tali.png"
        />
      </div>
    </section>
  );
}
