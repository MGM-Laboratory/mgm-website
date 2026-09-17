import { Lock } from "lucide-react";

import { CLOSING_NOTE, OPEN_QUESTIONS } from "@/data/about-content";
import { LOCKED_SOURCES } from "@/data/about-sources";
import { SourceMarks, TierChip } from "./cite";
import { RevealSection } from "./reveal-section";

export function OpenQuestionsSection() {
  return (
    <section id="open-questions" className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <RevealSection className="mx-auto max-w-3xl" stagger={0.04}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-red uppercase opacity-0">
          Open questions
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          What the public record doesn&apos;t answer
        </h2>
        <p className="reveal-item mt-5 max-w-xl text-[var(--ink-2)] opacity-0 dark:text-white/65">
          A responsible profile names its gaps instead of writing around them. These are the ones
          that came up most often while building this page.
        </p>

        <dl className="mt-10 flex flex-col gap-6">
          {OPEN_QUESTIONS.map((q) => (
            <div key={q.question} className="reveal-item opacity-0">
              <dt className="font-semibold text-[var(--ink)] dark:text-white">{q.question}</dt>
              <dd className="mt-1.5 text-sm text-[var(--ink-2)] dark:text-white/60">
                {q.answer}
                <SourceMarks ids={q.sourceIds} />
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-14">
          <div className="reveal-item flex items-baseline justify-between gap-2 opacity-0">
            <h3 className="font-display text-lg font-semibold text-[var(--ink)] dark:text-white">
              Sealed records
            </h3>
            <TierChip tier={CLOSING_NOTE.tier} />
          </div>
          <p className="reveal-item mt-2 max-w-xl text-sm text-[var(--ink-3)] opacity-0 dark:text-white/45">
            These nine FILKOM subpages were password-protected at review — rendered here as what
            they are: real, addressable, and currently out of reach, not omitted.
          </p>

          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {LOCKED_SOURCES.map((source) => (
              <li
                key={source.id}
                className="reveal-item flex min-w-0 flex-col gap-2 rounded-xl border border-dashed border-[var(--line-strong)] p-4 opacity-0 dark:border-white/20"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[var(--ink-4)]">
                    {source.id}
                  </span>
                  <Lock className="size-3.5 text-[var(--ink-4)]" strokeWidth={2.25} aria-hidden />
                </div>
                <p className="text-sm text-[var(--ink-2)] dark:text-white/70">{source.title}</p>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-mono text-xs text-[var(--ink-4)] hover:text-brand-blue"
                >
                  {source.url}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <p
          data-tier={CLOSING_NOTE.tier}
          className="reveal-item mt-10 max-w-xl border-t border-[var(--line)] pt-6 text-sm text-[var(--ink-3)] opacity-0 dark:border-white/10 dark:text-white/45"
        >
          {CLOSING_NOTE.text}
          <SourceMarks ids={CLOSING_NOTE.sourceIds} />
        </p>
      </RevealSection>
    </section>
  );
}
