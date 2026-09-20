"use client";

import { useLayoutEffect, useRef, useState } from "react";
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

// Some kinds draw a shape that covers most of the tile (fans/leaves/clover
// are big blobby petals reaching ~80% of the area); others draw a thin
// stroke or a small corner accent that covers only a fraction of it. To
// keep the field reading as color-dominant rather than white-dominant, the
// accent color always goes on whichever side — background or the drawn
// shape — actually covers most of the tile for that particular kind.
const BIG_SHAPE_KINDS = new Set<PatternKind>(["fans", "leaves", "clover"]);

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

// A continuous middle spine connects the uneven skyline, including the
// repeat seam. Scattered upper/lower gaps preserve the open composition;
// no column can ever contain three vertically empty cells.
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
  [1, 0],
  [1, 10],
  [1, 11],
  [1, 12],
  [1, 13],
  [1, 14],
  [1, 15],
  [1, 16],
  [1, 17],
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
    // For big-blob kinds, the drawn shape itself is most of the tile, so
    // it needs to carry the color (canvas stays the background sliver).
    // For every other kind, the background rect is most of the tile, so
    // the color belongs there instead (canvas becomes the small accent).
    const canvasIsBg = BIG_SHAPE_KINDS.has(choice.kind) ? true : rand() < 0.12;
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
const TILE_PX = 76;
const COPY_WIDTH = COLS * TILE_PX;

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
  const [copies, setCopies] = useState(2);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const resize = new ResizeObserver(() => {
      setCopies(Math.max(2, Math.ceil(wrap.clientWidth / COPY_WIDTH) + 1));
    });
    resize.observe(wrap);
    return () => resize.disconnect();
  }, []);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track) return;

    const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

    if (reduced) {
      gsap.set(wrap, { opacity: 1 });
      return;
    }

    const idleLoops: gsap.core.Animation[] = [];

    const tl = gsap.timeline({
      scrollTrigger: { trigger: wrap, start: "top 88%", once: true },
    });
    tl.fromTo(wrap, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" });
    tl.eventCallback("onComplete", () => {
      // Move exactly one copy, independent of how many copies are needed
      // to cover an ultrawide viewport.
      idleLoops.push(
        gsap.to(track, {
          x: -COPY_WIDTH,
          duration: 42,
          ease: "none",
          repeat: -1,
        }),
      );
    });

    return () => {
      tl.kill();
      idleLoops.forEach((l) => l.kill());
      gsap.set(track, { clearProps: "transform" });
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="mosaic-strip reveal-hidden w-full overflow-hidden opacity-0"
    >
      <div ref={trackRef} className="flex w-fit">
        {Array.from({ length: copies }, (_, index) => (
          <MosaicCopy key={index} />
        ))}
      </div>
    </div>
  );
}
