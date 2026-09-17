import { cn } from "@/lib/utils";
import { SOURCES_BY_ID } from "@/data/about-sources";

// The four confidence tiers from the evidence review, reusing the site's
// closed brand palette as a functional legend rather than adding new color.
// green=stated directly by a named source, blue=true for a documented past
// period, yellow=an explicit interpretation, red=no direct evidence found.
export type Tier = "confirmed" | "historical" | "inference" | "unverified";

export const TIERS: Tier[] = ["confirmed", "historical", "inference", "unverified"];

export const TIER_LABEL: Record<Tier, string> = {
  confirmed: "Confirmed",
  historical: "Historical",
  inference: "Inference",
  unverified: "Unverified",
};

export const TIER_DESCRIPTION: Record<Tier, string> = {
  confirmed: "Stated directly by a named institutional or laboratory source.",
  historical: "Documented as true for the period stated — not necessarily true today.",
  inference: "An explicitly limited interpretation, not a direct statement.",
  unverified: "No sufficiently direct public evidence was found.",
};

export const TIER_COLOR: Record<Tier, string> = {
  confirmed: "var(--brand-green)",
  historical: "var(--brand-blue)",
  inference: "var(--brand-yellow)",
  unverified: "var(--brand-red)",
};

// Per DESIGN_SYSTEM.md §2.3, brand-yellow never carries text on a light
// fill — every tier badge is a solid color fill, so the text color has to
// flip to ink specifically for yellow instead of white like the other three.
export const TIER_TEXT_ON_FILL: Record<Tier, string> = {
  confirmed: "#ffffff",
  historical: "#ffffff",
  inference: "var(--ink)",
  unverified: "#ffffff",
};

/** Just the clickable [S07] marks — used inside an element that already carries `data-tier`. */
export function SourceMarks({ ids, className }: { ids: string[]; className?: string }) {
  return (
    <sup className={cn("cite-marks", className)}>
      {ids.map((id, i) => {
        const source = SOURCES_BY_ID[id];
        return (
          <a
            key={id}
            href={`#src-${id}`}
            className="cite-mark"
            aria-label={source ? `Jump to source ${id}: ${source.title}` : `Jump to source ${id}`}
          >
            {id}
            {i < ids.length - 1 ? "," : ""}
          </a>
        );
      })}
    </sup>
  );
}

/** Inline prose citation — wraps a phrase, tags it with a tier, and appends its source marks. */
export function Cite({
  ids,
  tier,
  children,
}: {
  ids: string[];
  tier: Tier;
  children: React.ReactNode;
}) {
  return (
    <span data-tier={tier} className="cite-inline">
      {children}
      <SourceMarks ids={ids} />
    </span>
  );
}

/** Standalone tier badge — carries its own color so it reads correctly even without a `data-tier` ancestor. */
export function TierChip({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      className={cn("tier-chip", className)}
      style={{
        ["--tier-color" as string]: TIER_COLOR[tier],
        ["--tier-text" as string]: TIER_TEXT_ON_FILL[tier],
      }}
      title={TIER_DESCRIPTION[tier]}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
