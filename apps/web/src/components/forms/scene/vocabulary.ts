import type { FormDesign, FormScene } from "@repo/shared";

/**
 * The scene's pieces: the brand's Bauhaus vocabulary (DESIGN_SYSTEM §1,
 * hero/shapes.tsx) as a deterministic list per form. Both renderers, the
 * WebGL scenes and the DOM composition, draw from the same list, so a form
 * builds the same picture whichever one runs. Seeded from the slug (never
 * the clock), so the server and the browser agree on every piece.
 */

export const SHAPE_KINDS = [
  "circle",
  "half",
  "quarter",
  "triangle",
  "square",
  "plus",
  "x",
  "leaf",
  "domes",
  "fan",
  "ring",
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export type Piece = {
  index: number;
  kind: ShapeKind;
  /** Index into the scene colours' `pieces`. */
  color: number;
  /** Quarter turns in the formation. */
  turn: 0 | 1 | 2 | 3;
  /** The formation cell (column, row) on the poster grid. */
  cell: [number, number];
  /** The order in which answers pull this piece into place, 0..1. */
  threshold: number;
  /** Scatter position in viewport fractions (-0.1..1.1) and depth. */
  scatter: { x: number; y: number; z: number; spin: number; size: number };
  /** Idle drift phase and speed. */
  phase: number;
  speed: number;
};

export function hashSeed(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GRID = { cols: 4, rows: 4 } as const;

const COUNTS: Record<FormDesign["background"]["intensity"], number> = {
  calm: 12,
  lively: 16,
  wild: 16,
};

/** Loose pieces that never join the poster (they keep drifting around it). */
const EXTRAS: Record<FormDesign["background"]["intensity"], number> = {
  calm: 4,
  lively: 10,
  wild: 22,
};

export function pieceCount(intensity: FormDesign["background"]["intensity"]) {
  return { poster: COUNTS[intensity], extras: EXTRAS[intensity] };
}

/**
 * The pieces for one form: `poster` of them take a cell of the 4 x 4 grid
 * (calm leaves some cells empty, like the brand posters' breathing room),
 * the extras only drift.
 */
export function buildPieces(
  slug: string,
  scene: FormScene,
  intensity: FormDesign["background"]["intensity"],
  small = false,
): { poster: Piece[]; extras: Piece[] } {
  const random = seeded(hashSeed(`${slug}:${scene}`));
  const { poster, extras } = pieceCount(intensity);
  const cells: [number, number][] = [];
  for (let row = 0; row < GRID.rows; row += 1) {
    for (let col = 0; col < GRID.cols; col += 1) cells.push([col, row]);
  }
  // Shuffle the cells so answers fill the poster in a scattered order.
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [cells[index], cells[swap]] = [cells[swap], cells[index]];
  }
  const kinds = [...SHAPE_KINDS];
  const make = (index: number, cell: [number, number], threshold: number): Piece => {
    // Neighbouring pieces avoid repeating a shape or a colour.
    const kind = kinds[Math.floor(random() * kinds.length)];
    return {
      index,
      kind,
      color: Math.floor(random() * 5),
      turn: Math.floor(random() * 4) as Piece["turn"],
      cell,
      threshold,
      scatter: {
        x: edgeBiased(random),
        y: random() * 1.1 - 0.05,
        z: random(),
        spin: random() * 2 - 1,
        size: 0.55 + random() * 0.6,
      },
      phase: random() * Math.PI * 2,
      speed: 0.6 + random() * 0.8,
    };
  };
  const posterPieces = cells
    .slice(0, poster)
    .map((cell, index) => make(index, cell, (index + 1) / poster));
  const extraCount = small ? Math.round(extras / 2) : extras;
  const extraPieces = Array.from({ length: extraCount }, (_, index) =>
    make(poster + index, [-1, -1], 2),
  );
  // Avoid two poster neighbours in the same colour: nudge the colour on a clash.
  for (const piece of posterPieces) {
    const clash = posterPieces.find(
      (other) =>
        other !== piece &&
        other.color === piece.color &&
        Math.abs(other.cell[0] - piece.cell[0]) + Math.abs(other.cell[1] - piece.cell[1]) === 1,
    );
    if (clash) piece.color = (piece.color + 1 + (piece.index % 3)) % 5;
  }
  return { poster: posterPieces, extras: extraPieces };
}

/** Scatter x leaning to the edges, so the middle (the questions) stays calm. */
function edgeBiased(random: () => number) {
  const side = random() < 0.5 ? 0 : 1;
  const depth = random() ** 1.6 * 0.42;
  return side === 0 ? -0.06 + depth : 1.06 - depth;
}

/** SVG path data per kind, drawn in a 100 x 100 box. */
export const SHAPE_PATHS: Record<Exclude<ShapeKind, "x" | "ring">, string> = {
  circle: "M50 2a48 48 0 1 0 0.001 0Z",
  half: "M2 74A48 48 0 0 1 98 74Z",
  quarter: "M4 96V4A92 92 0 0 1 96 96Z",
  triangle: "M4 4L4 96L96 96Z",
  square: "M6 6H94V94H6Z",
  plus: "M38 6H62V38H94V62H62V94H38V62H6V38H38Z",
  leaf: "M4 96C4 46 46 4 96 4C96 54 54 96 4 96Z",
  domes:
    "M96 4C96 29.4 75.4 50 50 50C24.6 50 4 29.4 4 4ZM96 96C96 70.6 75.4 50 50 50C24.6 50 4 70.6 4 96Z",
  fan: "M50 2A48 48 0 0 0 98 50A48 48 0 0 0 50 98A48 48 0 0 0 2 50A48 48 0 0 0 50 2Z",
};
