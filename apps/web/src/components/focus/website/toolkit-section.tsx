import { RevealSection } from "@/components/about/reveal-section";
import { TOOLKIT_ROLES } from "@/data/website-focus";

const ROLE_ACCENTS = ["blue", "green", "red"] as const;
const ACCENT_VAR: Record<(typeof ROLE_ACCENTS)[number], string> = {
  blue: "var(--brand-blue)",
  green: "var(--brand-green)",
  red: "var(--brand-red)",
};

export function ToolkitSection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] bg-[var(--surface-muted)] px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.08}
    >
      <div className="mx-auto max-w-6xl">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-brand-blue uppercase">
          The desk
        </p>
        <h2 className="reveal-item opacity-0 mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Every role gets the tools it actually needs.
        </h2>
        <p className="reveal-item opacity-0 mt-4 max-w-xl text-foreground/65">
          Not a shared spreadsheet of logins — a real toolkit per discipline, kept current instead
          of frozen at whatever was approved three years ago.
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
