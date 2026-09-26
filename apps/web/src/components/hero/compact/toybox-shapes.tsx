import type { ReactNode } from "react";

import {
  Circle,
  DomesMotif,
  FansMotif,
  LeavesMotif,
  LogoMark,
  Square,
  ToggleChip,
  TriangleShape,
  XMark,
} from "@/components/hero/shapes";

/**
 * The toy box's cast: the desktop hero's shapes, each with the body it gets
 * in the physics world, how it reacts to a tap, and where it rests in the
 * static poster (reduced motion, no JavaScript).
 *
 * Geometry is written in the element's own box, 0..1 on both axes, so one
 * table serves every screen size. `TOYS` is in the desktop entrance's order:
 * Media's shapes, then Game's, then the logo last.
 */

export type ToyId =
  | "square"
  | "toggle"
  | "triangle"
  | "yellow"
  | "cross"
  | "red"
  | "domes"
  | "fans"
  | "leaves"
  | "logo";

/** The two word layouts: four stacked lines, or two lines on short, wide screens. */
export type ToyLayout = "stack" | "wide";

type Point = readonly [number, number];

export type ToyPart =
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "box"; x: number; y: number; w: number; h: number; angle?: number; round?: number }
  | { kind: "hull"; points: readonly Point[]; round?: number };

export type ToyFlourish =
  "jelly" | "toggle" | "flip" | "spin" | "leaves" | "domes" | "logo" | "stretch";

export type ToyHit = "circle" | "square" | "triangle" | "diamond" | "pill";

export type Toy = {
  id: ToyId;
  /** Element box in base-size units (the base size is fitted to the screen). */
  w: number;
  h: number;
  /** One part for a simple body, several for a compound one. Element units. */
  parts: readonly ToyPart[];
  restitution: number;
  friction: number;
  flourish: ToyFlourish;
  /** The shape the element answers taps and drags in. */
  hit: ToyHit;
  /** Spin at spawn, radians per step, so each one tumbles its own way in. */
  spin: number;
  art: () => ReactNode;
};

function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number) {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return points;
}

// The brand mark's outline (the three shards together), traced from the
// LogoMark path data and normalised to its 660 unit view box.
const LOGO_HULL: readonly Point[] = [
  [0.4977, 0.1049],
  [0.7598, 0.256],
  [0.8826, 0.3348],
  [0.8826, 0.6879],
  [0.8265, 0.7333],
  [0.5523, 0.897],
  [0.4462, 0.897],
  [0.1735, 0.7333],
  [0.1174, 0.6879],
  [0.1174, 0.3348],
  [0.2523, 0.256],
];

