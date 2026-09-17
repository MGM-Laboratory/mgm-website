"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

import {
  TIER_COLOR,
  TIER_DESCRIPTION,
  TIER_LABEL,
  TIER_TEXT_ON_FILL,
  TIERS,
  type Tier,
} from "./cite";

// A floating filter that dims every claim on the page except the one
// confidence tier currently selected — turning the evidence taxonomy from
// a caption into an interaction. Pure opacity/filter dimming driven by a
// single attribute on <html>, so it works with the CSS in globals.css alone
// and needs no per-component wiring beyond `data-tier` already being there.
export function EvidenceLens() {
  const [active, setActive] = useState<Tier | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (active) root.setAttribute("data-evidence-filter", active);
    else root.removeAttribute("data-evidence-filter");
    return () => root.removeAttribute("data-evidence-filter");
  }, [active]);

  return (
    <div className="evidence-lens fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 sm:bottom-6">
      <div
        role="group"
        aria-label="Evidence Lens — filter this page by confidence tier"
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[var(--line-strong)] bg-[var(--surface)]/95 p-1 shadow-[var(--shadow-3)] backdrop-blur-sm dark:border-white/15 dark:bg-[#15181e]/95"
      >
        <span className="flex shrink-0 items-center gap-1.5 pr-1 pl-2.5 text-xs font-semibold tracking-wide text-[var(--ink-3)] uppercase dark:text-white/50">
          <Eye className="size-3.5" strokeWidth={2.25} aria-hidden />
          Lens
        </span>
        <button
          type="button"
          aria-pressed={active === null}
          onClick={() => setActive(null)}
          className="evidence-lens-btn shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors data-[active=true]:bg-[var(--ink)] data-[active=true]:text-white dark:text-white/70 dark:data-[active=true]:bg-white dark:data-[active=true]:text-[var(--ink)]"
          data-active={active === null}
        >
          All
        </button>
        {TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            aria-pressed={active === tier}
            title={TIER_DESCRIPTION[tier]}
            onClick={() => setActive((cur) => (cur === tier ? null : tier))}
            style={{
              ["--tier-color" as string]: TIER_COLOR[tier],
              ["--tier-text" as string]: TIER_TEXT_ON_FILL[tier],
            }}
            className="evidence-lens-btn flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-[var(--ink-2)] transition-colors data-[active=true]:bg-[var(--tier-color)] data-[active=true]:text-[var(--tier-text)] dark:text-white/70"
            data-active={active === tier}
          >
            <span
              className="evidence-lens-dot size-1.5 rounded-full"
              style={{ background: "var(--tier-color)" }}
            />
            {TIER_LABEL[tier]}
          </button>
        ))}
      </div>
    </div>
  );
}
