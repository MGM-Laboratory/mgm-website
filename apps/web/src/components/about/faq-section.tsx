import { FAQS } from "@/data/about-content";
import { RevealSection } from "./reveal-section";

export function FaqSection() {
  return (
    <section className="bg-[var(--surface-muted)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <RevealSection className="mx-auto max-w-2xl" stagger={0.06}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-blue uppercase opacity-0">
          Questions
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          Things people usually ask
        </h2>

        <div className="mt-10 flex flex-col divide-y divide-[var(--line)] dark:divide-white/10">
          {FAQS.map((faq) => (
            <details key={faq.question} className="reveal-item group py-5 opacity-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-[var(--ink)] marker:content-none dark:text-white">
                {faq.question}
                <span
                  aria-hidden
                  className="shrink-0 text-xl leading-none text-[var(--ink-3)] transition-transform group-open:rotate-45 dark:text-white/50"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-[var(--ink-2)] dark:text-white/65">{faq.answer}</p>
            </details>
          ))}
        </div>
      </RevealSection>
    </section>
  );
}
