import { RevealSection } from "@/components/about/reveal-section";

export function ClosingSection() {
  return (
    <RevealSection className="border-t border-[var(--line)] bg-background px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="reveal-item opacity-0 font-mono text-xs font-semibold tracking-[0.14em] text-foreground/60 uppercase">
          The whole pitch
        </p>
        <h2 className="reveal-item opacity-0 mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          We design from what people do, not what we assume they&apos;ll do.
        </h2>
        <p className="reveal-item opacity-0 mx-auto mt-4 max-w-xl text-foreground/65">
          Every screen we ship has already been watched, timed, and argued about in a review —
          before it ever reaches someone who wasn&apos;t in the room when we designed it.
        </p>
      </div>
    </RevealSection>
  );
}
