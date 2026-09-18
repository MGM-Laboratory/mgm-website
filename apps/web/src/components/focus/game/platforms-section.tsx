import { RevealSection } from "@/components/about/reveal-section";
import { CompetencyMotifShape } from "@/components/sections/competency-motif";
import { PLATFORM_ITEMS, XR_STATS } from "@/data/game-focus";

export function PlatformsSection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] bg-background px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.08}
    >
      <div id="platforms" className="mx-auto max-w-6xl scroll-mt-24">
        <p className="reveal-item font-mono text-xs font-semibold tracking-[0.14em] text-brand-green uppercase opacity-0">
          Every platform, every reality
        </p>
        <h2 className="reveal-item mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground opacity-0 sm:text-4xl">
          If it has a screen or a headset, we&apos;ve built for it.
        </h2>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {XR_STATS.map((stat) => (
            <div key={stat.label} className="reveal-item opacity-0">
              <p className="font-display text-4xl font-semibold tracking-tight text-brand-green">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-foreground/60">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_ITEMS.map((item) => (
            <div
              key={item.label}
              className="reveal-item relative overflow-hidden rounded-lg border border-[var(--line)] p-5 opacity-0"
            >
              <CompetencyMotifShape
                motif="chevron"
                stroke="var(--brand-green)"
                className="-top-4 -right-4 size-16 opacity-[0.12]"
              />
              <h3 className="relative font-display text-base font-semibold text-foreground">
                {item.label}
              </h3>
              <p className="relative mt-1.5 text-sm text-foreground/60">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
