import { RevealSection } from "@/components/about/reveal-section";
import { PROOF_STACK } from "@/data/website-focus";
import { BrowserChrome } from "./browser-chrome";

// The one piece of "showcase" content this page doesn't have to invent —
// the page rendering it is itself the output of the exact team and pipeline
// described above.
export function ProofSection() {
  return (
    <RevealSection className="border-t border-[var(--line)] bg-background px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-brand-blue uppercase">
          Built here
        </p>
        <h2 className="reveal-item opacity-0 mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          This page? Proof, not a pitch.
        </h2>
        <p className="reveal-item opacity-0 mx-auto mt-4 max-w-xl text-foreground/65">
          The site you&apos;re looking at right now was built, reviewed, and shipped by this exact
          team, through this exact pipeline.
        </p>

        <div className="reveal-item mx-auto mt-10 max-w-md text-left opacity-0">
          <BrowserChrome accent="var(--brand-blue)" />
          <div className="flex items-center gap-2 rounded-b-lg border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 font-mono text-xs text-foreground/70">
            <span className="text-brand-green">$</span>
            <span>git push origin main</span>
          </div>
        </div>

        <div className="reveal-item mt-8 flex flex-wrap items-center justify-center gap-2 opacity-0">
          {PROOF_STACK.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-foreground/70"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
