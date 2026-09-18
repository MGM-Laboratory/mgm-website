import { RevealSection } from "@/components/about/reveal-section";
import { BUILD_KINDS } from "@/data/website-focus";
import { BrowserChrome } from "./browser-chrome";

const ACCENTS = [
  "var(--brand-blue)",
  "var(--brand-red)",
  "var(--brand-yellow)",
  "var(--brand-green)",
];

export function BuildTypesSection() {
  return (
    <RevealSection
      className="border-t border-[var(--line)] bg-background px-6 py-24 sm:px-10 lg:px-16"
      stagger={0.08}
    >
      <div id="build" className="mx-auto max-w-6xl scroll-mt-24">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-brand-blue uppercase">
          What we build
        </p>
        <h2 className="reveal-item opacity-0 mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Whatever runs in a browser, we&apos;ve shipped one.
        </h2>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BUILD_KINDS.map((kind, i) => {
            const accent = ACCENTS[i % ACCENTS.length]!;
            return (
              <div key={kind.label} className="reveal-item opacity-0 flex flex-col">
                <BrowserChrome accent={accent} />
                <div className="flex flex-1 flex-col rounded-b-lg border border-[var(--line)] p-5">
                  <p
                    className="text-xs font-semibold tracking-wide uppercase"
                    style={{ color: accent }}
                  >
                    {kind.kicker}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-semibold text-foreground">
                    {kind.label}
                  </h3>
                  <p className="mt-3 text-sm text-foreground/65">{kind.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </RevealSection>
  );
}
