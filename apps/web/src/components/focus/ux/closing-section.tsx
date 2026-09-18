import { RevealSection } from "@/components/about/reveal-section";

// Ties back to the hero's heatmap — the trick was never just a hero
// decoration, it's a literal demonstration of the page's whole pitch.
export function ClosingSection() {
  return (
    <RevealSection className="border-t border-[var(--line)] bg-background px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-foreground/60 uppercase">
          By the way
        </p>
        <h2 className="reveal-item opacity-0 mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          We were watching you read this.
        </h2>
        <p className="reveal-item opacity-0 mx-auto mt-4 max-w-xl text-foreground/65">
          That heatmap up top wasn&apos;t a mockup — it was tracking your actual cursor, the same
          way we track a real session. That&apos;s the whole pitch: we design from what people do,
          not what we assume they&apos;ll do.
        </p>
      </div>
    </RevealSection>
  );
}
