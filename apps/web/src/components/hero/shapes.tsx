import { cn } from "@/lib/utils";

/**
 * Decorative geometric shapes used across the hero composition.
 * Each shape exposes `data-part` hooks so the GSAP timeline in
 * `hero.tsx` can target internal pieces (a toggle's ring, an arrow's
 * spark, a logo's individual shard) without prop drilling refs.
 */

export function Square({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("shape-square overflow-visible", className)}
      aria-hidden
    >
      <rect data-part="square" x="2" y="2" width="96" height="96" fill="var(--brand-green)" />
    </svg>
  );
}

/**
 * A pill "track" (grey when off, red when on) with a ring "knob" whose
 * hole is filled to match the page background — sliding left <-> right.
 * Track geometry: x=55 y=5 w=140 h=80 rx=40, so the rounded end-caps
 * are centered at x=95 (left/off) and x=155 (right/on).
 */
export function ToggleChip({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 90"
      className={cn("toggle-switch overflow-visible", className)}
      aria-hidden
    >
      <rect data-part="track" x="55" y="5" width="140" height="80" rx="40" fill="#9aa3ad" />
      <circle
        data-part="knob"
        cx="95"
        cy="45"
        r="33"
        fill="var(--surface-muted)"
        stroke="var(--brand-yellow)"
        strokeWidth="18"
      />
    </svg>
  );
}

export function TriangleShape({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("shape-triangle overflow-visible", className)}
      aria-hidden
    >
      <polygon data-part="triangle" points="2,2 2,98 98,98" fill="var(--brand-blue)" />
    </svg>
  );
}

export function Circle({
  className,
  color = "var(--brand-yellow)",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("shape-circle overflow-visible", className)}
      aria-hidden
    >
      <circle data-part="circle" cx="50" cy="50" r="48" fill={color} />
    </svg>
  );
}

export function XMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("shape-x overflow-visible", className)}
      aria-hidden
      fill="none"
    >
      <path
        data-part="x"
        d="M18 18L82 82M82 18L18 82"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Two opposing "dome" arcs meeting at a point — from patterns/domes-yellow-on-white.svg. */
export function DomesMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("domes-motif overflow-visible", className)}
      aria-hidden
    >
      <path
        data-part="dome-top"
        d="M100 0C100 27.6142 77.6142 50 50 50C22.3858 50 0 27.6142 0 0Z"
        fill="var(--brand-yellow)"
      />
      <path
        data-part="dome-bottom"
        d="M100 100C100 72.3858 77.6142 50 50 50C22.3858 50 0 72.3858 0 100Z"
        fill="var(--brand-yellow)"
      />
    </svg>
  );
}

/**
 * A four-pointed concave "fan" star — the same square-minus-four-corner-
 * circles silhouette as patterns/fans-white-on-red.svg, traced directly as
 * one closed outline (tips at each edge midpoint, arcs pulled in toward
 * each corner) so it stays within its own bounds with a transparent
 * background, instead of relying on an evenodd cutout.
 */
export function FansMotif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("fans-motif overflow-visible", className)} aria-hidden>
      <path
        data-part="fan"
        d="M50 0A50 50 0 0 0 100 50A50 50 0 0 0 50 100A50 50 0 0 0 0 50A50 50 0 0 0 50 0Z"
        fill="var(--brand-red)"
      />
    </svg>
  );
}

/** A four-petal clover — from patterns/leaves-blue-on-white.svg. */
export function LeavesMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("leaves-motif overflow-visible", className)}
      aria-hidden
    >
      <path
        data-part="leaf-1"
        d="M0 0C27.6142 0 50 22.3858 50 50C22.3858 50 0 27.6142 0 0Z"
        fill="var(--brand-blue)"
      />
      <path
        data-part="leaf-2"
        d="M0 100C27.6142 100 50 77.6142 50 50C22.3858 50 0 72.3858 0 100Z"
        fill="var(--brand-blue)"
      />
      <path
        data-part="leaf-3"
        d="M50 0C77.6142 0 100 22.3858 100 50C72.3858 50 50 27.6142 50 0Z"
        fill="var(--brand-blue)"
      />
      <path
        data-part="leaf-4"
        d="M50 100C77.6142 100 100 77.6142 100 50C72.3858 50 50 72.3858 50 100Z"
        fill="var(--brand-blue)"
      />
    </svg>
  );
}

/**
 * A rounded, right-angled connector that bridges the shapes/GAME line
 * down to the closing line. The wrapper is positioned by hero.tsx so
 * y=0 lands exactly on the GAME row's mid-height and y=100 on the
 * closing line's mid-height — this component just draws straight
 * across that normalized 0-100 span, non-uniformly stretched to fit.
 */
