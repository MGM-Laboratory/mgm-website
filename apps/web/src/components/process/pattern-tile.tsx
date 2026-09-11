import { cn } from "@/lib/utils";

/**
 * Inline renderers for the geometric motifs in /public/patterns/*.svg.
 * Every original file is a 100x100 tile with one part painted `white` and
 * the other a brand color — we reproduce the exact same paths here so that
 * `white` can be swapped for `var(--pattern-canvas)`, which tracks light/
 * dark mode instead of always rendering as a literal white square.
 */

export type PatternKind =
  "fans" | "square" | "arcs" | "circle" | "leaves" | "plus" | "clover" | "domes" | "quads" | "x";

export type PatternTone = "red" | "yellow" | "blue" | "green" | "canvas" | "white";

const TONE_VAR: Record<PatternTone, string> = {
  red: "var(--brand-red)",
  yellow: "var(--brand-yellow)",
  blue: "var(--brand-blue)",
  green: "var(--brand-green)",
  // Tracks light/dark mode — for tiles sitting on a surface that itself
  // flips with the theme (the "We./Research./…" section).
  canvas: "var(--pattern-canvas)",
  // Literal white — for tiles on a surface that stays dark regardless of
  // site theme (the footer's --surface-inverse), where "white" always means
  // white for contrast, not "whatever the page background is right now".
  white: "#ffffff",
};

export function toneColor(tone: PatternTone): string {
  return TONE_VAR[tone];
}

function PatternShape({ kind, fg }: { kind: PatternKind; fg: string }) {
  switch (kind) {
    case "fans":
      return (
        <path
          d="M50 0A50 50 0 0 0 100 50A50 50 0 0 0 50 100A50 50 0 0 0 0 50A50 50 0 0 0 50 0Z"
          fill={fg}
        />
      );
    case "square":
      return <rect x="10" y="10" width="80" height="80" fill="none" stroke={fg} strokeWidth="20" />;
    case "arcs":
      return (
        <>
          <path d="M0 0H2C29.6142 0 52 22.3858 52 50V52H50C22.3858 52 0 29.6142 0 2V0Z" fill={fg} />
          <path
            d="M0 100H2C29.6142 100 52 77.6142 52 50V48H50C22.3858 48 0 70.3858 0 98V100Z"
            fill={fg}
          />
          <path
            d="M100 0H98C70.3858 0 48 22.3858 48 50V52H50C77.6142 52 100 29.6142 100 2V0Z"
            fill={fg}
          />
          <path
            d="M100 100H98C70.3858 100 48 77.6142 48 50V48H50C77.6142 48 100 70.3858 100 98V100Z"
            fill={fg}
          />
        </>
      );
    case "circle":
      return <circle cx="50" cy="50" r="40" fill="none" stroke={fg} strokeWidth="20" />;
    case "leaves":
      return (
        <>
          <path d="M0 0C27.6142 0 50 22.3858 50 50C22.3858 50 0 27.6142 0 0Z" fill={fg} />
          <path d="M0 100C27.6142 100 50 77.6142 50 50C22.3858 50 0 72.3858 0 100Z" fill={fg} />
          <path d="M50 0C77.6142 0 100 22.3858 100 50C72.3858 50 50 27.6142 50 0Z" fill={fg} />
          <path
            d="M50 100C77.6142 100 100 77.6142 100 50C72.3858 50 50 72.3858 50 100Z"
            fill={fg}
          />
        </>
      );
    case "plus":
      return (
        <>
          <path d="M50 0V100" stroke={fg} strokeWidth="20" />
          <path d="M100 50H0" stroke={fg} strokeWidth="20" />
        </>
      );
    case "clover":
      return (
        <>
          <path
            d="M50 50H25C11.1929 50 0 38.8071 0 25C0 11.1929 11.1929 0 25 0C38.8071 0 50 11.1929 50 25V50Z"
            fill={fg}
          />
          <path
            d="M50 50V25C50 11.1929 61.1929 0 75 0C88.8071 0 100 11.1929 100 25C100 38.8071 88.8071 50 75 50H50Z"
            fill={fg}
          />
          <path
            d="M50 50H25C11.1929 50 0 61.1929 0 75C0 88.8071 11.1929 100 25 100C38.8071 100 50 88.8071 50 75V50Z"
            fill={fg}
          />
          <path
            d="M50 50V75C50 88.8071 61.1929 100 75 100C88.8071 100 100 88.8071 100 75C100 61.1929 88.8071 50 75 50H50Z"
            fill={fg}
          />
        </>
      );
    case "domes":
      return (
        <>
          <path d="M100 0C100 27.6142 77.6142 50 50 50C22.3858 50 0 27.6142 0 0Z" fill={fg} />
          <path d="M100 100C100 72.3858 77.6142 50 50 50C22.3858 50 0 72.3858 0 100Z" fill={fg} />
        </>
      );
    case "quads":
      return (
        <>
          <path
            d="M0 0H25C38.8071 0 50 11.1929 50 25C50 38.8071 38.8071 50 25 50C11.1929 50 0 38.8071 0 25V0Z"
            fill={fg}
          />
          <path
            d="M100 0V25C100 38.8071 88.8071 50 75 50C61.1929 50 50 38.8071 50 25C50 11.1929 61.1929 0 75 0H100Z"
            fill={fg}
          />
          <path
            d="M0 100H25C38.8071 100 50 88.8071 50 75C50 61.1929 38.8071 50 25 50C11.1929 50 0 61.1929 0 75V100Z"
            fill={fg}
          />
          <path
            d="M100 100V75C100 61.1929 88.8071 50 75 50C61.1929 50 50 61.1929 50 75C50 88.8071 61.1929 100 75 100H100Z"
            fill={fg}
          />
        </>
      );
    case "x":
      return <path d="M0 100L100 0M100 100L0 0" stroke={fg} strokeWidth="20" />;
  }
}

export function PatternTile({
  kind,
  bg,
  fg,
  className,
}: {
  kind: PatternKind;
  bg: PatternTone;
  fg: PatternTone;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" className={cn("overflow-hidden", className)} aria-hidden>
      <rect width="100" height="100" fill={TONE_VAR[bg]} />
      <PatternShape kind={kind} fg={TONE_VAR[fg]} />
    </svg>
  );
}
