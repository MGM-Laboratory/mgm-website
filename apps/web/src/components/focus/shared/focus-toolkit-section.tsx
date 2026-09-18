import { RevealSection } from "@/components/about/reveal-section";

export type ToolkitRole = { role: string; tagline: string; story: string };

// The per-discipline "how this team actually works" section every Focus
// page has — a role's story is told as a short paragraph, not a tool-name
// chip list, so it reads like part of the page's narrative rather than a
// spec sheet.
export function FocusToolkitSection({
  eyebrow,
  eyebrowClassName = "text-brand-blue",
  headline,
  body,
  roles,
  accentVars,
  columnsClassName = "lg:grid-cols-3",
}: {
  eyebrow: string;
  eyebrowClassName?: string;
  headline: string;
  body: string;
  roles: ToolkitRole[];
  accentVars: string[];
  columnsClassName?: string;
}) {
  return (
    <RevealSection
      className="border-t border-[var(--line)] bg-[var(--surface-muted)] px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.08}
    >
      <div className="mx-auto max-w-6xl">
        <p
          className={`reveal-item font-mono text-xs font-semibold tracking-[0.14em] uppercase opacity-0 ${eyebrowClassName}`}
        >
          {eyebrow}
        </p>
        <h2 className="reveal-item opacity-0 mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {headline}
        </h2>
        <p className="reveal-item opacity-0 mt-4 max-w-xl text-foreground/65">{body}</p>

        <div className={`mt-14 grid gap-6 ${columnsClassName}`}>
          {roles.map((role, i) => (
            <div
              key={role.role}
              className="reveal-item opacity-0 rounded-lg border border-[var(--line)] bg-background p-6"
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: accentVars[i % accentVars.length] }}
              />
              <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
                {role.role}
              </h3>
              <p className="mt-1.5 text-sm text-foreground/60">{role.tagline}</p>
              <p className="mt-4 text-sm text-foreground/70">{role.story}</p>
            </div>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
