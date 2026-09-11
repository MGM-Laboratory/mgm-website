"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { PatternTile, type PatternKind, type PatternTone } from "./pattern-tile";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const KINDS: PatternKind[] = [
  "fans",
  "square",
  "arcs",
  "circle",
  "leaves",
  "plus",
  "clover",
  "domes",
  "quads",
  "x",
];
const COLORS: ("red" | "yellow" | "blue" | "green")[] = ["red", "yellow", "blue", "green"];

// A small deterministic PRNG (not Math.random) so the "random" layout below
// is identical between server and client render — no hydration mismatch,
// no flash of re-shuffled tiles on load.
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The skyline silhouette from the reference: two uneven clusters (a wide
// one, a narrow one) separated by a gap, each stepping up from a short
// bottom row to a taller middle row to a short top row.
const COLS = 18;
const MASK: [row: number, col: number][] = [
  // top row
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [0, 7],
  [0, 13],
  [0, 14],
  // middle row
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 6],
  [1, 7],
  [1, 8],
  [1, 9],
  [1, 11],
  [1, 12],
  [1, 13],
  [1, 14],
  [1, 15],
  // bottom row
  [2, 0],
  [2, 1],
  [2, 2],
  [2, 12],
  [2, 13],
  [2, 14],
  [2, 15],
  [2, 16],
];

type Tile = { row: number; col: number; kind: PatternKind; bg: PatternTone; fg: PatternTone };

function buildMosaic(): Tile[] {
  const rand = mulberry32(20260911);
  const placed = new Map<string, { kind: PatternKind; color: string }>();
  const key = (r: number, c: number) => `${r},${c}`;

  function neighborsOf(r: number, c: number) {
    const out: { kind: PatternKind; color: string }[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const found = placed.get(key(r + dr, c + dc));
        if (found) out.push(found);
      }
    }
    return out;
  }

  function pick(r: number, c: number, strict: boolean) {
    const neighbors = neighborsOf(r, c);
    for (let attempt = 0; attempt < 60; attempt++) {
      const kind = KINDS[Math.floor(rand() * KINDS.length)];
      const color = COLORS[Math.floor(rand() * COLORS.length)];
      const colorClash = neighbors.some((n) => n.color === color);
      const kindClash = neighbors.some((n) => n.kind === kind);
      if (!kindClash && (!strict || !colorClash)) return { kind, color };
    }
    return null;
  }

  const tiles: Tile[] = [];
  for (const [row, col] of MASK) {
    const choice = pick(row, col, true) ??
      pick(row, col, false) ?? {
        kind: KINDS[Math.floor(rand() * KINDS.length)],
        color: COLORS[Math.floor(rand() * COLORS.length)],
      };
    placed.set(key(row, col), choice);
    const color = choice.color as "red" | "yellow" | "blue" | "green";
    const canvasIsBg = rand() < 0.5;
    tiles.push({
      row,
      col,
      kind: choice.kind,
      bg: canvasIsBg ? "canvas" : color,
      fg: canvasIsBg ? color : "canvas",
    });
  }
  return tiles;
}

const MOSAIC = buildMosaic();
const TILE_PX = 56;

function MosaicCopy() {
  return (
    <div className="relative shrink-0" style={{ width: COLS * TILE_PX, height: 3 * TILE_PX }}>
      {MOSAIC.map((tile, i) => (
        <div
          key={i}
          className="mosaic-tile absolute overflow-hidden"
          style={{
            left: tile.col * TILE_PX,
            top: tile.row * TILE_PX,
            width: TILE_PX,
            height: TILE_PX,
          }}
        >
          <PatternTile kind={tile.kind} bg={tile.bg} fg={tile.fg} className="block h-full w-full" />
        </div>
      ))}
    </div>
  );
}

export function MosaicMarquee() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track) return;

    const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

    if (reduced) {
      gsap.set(wrap, { opacity: 1 });
      return;
    }

    const tiles = gsap.utils.toArray<HTMLElement>(".mosaic-tile", track);
    const idleLoops: gsap.core.Animation[] = [];

    const tl = gsap.timeline({
      scrollTrigger: { trigger: wrap, start: "top 88%", once: true },
    });
    tl.fromTo(wrap, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" });
    tl.eventCallback("onComplete", () => {
      // Endless sideways drift — the track is two copies of the same
      // layout side by side, so sliding exactly one copy-width (-50%)
      // loops with no visible seam.
      idleLoops.push(
        gsap.to(track, {
          xPercent: -50,
          duration: 42,
          ease: "none",
          repeat: -1,
        }),
      );
      // A slow, staggered "breathing" pulse across the whole field so it
      // reads as alive even while the marquee is mid-drift.
      idleLoops.push(
        gsap.to(tiles, {
          scale: 1.16,
          rotate: () => gsap.utils.random(-8, 8),
          duration: 1.6,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          stagger: { each: 0.05, from: "random" },
        }),
      );
    });

    return () => {
      tl.kill();
      idleLoops.forEach((l) => l.kill());
    };
  }, []);

  return (
    <div ref={wrapRef} className="mosaic-strip reveal-hidden w-full overflow-hidden opacity-0">
      <div ref={trackRef} className="flex w-fit">
        <MosaicCopy />
        <MosaicCopy />
      </div>
    </div>
  );
}
