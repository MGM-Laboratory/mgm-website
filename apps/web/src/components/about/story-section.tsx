import Image from "next/image";

import { STORY_BEATS } from "@/data/about-content";
import { RevealSection } from "./reveal-section";

export function StorySection() {
  return (
    <section className="relative px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <RevealSection className="mx-auto max-w-3xl" stagger={0.1}>
        <p className="reveal-item text-sm font-semibold tracking-wide text-brand-green uppercase opacity-0">
          Our story
        </p>
        <h2 className="reveal-item mt-3 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-[var(--ink)] opacity-0 dark:text-white">
          How we got here
        </h2>
        <p className="reveal-item mt-5 max-w-xl text-[var(--ink-2)] opacity-0 dark:text-white/65">
          Every lab has an origin story. Here&apos;s ours, the short version.
        </p>

        <div className="mt-14 flex flex-col gap-16 sm:gap-20">
          {STORY_BEATS.map((beat, i) => (
            <div
              key={beat.year}
              className={`reveal-item flex flex-col items-center gap-6 opacity-0 sm:gap-10 ${
                i % 2 === 1 ? "sm:flex-row-reverse" : "sm:flex-row"
              }`}
            >
              <div className="w-full max-w-[220px] shrink-0 sm:max-w-[260px]">
                <div className="overflow-hidden rounded-3xl bg-[var(--surface-muted)]">
                  <Image
                    src={beat.image}
                    alt=""
                    width={520}
                    height={520}
                    className="aspect-square w-full object-cover"
                  />
                </div>
              </div>
              <div>
                <p className="font-mono text-xs font-semibold tracking-wide text-[var(--ink-3)] uppercase dark:text-white/45">
                  {beat.year}
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-[var(--ink)] dark:text-white">
                  {beat.title}
                </h3>
                <p className="mt-2 max-w-md text-[var(--ink-2)] dark:text-white/65">{beat.body}</p>
              </div>
            </div>
          ))}
        </div>
      </RevealSection>
    </section>
  );
}
