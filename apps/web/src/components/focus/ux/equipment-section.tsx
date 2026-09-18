import { RevealSection } from "@/components/about/reveal-section";
import { CompetencyMotifShape } from "@/components/sections/competency-motif";
import { EQUIPMENT } from "@/data/ux-focus";

export function EquipmentSection() {
  return (
    <RevealSection
      className="relative overflow-hidden border-t border-[var(--line)] bg-[var(--surface-muted)] px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.06}
    >
      <CompetencyMotifShape
        motif="cross"
        stroke="var(--brand-yellow)"
        className="pointer-events-none -top-8 -right-8 size-56 opacity-15 sm:size-72"
      />
      <div className="relative mx-auto max-w-6xl">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-foreground/60 uppercase">
          The observation room
        </p>
        <h2 className="reveal-item opacity-0 mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          The gear behind &quot;we noticed.&quot;
        </h2>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {EQUIPMENT.map((item) => (
            <div
              key={item.label}
              className="reveal-item opacity-0 rounded-lg border border-[var(--line)] bg-background p-5"
            >
              <h3 className="font-display text-base font-semibold text-foreground">{item.label}</h3>
              <p className="mt-2 text-sm text-foreground/60">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
