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
