import type { ReactNode } from "react";

/**
 * Stand-in art for the storybook panels until the stills rendered from the
 * finished scenes exist (`STILLS_FILES`): small Bauhaus compositions in the
 * brand's shapes, one per moment. Decorative (the caption tells the story).
 */

const INK = "var(--foreground)";
const BLUE = "var(--brand-blue)";
const YELLOW = "var(--brand-yellow)";
const RED = "var(--brand-red)";
const GREEN = "var(--brand-green)";
const NAVY = "#2d318a";

function Star({ x, y, r, fill }: Readonly<{ x: number; y: number; r: number; fill: string }>) {
  const points: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.314;
    points.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`);
  }
  return <polygon points={points.join(" ")} fill={fill} />;
}

/** The little toy: a head, a triangle body, a stand. */
function Figure({
  x,
  y,
  scale = 1,
  flip = false,
  arm = 0,
}: Readonly<{ x: number; y: number; scale?: number; flip?: boolean; arm?: number }>) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) ${flip ? "rotate(180)" : ""}`}>
      <circle cx="0" cy="-34" r="9" fill={YELLOW} />
      <path d="M0 -24 L14 8 L-14 8 Z" fill={RED} />
      <path
        d={`M8 -16 L${18 + arm * 4} ${-30 - arm * 8}`}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M-8 -16 L-18 -4" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
}

export function PanelArt({ id }: Readonly<{ id: string }>) {
  let art: ReactNode;
  switch (id) {
    case "table":
      art = (
        <>
          <circle cx="238" cy="54" r="26" fill={YELLOW} opacity="0.9" />
          <rect x="40" y="128" width="240" height="10" rx="3" fill={INK} opacity="0.8" />
          <rect x="68" y="138" width="8" height="34" fill={INK} opacity="0.8" />
          <rect x="244" y="138" width="8" height="34" fill={INK} opacity="0.8" />
          <rect
            x="136"
            y="72"
            width="40"
            height="56"
            rx="3"
            fill={BLUE}
            transform="rotate(-8 156 100)"
          />
          <path d="M146 92 L156 80 L166 92 L156 104 Z" fill="#fff" transform="rotate(-8 156 100)" />
        </>
      );
      break;
    case "toy":
      art = (
        <>
          <rect x="40" y="136" width="240" height="10" rx="3" fill={INK} opacity="0.8" />
          <rect x="190" y="84" width="38" height="52" rx="3" fill={BLUE} />
          <ellipse cx="116" cy="134" rx="24" ry="5" fill={INK} opacity="0.85" />
          <Figure x={116} y={126} scale={1.3} arm={1} />
          <circle cx="104" cy="74" r="2.5" fill={INK} />
        </>
      );
      break;
    case "spark":
      art = (
        <>
          <rect x="40" y="140" width="240" height="10" rx="3" fill={INK} opacity="0.8" />
          <rect x="200" y="90" width="36" height="50" rx="3" fill={BLUE} />
          <path
            d="M136 96 C 150 70, 178 58, 196 44"
            stroke={YELLOW}
            strokeWidth="3"
            fill="none"
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
          <Star x={204} y={40} r={16} fill={YELLOW} />
          <Figure x={128} y={112} scale={1.2} arm={2} />
        </>
      );
      break;
    case "screen":
      art = (
        <>
          <rect x="150" y="36" width="130" height="86" rx="6" fill={INK} opacity="0.92" />
          <circle cx="215" cy="79" r="30" fill={BLUE} />
          <circle cx="215" cy="79" r="19" fill={NAVY} />
          <circle cx="215" cy="79" r="8" fill="#fff" />
          <rect x="200" y="122" width="30" height="8" fill={INK} opacity="0.92" />
          <path
            d="M60 128 C 90 118, 120 100, 150 90"
            stroke={YELLOW}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            opacity="0.8"
          />
          <g transform="rotate(-24 90 112)">
            <Figure x={90} y={132} scale={1.05} arm={2} />
          </g>
        </>
      );
      break;
    case "worlds":
      art = (
        <>
          {[BLUE, YELLOW, RED, GREEN, NAVY].map((fill, i) => (
            <circle
              key={fill}
              cx={52 + i * 54}
              cy={96 - Math.sin((i / 4) * Math.PI) * 34}
              r={21 - i}
              fill={fill}
            />
          ))}
          <path
            d="M36 128 C 110 88, 210 88, 288 128"
            stroke={INK}
            strokeWidth="2"
            fill="none"
            strokeDasharray="3 8"
            opacity="0.6"
          />
          <Star x={160} y={40} r={9} fill={YELLOW} />
        </>
      );
      break;
    default:
      art = (
        <>
          <Star x={128} y={48} r={8} fill={YELLOW} />
          <Star x={196} y={62} r={6} fill={YELLOW} />
          <Star x={162} y={32} r={5} fill={RED} />
          <Figure x={160} y={96} scale={1.3} flip arm={2} />
          <path d="M60 150 L260 150" stroke={INK} strokeWidth="2" opacity="0.4" />
        </>
      );
  }
  return (
    <svg
      viewBox="0 0 320 180"
      aria-hidden
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {art}
    </svg>
  );
}

/** The finale still: she waves. */
export function WavingArt() {
  return (
    <svg viewBox="0 0 200 200" aria-hidden className="h-full w-full">
      <circle
        cx="100"
        cy="100"
        r="86"
        fill="color-mix(in srgb, var(--brand-yellow) 16%, var(--background))"
      />
      <Star x={52} y={54} r={9} fill={YELLOW} />
      <Star x={150} y={46} r={6} fill={BLUE} />
      <g transform="translate(100 150) scale(2.6)">
        <circle cx="0" cy="-34" r="9" fill={YELLOW} />
        <path d="M0 -24 L14 8 L-14 8 Z" fill={RED} />
        <path d="M8 -16 L20 -38" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M-8 -16 L-18 -4" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
