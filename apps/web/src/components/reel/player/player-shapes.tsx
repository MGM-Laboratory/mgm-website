/**
 * Small brand shapes the reel player scatters and spins: the end burst,
 * the buffering shapes chasing round the playhead, and the plus marks in
 * the letterbox bars. Drawn in a 24 unit box, coloured by brand tokens.
 */

export type BitKind = "circle" | "square" | "triangle" | "plus" | "x" | "half" | "leaf" | "star";

export const TONES = [
  "var(--brand-yellow)",
  "var(--brand-blue)",
  "var(--brand-red)",
  "var(--brand-green)",
] as const;

export function Bit({
  kind,
  color,
  className,
}: {
  kind: BitKind;
  color: string;
  className?: string;
}) {
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 24 24">
      {kind === "circle" ? <circle cx="12" cy="12" r="10" fill={color} /> : null}
      {kind === "square" ? <rect x="3" y="3" width="18" height="18" fill={color} /> : null}
      {kind === "triangle" ? <polygon points="3,3 3,21 21,21" fill={color} /> : null}
      {kind === "plus" ? (
        <path d="M12 4V20M4 12H20" stroke={color} strokeLinecap="round" strokeWidth="5" />
      ) : null}
      {kind === "x" ? (
        <path d="M6 6L18 18M18 6L6 18" stroke={color} strokeLinecap="round" strokeWidth="5" />
      ) : null}
      {kind === "half" ? <path d="M2 17A10 10 0 0 1 22 17Z" fill={color} /> : null}
      {kind === "leaf" ? <path d="M3 3C13 3 21 11 21 21C11 21 3 13 3 3Z" fill={color} /> : null}
      {kind === "star" ? (
        <path
          d="M12 2A10 10 0 0 0 22 12A10 10 0 0 0 12 22A10 10 0 0 0 2 12A10 10 0 0 0 12 2Z"
          fill={color}
        />
      ) : null}
    </svg>
  );
}

/** The burst's shapes, in a fixed order so the server and client agree. */
export const BURST: { kind: BitKind; color: string; size: number }[] = [
  { kind: "circle", color: TONES[0], size: 18 },
  { kind: "triangle", color: TONES[1], size: 20 },
  { kind: "plus", color: TONES[2], size: 18 },
  { kind: "square", color: TONES[3], size: 14 },
  { kind: "half", color: TONES[0], size: 22 },
  { kind: "x", color: TONES[1], size: 16 },
  { kind: "leaf", color: TONES[2], size: 18 },
  { kind: "star", color: TONES[0], size: 22 },
  { kind: "circle", color: TONES[2], size: 12 },
  { kind: "triangle", color: TONES[3], size: 16 },
  { kind: "plus", color: TONES[0], size: 14 },
  { kind: "square", color: TONES[1], size: 12 },
  { kind: "half", color: TONES[3], size: 16 },
  { kind: "leaf", color: TONES[1], size: 14 },
  { kind: "x", color: TONES[3], size: 12 },
  { kind: "circle", color: TONES[1], size: 10 },
  { kind: "star", color: TONES[2], size: 16 },
  { kind: "square", color: TONES[0], size: 10 },
];
