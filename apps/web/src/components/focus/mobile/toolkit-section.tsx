import { RevealSection } from "@/components/about/reveal-section";
import { TOOLKIT_ROLES } from "@/data/mobile-focus";

const ROLE_ACCENTS = ["red", "yellow", "blue"] as const;
const ACCENT_VAR: Record<(typeof ROLE_ACCENTS)[number], string> = {
  red: "var(--brand-red)",
  yellow: "var(--brand-yellow)",
  blue: "var(--brand-blue)",
};

export function ToolkitSection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] bg-[var(--surface-muted)] px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.08}
    >
      <div className="mx-auto max-w-6xl">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-brand-red uppercase">
          The desk
        </p>
        <h2 className="reveal-item opacity-0 mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Every role gets the tools it actually needs.
        </h2>
        <p className="reveal-item opacity-0 mt-4 max-w-xl text-foreground/65">
          Same discipline as our web team — a real toolkit per role, not one shared login sheet
          nobody&apos;s updated since the app was approved.
        </p>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {TOOLKIT_ROLES.map((role, i) => {
            const accent = ACCENT_VAR[ROLE_ACCENTS[i % ROLE_ACCENTS.length]!];
            return (
              <div
                key={role.role}
                className="reveal-item opacity-0 rounded-lg border border-[var(--line)] bg-background p-6"
              >
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
                  {role.role}
                </h3>
                <p className="mt-1.5 text-sm text-foreground/60">{role.tagline}</p>
                <p className="mt-4 text-sm text-foreground/70">{role.story}</p>
              </div>
            );
          })}
        </div>
      </div>
    </RevealSection>
  );
}
