"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { GRID, SHAPE_PATHS, type Piece, type ShapeKind } from "./vocabulary";

/**
 * The scene without WebGL: the same pieces as SVG, laid out by CSS. Loose
 * pieces sit toward the edges; each answered question sends the next one
 * into its cell of the poster (a CSS transition, so reduced motion simply
 * jumps). With motion allowed the loose pieces float and follow the pointer
 * a little; under reduced motion nothing loops.
 *
 * Positions are CSS custom properties only (the poster rect comes from
 * forms.css media queries), so the server renders the exact first frame.
 */

export function ShapeSvg({ kind, className }: { kind: ShapeKind; className?: string }) {
  if (kind === "x") {
    return (
      <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
        <path
          d="M20 20L80 80M80 20L20 80"
          stroke="currentColor"
          strokeWidth="19"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  if (kind === "ring") {
    return (
      <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
        <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="18" fill="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <path d={SHAPE_PATHS[kind]} fill="currentColor" />
    </svg>
  );
}

function pieceStyle(piece: Piece): CSSProperties {
  return {
    color: `var(--fx-piece-${piece.color})`,
    ["--sx" as string]: piece.scatter.x,
    ["--sy" as string]: piece.scatter.y,
    ["--sz" as string]: piece.scatter.z,
    ["--ss" as string]: piece.scatter.size,
    ["--spin" as string]: `${Math.round(piece.scatter.spin * 160)}deg`,
    ["--col" as string]: piece.cell[0],
    ["--row" as string]: piece.cell[1],
    ["--turn" as string]: `${piece.turn * 90}deg`,
    ["--delay" as string]: `${(piece.index % 5) * 40}ms`,
    ["--float" as string]: `${(5 + piece.speed * 4).toFixed(2)}s`,
    ["--phase" as string]: `${(-piece.phase * 1.3).toFixed(2)}s`,
  };
}

export function SceneDom({
  poster,
  extras,
  progress,
  complete,
  interactive,
  showFrame,
}: {
  poster: Piece[];
  extras: Piece[];
  progress: number;
  complete: boolean;
  interactive: boolean;
  showFrame: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Pointer parallax: two custom properties the pieces' transforms read.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !interactive) return;
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const onMove = (event: PointerEvent) => {
      x = event.clientX / window.innerWidth - 0.5;
      y = event.clientY / window.innerHeight - 0.5;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        root.style.setProperty("--px", x.toFixed(3));
        root.style.setProperty("--py", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [interactive]);

  const placed = complete ? poster.length : Math.round(progress * poster.length);
  return (
    <div ref={rootRef} className="fx-scene-dom" data-complete={complete || undefined} aria-hidden>
      <div className="fx-poster-frame" data-visible={showFrame && !complete ? "" : undefined}>
        {Array.from({ length: GRID.cols * GRID.rows }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      {extras.map((piece) => (
        <div key={piece.index} className="fx-piece" data-loose style={pieceStyle(piece)}>
          <ShapeSvg kind={piece.kind} className="fx-piece-shape" />
        </div>
      ))}
      {poster.map((piece, index) => (
        <div
          key={piece.index}
          className="fx-piece"
          data-placed={index < placed ? "" : undefined}
          style={pieceStyle(piece)}
        >
          <ShapeSvg kind={piece.kind} className="fx-piece-shape" />
        </div>
      ))}
    </div>
  );
}
