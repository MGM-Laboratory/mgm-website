import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { STORY_FINALE } from "@/data/story";
import { cn } from "@/lib/utils";

/**
 * "Let's work together.": the story's last words and its one action. The
 * WebGL story keeps it at the end of the section, where the character is
 * glued to it; the storybook ends on it too.
 */
export function FinaleBlock({
  headingId,
  className,
  children,
}: Readonly<{ headingId: string; className?: string; children?: ReactNode }>) {
  return (
    <div className={cn("story-finale", className)}>
      {children}
      <h2
        id={headingId}
        className="font-display text-[clamp(2.6rem,7.4vw,6.75rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-foreground"
      >
        {STORY_FINALE.title}
      </h2>
      <p className="mt-5 max-w-md text-base leading-relaxed text-foreground/70 sm:text-lg">
        {STORY_FINALE.line}
      </p>
      <Link
        href={STORY_FINALE.action.href}
        className="story-finale-action mt-9 inline-flex items-center gap-2 rounded-full bg-brand-blue px-7 py-3.5 text-base font-medium text-white transition-colors duration-300 hover:bg-[color-mix(in_srgb,var(--brand-blue)_84%,black)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]"
      >
        {STORY_FINALE.action.label}
        <ArrowUpRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