export function ArrowConnector({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 100"
      preserveAspectRatio="none"
      className={cn("arrow-connector overflow-visible", className)}
      aria-hidden
      fill="none"
    >
      <path
        data-part="arrow-path"
        d="M280 8H44A16 16 0 0 0 28 24V76A16 16 0 0 0 44 92H80"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        data-part="arrow-head"
        d="M67 79L80 92L67 105"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle data-part="arrow-spark" cx="280" cy="8" r="4" fill="var(--brand-red)" opacity="0" />
    </svg>
  );
}

/** Tiny background motifs that idle-float in the hero's whitespace. */
export function Dot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn("overflow-visible", className)} aria-hidden>
      <circle cx="10" cy="10" r="9" fill="currentColor" />
    </svg>
  );
}

export function PlusMotif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn("overflow-visible", className)} aria-hidden fill="none">
      <path d="M10 1V19M1 10H19" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function RingMotif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn("overflow-visible", className)} aria-hidden fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="3.5" />
    </svg>
  );
}

/**
 * The brand mark reconstructed as three independent shards (same path
 * data as /public/logo.svg) so each can fly in and assemble separately.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="57.5 86.0265 660 660"
      className={cn("logo-mark overflow-visible", className)}
      aria-hidden
    >
      <g data-part="shard-1" style={{ transformOrigin: "391px 289px", opacity: 0 }}>
        <path
          d="M559 321.954V255.589C559 251.154 556.739 247.025 553.003 244.636L490.601 204.737C486.387 202.043 481.002 202.005 476.751 204.639L365.49 273.569C357.759 278.358 357.21 289.402 364.427 294.936L379.499 306.493C383.77 309.768 389.618 310.072 394.206 307.258L479.187 255.141C487.849 249.828 498.984 256.061 498.984 266.223V292.469C498.984 297.07 496.551 301.329 492.588 303.666L394.239 361.673C390.189 364.062 385.164 364.078 381.099 361.714L285.025 305.842C281.023 303.514 278.56 299.234 278.56 294.604V290.765C278.56 286.241 280.913 282.042 284.771 279.679L423.182 194.921C431.43 189.87 431.471 177.9 423.256 172.794L393.327 154.188C389.19 151.617 383.963 151.573 379.784 154.076L230.32 243.591C226.4 245.939 224 250.174 224 254.744V324.231C224 328.815 226.414 333.06 230.353 335.403L381.111 425.092C385.166 427.504 390.21 427.53 394.29 425.159L552.532 333.194C556.536 330.867 559 326.586 559 321.954Z"
          fill="#F7BF33"
        />
      </g>
      <g data-part="shard-2" style={{ transformOrigin: "253px 490px", opacity: 0 }}>
        <path
          d="M135 539.588V306.579C135 302.198 137.206 298.112 140.869 295.709L178.214 271.208C186.86 265.536 198.346 271.737 198.346 282.077V336.271C198.346 338.724 199.039 341.126 200.347 343.201L251.057 423.683C254.125 428.553 260.032 430.825 265.573 429.267L312.796 415.994C316.41 414.978 320.287 415.574 323.429 417.629L366.115 445.544C369.787 447.945 372 452.037 372 456.424V666.804C372 676.959 360.877 683.193 352.214 677.892L319.237 657.712C315.377 655.349 313.023 651.149 313.023 646.623V508.193C313.023 499.554 304.753 493.318 296.447 495.694L261.178 505.785C255.651 507.367 249.741 505.129 246.646 500.284L215.749 451.905C208.754 440.954 191.793 445.908 191.793 458.903V559.156C191.793 569.411 180.475 575.628 171.82 570.128L141.027 550.56C137.274 548.174 135 544.035 135 539.588Z"
          fill="#3A6DC5"
        />
      </g>
      <g data-part="shard-3" style={{ transformOrigin: "521px 490px", opacity: 0 }}>
        <path
          d="M640 539.588V306.579C640 302.198 637.794 298.112 634.131 295.709L596.786 271.208C588.14 265.536 576.654 271.737 576.654 282.077V336.271C576.654 338.724 575.961 341.126 574.653 343.201L523.943 423.683C520.875 428.553 514.968 430.825 509.427 429.267L462.204 415.994C458.59 414.978 454.713 415.574 451.571 417.629L408.885 445.544C405.213 447.945 403 452.037 403 456.424V666.804C403 676.959 414.123 683.193 422.786 677.892L455.763 657.712C459.623 655.349 461.977 651.149 461.977 646.623V508.193C461.977 499.554 470.247 493.318 478.553 495.694L513.822 505.785C519.349 507.367 525.259 505.129 528.354 500.284L559.251 451.905C566.246 440.954 583.207 445.908 583.207 458.903V559.156C583.207 569.41 594.525 575.628 603.18 570.128L633.973 550.559C637.726 548.174 640 544.035 640 539.588Z"
          fill="#F94141"
        />
      </g>
    </svg>
  );
}
