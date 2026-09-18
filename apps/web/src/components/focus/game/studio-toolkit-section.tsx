import { RevealSection } from "@/components/about/reveal-section";
import { STUDIO_ROLES } from "@/data/game-focus";

const ROLE_ACCENTS = ["green", "blue", "red", "yellow"] as const;
const ACCENT_VAR: Record<(typeof ROLE_ACCENTS)[number], string> = {
  green: "var(--brand-green)",
  blue: "var(--brand-blue)",
  red: "var(--brand-red)",
  yellow: "var(--brand-yellow)",
};

export function StudioToolkitSection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] bg-[var(--surface-muted)] px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.08}
    >
      <div className="mx-auto max-w-6xl">
        <p className="reveal-item font-mono text-xs font-semibold tracking-[0.14em] text-brand-green uppercase opacity-0">
          The studio
        </p>
        <h2 className="reveal-item mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground opacity-0 sm:text-4xl">
          Every discipline gets a real setup, not a shared PC.
        </h2>
        <p className="reveal-item mt-4 max-w-xl text-foreground/65 opacity-0">
          Same PM tooling as every other division — Jira, Figma, Notion, AI planning agents — on top
          of a kit built specifically for making games and new-media work.
        </p>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {STUDIO_ROLES.map((role, i) => {
            const accent = ACCENT_VAR[ROLE_ACCENTS[i % ROLE_ACCENTS.length]!];
            return (
              <div
                key={role.role}
                className="reveal-item rounded-lg border border-[var(--line)] bg-background p-6 opacity-0"
              >
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
                  {role.role}
                </h3>
                <p className="mt-1.5 text-sm text-foreground/60">{role.tagline}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {role.tools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-foreground/75"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </RevealSection>
  );
}
