import type { ReactNode } from "react";

import { RevealSection } from "@/components/about/reveal-section";

// The centered hero every Focus page shares (matches /about's AboutHero
// exactly) — only the copy and eyebrow color differ per page.
export function FocusHero({
  eyebrow,
  eyebrowClassName = "text-brand-blue",
  headline,
  body,
}: Readonly<{
  eyebrow: string;
  eyebrowClassName?: string;
  headline: ReactNode;
  body: string;
}>) {
  return (
    <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col justify-center px-6 py-24 sm:px-10 sm:py-32 lg:px-16">
      <RevealSection className="relative z-10 mx-auto max-w-3xl" stagger={0.14}>
        <p
          className={`reveal-item font-mono text-xs font-semibold tracking-[0.14em] uppercase opacity-0 ${eyebrowClassName}`}
        >
          {eyebrow}
        </p>
        <h1 className="reveal-item mt-4 font-display text-[clamp(2.75rem,7vw,4.75rem)] leading-[0.98] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          {headline}
        </h1>
        <p className="reveal-item mt-6 max-w-xl text-[1.125rem] text-[var(--ink-2)] opacity-0 dark:text-white/70">
          {body}
        </p>
      </RevealSection>
    </section>
  );
}
