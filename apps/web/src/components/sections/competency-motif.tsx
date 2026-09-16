import { cn } from "@/lib/utils";
import type { CompetencyMotif } from "@/data/competencies";

export function CompetencyMotifShape({
  motif,
  className,
  stroke = "var(--pattern-canvas)",
}: {
  motif: CompetencyMotif;
  className?: string;
  stroke?: string;
}) {
  switch (motif) {
    case "ring":
      return (
        <svg viewBox="0 0 100 100" className={cn("absolute", className)} aria-hidden>
          <circle cx="50" cy="50" r="34" fill="none" stroke={stroke} strokeWidth="16" />
        </svg>
      );
    case "bracket":
      return (
        <svg viewBox="0 0 100 100" className={cn("absolute", className)} aria-hidden>
          <path d="M20 20V80H80V60H45V20Z" fill={stroke} />
        </svg>
      );
    case "cross":
      return (
        <svg viewBox="0 0 100 100" className={cn("absolute", className)} aria-hidden>
          <path
            d="M20 20L80 80M80 20L20 80"
            stroke={stroke}
            strokeWidth="16"
            strokeLinecap="round"
          />
        </svg>
      );
    case "chevron":
      return (
        <svg viewBox="0 0 100 100" className={cn("absolute", className)} aria-hidden>
          <path d="M20 85L60 20H80L40 85Z" fill={stroke} />
        </svg>
      );
  }
}

// The card's own reference design, at its native 279x472 size, with each
// shape drawn oversized and left to spill past the card's edges — the
// card's own rounded corners (via its `overflow-hidden`) are what clip it
// into its final silhouette, exactly like the source file. Coordinates are
// copied verbatim from the design (each shape's points, shifted to be
// relative to its own card's top-left corner) rather than redrawn, so the
// clipped shape lines up pixel-for-pixel with the reference at any size —
// the viewBox scales, the shape doesn't move within it.
export function CompetencyCardShape({
  motif,
  className,
}: {
  motif: CompetencyMotif;
  className?: string;
}) {
  switch (motif) {
    case "ring":
      return (
        <svg viewBox="0 0 279 472" className={cn("overflow-visible", className)} aria-hidden>
          <circle cx="230" cy="364" r="123" fill="none" stroke="white" strokeWidth="54" />
        </svg>
      );
    case "bracket":
      return (
        <svg viewBox="0 0 279 472" className={cn("overflow-visible", className)} aria-hidden>
          <rect
            x="102"
            y="250"
            width="246"
            height="246"
            fill="none"
            stroke="white"
            strokeWidth="54"
          />
        </svg>
      );
    case "cross":
      return (
        <svg viewBox="0 0 279 472" className={cn("overflow-visible", className)} aria-hidden>
          <path
            d="M375 223L345.25 223.96L225 344.21L104.75 223.96L75 223L75.963 252.75L196.214 373L75.963 493.25L75 523L104.75 522.04L225 401.79L345.25 522.04L375 523L374.04 493.25L253.787 373L374.04 252.75L375 223Z"
            fill="white"
          />
        </svg>
      );
    case "chevron":
      return (
        <svg viewBox="0 0 279 472" className={cn("overflow-visible", className)} aria-hidden>
          <path d="M341 511H116V286L341 511Z" fill="none" stroke="white" strokeWidth="54" />
        </svg>
      );
  }
}
