"use client";

import { useState } from "react";

import { ArticleBody } from "@/components/articles/article-body";
import type { ArticleBlock } from "@/lib/article-cms";

/**
 * Shows the description clamped with a gradient fade so the Apply button
 * below stays in view without reading the whole text. The full document is
 * always in the DOM — this is purely a visual gate.
 */
export function CareerDescriptionPreview({ blocks }: { blocks: ArticleBlock[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className={`relative overflow-hidden ${expanded ? "" : "max-h-[340px]"}`}>
        <ArticleBody blocks={blocks} />
        {!expanded ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#fcfcfc] to-transparent dark:from-[#0e1116]"
          />
        ) : null}
      </div>
      <button
        aria-expanded={expanded}
        className="mt-2 inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-5 text-sm font-semibold text-[var(--ink-2)] transition hover:border-brand-blue hover:text-brand-blue dark:text-[#c3c7d1]"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {expanded ? "Show less" : "Read more"}
        <span
          aria-hidden="true"
          className="text-[10px] leading-none transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : undefined }}
        >
          ▼
        </span>
      </button>
    </div>
  );
}
