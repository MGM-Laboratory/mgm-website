import { RevealSection } from "@/components/about/reveal-section";
import { DEVICE_STATS } from "@/data/mobile-focus";

export function DeviceStatsSection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] bg-background px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.08}
    >
      <div id="devices" className="mx-auto max-w-6xl scroll-mt-24">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-brand-red uppercase">
          Every device, for real
        </p>
        <h2 className="reveal-item opacity-0 mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          If it fits in a pocket, we&apos;ve probably got one on the shelf.
        </h2>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {DEVICE_STATS.map((stat) => (
            <div
              key={stat.label}
              className="reveal-item opacity-0 rounded-lg border border-[var(--line)] p-6"
            >
              <p className="font-display text-4xl font-semibold tracking-tight text-brand-red sm:text-5xl">
                {stat.value}
              </p>
              <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
                {stat.label}
              </h3>
              <p className="mt-2 text-sm text-foreground/65">{stat.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