export const TOYS: readonly Toy[] = [
  {
    id: "square",
    w: 0.82,
    h: 0.82,
    parts: [{ kind: "box", x: 0.5, y: 0.5, w: 0.96, h: 0.96, round: 0.04 }],
    restitution: 0.28,
    friction: 0.5,
    flourish: "stretch",
    hit: "square",
    spin: 0.06,
    art: () => <Square />,
  },
  {
    id: "toggle",
    w: 1.3,
    h: 0.532,
    // A capsule: the track's rounded ends are half its height.
    parts: [{ kind: "box", x: 0.5, y: 0.5, w: 212 / 220, h: 82 / 90, round: 0.49 }],
    restitution: 0.32,
    friction: 0.4,
    flourish: "toggle",
    hit: "pill",
    spin: -0.05,
    art: () => <ToggleChip />,
  },
  {
    id: "triangle",
    w: 0.88,
    h: 0.88,
    parts: [
      {
        kind: "hull",
        points: [
          [0.02, 0.02],
          [0.98, 0.98],
          [0.02, 0.98],
        ],
        round: 0.03,
      },
    ],
    restitution: 0.22,
    friction: 0.55,
    flourish: "flip",
    hit: "triangle",
    spin: 0.08,
    art: () => <TriangleShape />,
  },
  {
    id: "yellow",
    w: 0.8,
    h: 0.8,
    parts: [{ kind: "circle", x: 0.5, y: 0.5, r: 0.48 }],
    restitution: 0.52,
    friction: 0.2,
    flourish: "jelly",
    hit: "circle",
    spin: 0.02,
    art: () => <Circle color="var(--brand-yellow)" />,
  },
  {
    id: "cross",
    w: 0.62,
    h: 0.62,
    // Two rounded strokes crossing at the centre, like the drawn X.
    parts: [
      { kind: "box", x: 0.5, y: 0.5, w: 1.055, h: 0.15, angle: Math.PI / 4, round: 0.45 },
      { kind: "box", x: 0.5, y: 0.5, w: 1.055, h: 0.15, angle: -Math.PI / 4, round: 0.45 },
    ],
    restitution: 0.36,
    friction: 0.45,
    flourish: "spin",
    hit: "circle",
    spin: -0.12,
    art: () => <XMark />,
  },
  {
    id: "red",
    w: 0.72,
    h: 0.72,
    parts: [{ kind: "circle", x: 0.5, y: 0.5, r: 0.48 }],
    restitution: 0.5,
    friction: 0.2,
    flourish: "jelly",
    hit: "circle",
    spin: -0.03,
    art: () => <Circle color="var(--brand-red)" />,
  },
  {
    id: "domes",
    w: 0.8,
    h: 0.8,
    // Two half discs meeting point to point: an hourglass lying still.
    parts: [
      { kind: "hull", points: arc(0.5, 0, 0.5, 0, Math.PI, 8) },
      { kind: "hull", points: arc(0.5, 1, 0.5, Math.PI, 2 * Math.PI, 8) },
    ],
    restitution: 0.3,
    friction: 0.5,
    flourish: "domes",
    hit: "square",
    spin: 0.07,
    art: () => <DomesMotif />,
  },
  {
    id: "fans",
    w: 0.84,
    h: 0.84,
    // The four tips are what touches: a diamond through them.
    parts: [
      {
        kind: "hull",
        points: [
          [0.5, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
        ],
        round: 0.04,
      },
    ],
    restitution: 0.34,
    friction: 0.45,
    flourish: "spin",
    hit: "diamond",
    spin: 0.1,
    art: () => <FansMotif />,
  },
  {
    id: "leaves",
    w: 0.8,
    h: 0.8,
    parts: [{ kind: "box", x: 0.5, y: 0.5, w: 0.94, h: 0.94, round: 0.12 }],
    restitution: 0.3,
    friction: 0.5,
    flourish: "leaves",
    hit: "square",
    spin: -0.07,
    art: () => <LeavesMotif />,
  },
  {
    id: "logo",
    w: 1.14,
    h: 1.14,
    parts: [{ kind: "hull", points: LOGO_HULL, round: 0.02 }],
    restitution: 0.34,
    friction: 0.5,
    flourish: "logo",
    hit: "circle",
    spin: 0.015,
    art: () => <LogoMark solid />,
  },
];

export const TOY_BY_ID = Object.fromEntries(TOYS.map((toy) => [toy.id, toy])) as Record<ToyId, Toy>;

/**
 * The drop-in: when each shape leaves the top of the box (seconds after the
 * entrance starts) and where across the box (a share of its width). Tuned so
 * the pile settles into a composed arrangement: the first shapes on the
 * words' shelves, the rest filling the steps beside them.
 */
export const DROPS: Record<ToyLayout, readonly { id: ToyId; at: number; x: number }[]> = {
  stack: [
    { id: "square", at: 0.1, x: 0.14 },
    { id: "toggle", at: 0.28, x: 0.42 },
    { id: "triangle", at: 0.46, x: 0.74 },
    { id: "yellow", at: 0.62, x: 0.9 },
    { id: "cross", at: 0.76, x: 0.3 },
    { id: "red", at: 0.9, x: 0.62 },
    { id: "domes", at: 1.15, x: 0.84 },
    { id: "fans", at: 1.32, x: 0.12 },
    { id: "leaves", at: 1.49, x: 0.56 },
    { id: "logo", at: 1.95, x: 0.36 },
  ],
  wide: [
    { id: "square", at: 0.1, x: 0.1 },
    { id: "toggle", at: 0.28, x: 0.3 },
    { id: "triangle", at: 0.46, x: 0.62 },
    { id: "yellow", at: 0.62, x: 0.86 },
    { id: "cross", at: 0.76, x: 0.2 },
    { id: "red", at: 0.9, x: 0.74 },
    { id: "domes", at: 1.15, x: 0.94 },
    { id: "fans", at: 1.32, x: 0.46 },
    { id: "leaves", at: 1.49, x: 0.8 },
    { id: "logo", at: 1.95, x: 0.36 },
  ],
};

/**
 * Where each shape sits in the static poster, in the words' own em so it
 * follows the type at every size. `x` is the shape's left edge, `y` its
 * bottom edge and `size` its height. The words are 0.95em lines whose cap
 * tops sit 0.128em below each line's top, so a shape resting on line n has
 * its bottom at `n * 0.95 + 0.128`.
 */
export type PosterSpot = { x: number; y: number; size: number; rotate?: number };

export const POSTER: Record<ToyLayout, Record<ToyId, PosterSpot>> = {
  stack: {
    // On top of "Media,"
    logo: { x: -0.06, y: 0.2, size: 1.02 },
    domes: { x: 0.14, y: -0.74, size: 0.62 },
    toggle: { x: 1.0, y: 0.128, size: 0.52 },
    cross: { x: 1.38, y: -0.39, size: 0.5, rotate: 12 },
    square: { x: 2.32, y: 0.128, size: 0.66, rotate: -4 },
    yellow: { x: 2.36, y: -0.532, size: 0.58 },
    // The step beside "Game," resting on "& Mobile"
    triangle: { x: 2.9, y: 2.028, size: 0.84 },
    // The step beside "& Mobile" resting on "Laboratory"
    red: { x: 3.86, y: 2.978, size: 0.72 },
    fans: { x: 3.9, y: 2.258, size: 0.64, rotate: 18 },
    leaves: { x: 3.92, y: 1.62, size: 0.6, rotate: 8 },
  },
  wide: {
    // On top of "Media, Game,"
    logo: { x: 0, y: 0.2, size: 1.02 },
    toggle: { x: 1.12, y: 0.128, size: 0.5 },
    square: { x: 2.46, y: 0.128, size: 0.62, rotate: -6 },
    cross: { x: 3.2, y: 0.128, size: 0.48, rotate: 12 },
    fans: { x: 3.8, y: 0.128, size: 0.6, rotate: 18 },
    leaves: { x: 4.52, y: 0.128, size: 0.58, rotate: 8 },
    // The step beside "Media, Game," resting on "& Mobile Laboratory"
    triangle: { x: 5.95, y: 1.078, size: 0.8 },
    domes: { x: 6.05, y: 0.278, size: 0.56 },
    yellow: { x: 6.85, y: 1.078, size: 0.62 },
    red: { x: 7.55, y: 1.078, size: 0.66 },
  },
};
