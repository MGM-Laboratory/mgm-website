import { Vector3, type Group } from "three";

import {
  fit,
  mix,
  saturate,
  smoothstep,
  window4,
  type StoryContext,
  type StoryTier,
} from "@/components/story/engine/act";
import { CARD_H, CARD_W } from "@/components/story/props/card-mesh";
import { STORY_CARDS } from "@/data/story";
import type { CardPose, DeckBeats } from "@/components/story/acts/cards/deck-motion";
import type { DeckLayout } from "@/components/story/acts/cards/deck-layout";
import { SAMPLES, StarPoints, ThreadField } from "@/components/story/acts/cards/thread-field";
import {
  STAGE_DISTANCE,
  halfHeightAt,
  halfWidthAt,
  type StageView,
} from "@/components/story/acts/cards/stage-space";
import { turnWindow } from "@/components/story/acts/cards/hero-cards";

/**
 * The background threads (ACTS Act 1, "The threads"; research
 * lusion-about section 9.1): the magician's invisible threads made
 * visible, all in the stage's 3D space so they pass in front of and behind
 * the cards, all reacting to the cursor and to scroll, in the page's ink
 * (or white on the dark page), with the division colours only at reveals
 * and hovers.
 *
 * 1. Guilloche braids: two engraved cords of fine lines (summed sines with
 *    phase offsets, so they cross and make moire, like the card back's
 *    linework) behind the stage. They draw themselves on as the section
 *    arrives, swell while the deck dances, calm at the rests, part around
 *    the cursor, carry each card's colour across the screen when it turns,
 *    and glints of light run along them, racing while the page scrolls.
 * 2. The spine: a gold thread through the stream, just in front of the
 *    cards' centres from its last card to just ahead of its first, with a
 *    glowing head and a star: the cards ride the thread.
 * 3. Puppet strings: two threads from each drawn card's top corners up out
 *    of the frame, simulated (verlet), swinging with the card, taut when
 *    it is hovered, cut when the gather snaps the cards face down.
 * 4. The constellation: once the four are revealed, a star map sets them
 *    in a lattice (a chain above the row, a chain below it, a link down
 *    every gap; a ring and a cross around the 2 x 2 on portrait screens),
 *    drawn in by the scroll, twinkling, never crossing a card. The links
 *    beside a hovered card take its colour.
 * 5. The stage line: the card back's zigzag border under the row, drawn
 *    out from the centre when the four land, a pulse of each card's colour
 *    running out from it as it turns.
 */

type Rgb = readonly [number, number, number];
type Point = readonly [number, number];

const ACCENT_RGB: ReadonlyMap<string, Rgb> = new Map<string, Rgb>([
  ["blue", [58 / 255, 109 / 255, 197 / 255]],
  ["red", [249 / 255, 65 / 255, 65 / 255]],
  ["green", [15 / 255, 134 / 255, 87 / 255]],
  ["yellow", [247 / 255, 191 / 255, 51 / 255]],
]);
const INK_LIGHT: Rgb = [14 / 255, 17 / 255, 22 / 255];
const INK_DARK: Rgb = [1, 1, 1];
const YELLOW: Rgb = [247 / 255, 191 / 255, 51 / 255];
/** The gold of the threads' light on the light page (brand yellow, deepened to read on white). */
const GOLD_LIGHT: Rgb = [196 / 255, 140 / 255, 24 / 255];

/** How far the spine floats toward the lens from the cards' centres, metres. */
const SPINE_LIFT = 0.014;

const STRING_NODES = 12;
const ROWS_STRINGS = 8;

export type ThreadInputs = {
  beats: DeckBeats;
  layout: DeckLayout;
  view: StageView;
  /** The four's final poses (stage frame). */
  heroes: readonly CardPose[];
  /** Each card's face up share, 0..1. */
  faceUp: Float32Array;
  /** Hover per card, 0..1. */
  hover: readonly number[];
  /** The stream: distance of its first and last card along the active path, and which path. */
  stream: { head: number; tail: number; back: boolean; on: number };
  /** The entrance's progress (draw-on) and the drop's (draw-off). */
  entrance: number;
  drop: number;
  /** Story position (vh), for the scrubbed phases. */
  t: number;
};

/** A string's simulation: positions and previous positions of its nodes (stage frame). */
type Strand = { pos: Float32Array; prev: Float32Array; live: boolean; cut: number };

const va = new Vector3();
const vb = new Vector3();
const corner = new Vector3();

export class Threads {
  readonly field: ThreadField;
  readonly stars: StarPoints;
  private readonly braidLines: number;
  private readonly braidSamples: number;
  private readonly rowSpine: number;
  private readonly rowStrings: number;
  private readonly rowConstellation: number;
  private readonly rowStage: number;
  private readonly strands: Strand[] = [];
  private readonly cursor = { x: 0, y: 0, strength: 0 };
  private lastTime = 0;
  private lastT = 0;
  /** Where the braids' glints are (a clock that runs faster while the page scrolls). */
  private glint = 0;
  private gold: Rgb = GOLD_LIGHT;

  constructor(stage: Group, tier: StoryTier) {
    this.braidLines = tier === "low" ? 6 : tier === "medium" ? 8 : 9;
    this.braidSamples = tier === "low" ? 110 : tier === "medium" ? 150 : 200;
    // Rows: two braids, the spine, the strings, the constellation, the stage line.
    this.rowSpine = this.braidLines * 2;
    this.rowStrings = this.rowSpine + 1;
    this.rowConstellation = this.rowStrings + ROWS_STRINGS;
    this.rowStage = this.rowConstellation + 1;
    this.field = new ThreadField(this.rowStage + 1);
    this.stars = new StarPoints(48);
    stage.add(this.field.mesh, this.stars.points);
    for (let k = 0; k < ROWS_STRINGS; k += 1) {
      this.strands.push({
        pos: new Float32Array(STRING_NODES * 3),
        prev: new Float32Array(STRING_NODES * 3),
        live: false,
        cut: 0,
      });
    }
  }

  /** Shows both batches for a compile pass. */
  warm(on: boolean) {
    this.field.mesh.visible = on;
    this.stars.points.visible = on;
  }

  update(ctx: StoryContext, input: ThreadInputs) {
    const field = this.field;
    const time = ctx.clock.time;
    const dt = Math.min(0.05, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    // The glints run on the clock, and race while the page scrolls (in either direction).
    const scroll = Math.min(3, Math.abs(input.t - this.lastT) / Math.max(1e-3, dt));
    this.lastT = input.t;
    this.glint += dt * (0.05 + 0.22 * scroll);
    field.setViewport(ctx.size.width, ctx.size.height, ctx.size.dpr);
    this.stars.setPixelRatio(ctx.size.dpr);
    field.clear();
    this.stars.clear();
    const dark = ctx.palette.scheme === "dark";
    const ink = dark ? INK_DARK : INK_LIGHT;
    const inkAlpha = dark ? 0.24 : 0.2;
    this.gold = dark ? YELLOW : GOLD_LIGHT;

    // The cursor, eased (lines part around it).
    const inside = ctx.pointer.inside;
    this.cursor.x = mix(this.cursor.x, ctx.pointer.ndc.x, 1 - Math.exp(-dt * 10));
    this.cursor.y = mix(this.cursor.y, ctx.pointer.ndc.y, 1 - Math.exp(-dt * 10));
    this.cursor.strength = mix(this.cursor.strength, inside ? 1 : 0, 1 - Math.exp(-dt * 4));

    // Gone once the page breaks under the falling box (page-fall.ts lets go at 0.08).
    const shown = input.entrance > 0 && input.drop < 0.2;
    field.mesh.visible = shown;
    this.stars.points.visible = shown;
    if (!shown) return;

    this.braids(input, ink, inkAlpha, time);
    this.spine(input, time);
    this.strings(input, ink, inkAlpha, dt, time);
    this.constellation(input, ink, inkAlpha, time);
    this.stageLine(input, ink, inkAlpha, time);
    field.commit();
    this.stars.commit();
  }

  // ------------------------------------------------------------------ 1. guilloche braids

  private braids(input: ThreadInputs, ink: Rgb, inkAlpha: number, time: number) {
    const { view, beats, t } = input;
    const lines = this.braidLines;
    const samples = this.braidSamples;
    const gold = this.gold;
    // Energy: calm at the rests, swelling with the stream, calmer for the reveal.
    const energy =
      0.25 +
      0.75 * window4(beats.u, 0, 0.8, 2.6, 3.4) +
      0.35 * window4(beats.gather, 0.05, 0.25, 0.6, 0.85);
    const breath = 0.5 + 0.5 * Math.sin(time * 0.9);
    const fade = (1 - smoothstep(0.02, 0.16, input.drop)) * smoothstep(0.15, 0.6, input.entrance);
    // Draw-on from the left as the section arrives.
    const draw = smoothstep(0.2, 1, input.entrance) * 1.15;
    for (let band = 0; band < 2; band += 1) {
      const depth = band === 0 ? 1.18 : 1.32;
      const hy = halfHeightAt(view, depth);
      const hx = halfWidthAt(view, depth);
      const z = STAGE_DISTANCE - depth;
      const phase = t * (band === 0 ? 0.55 : -0.42) + time * (band === 0 ? 0.11 : -0.08);
      const centreY = band === 0 ? 0.18 : -0.34;
      const swing = band === 0 ? 0.3 : 0.24;
      const cord = (band === 0 ? 0.075 : 0.06) * (0.6 + 0.9 * energy + 0.08 * breath);
      for (let k = 0; k < lines; k += 1) {
        const row = band * lines + k;
        const offset = (k / lines) * Math.PI * 2;
        const head = draw - k * 0.02;
        // Two glints per line, half a length apart, each line on its own beat.
        const g1 = (((this.glint + k * 0.137 + band * 0.31) % 1) + 1) % 1;
        const g2 = (g1 + 0.5) % 1;
        for (let i = 0; i < samples; i += 1) {
          const u = i / (samples - 1);
          const x = -1.08 + 2.16 * u;
          if (u > head) break;
          const yc =
            centreY +
            swing * Math.sin(1.55 * x + phase) +
            0.11 * Math.sin(3.6 * x - 0.6 * phase + band);
          let y =
            yc +
            cord *
              Math.sin(2.4 * x + offset + phase * 1.3) *
              (0.75 + 0.25 * Math.cos(5.1 * x + offset));
          // The cursor parts the cord (screen space at this depth).
          const dx = (x - this.cursor.x) * view.aspect;
          const dy = y - this.cursor.y;
          const d2 = dx * dx + dy * dy;
          if (this.cursor.strength > 0.01 && d2 < 0.2) {
            const push = Math.exp(-d2 / 0.012) * 0.09 * this.cursor.strength;
            y += dy >= 0 ? push : -push;
          }
          // The head glows a little brighter; the tail fades in; glints run along.
          const tip = smoothstep(head - 0.08, head, u);
          const ends = smoothstep(0, 0.06, u) * (1 - smoothstep(0.94, 1, u));
          const glint = Math.exp(-(((u - g1) / 0.035) ** 2)) + Math.exp(-(((u - g2) / 0.035) ** 2));
          let r = mix(ink[0], gold[0], glint * 0.85);
          let g = mix(ink[1], gold[1], glint * 0.85);
          let b = mix(ink[2], gold[2], glint * 0.85);
          const pulse = this.revealPulse(input, x, row);
          if (pulse.amount > 0.001) {
            r = mix(r, pulse.rgb[0], pulse.amount);
            g = mix(g, pulse.rgb[1], pulse.amount);
            b = mix(b, pulse.rgb[2], pulse.amount);
          }
          const alpha =
            (inkAlpha * 1.15 + pulse.amount * 0.4 + glint * 0.45) * fade * ends * (1 + tip * 0.8);
          this.field.point(
            row,
            i,
            x * hx,
            y * hy,
            z,
            (band === 0 ? 1.1 : 0.9) + tip * 0.8 + glint * 0.9,
            r,
            g,
            b,
            alpha,
          );
        }
      }
    }
  }

  private readonly pulseOut: { amount: number; rgb: Rgb } = { amount: 0, rgb: YELLOW };

  /** A card's colour travelling along the cords as it turns (scrubbed by its turn). */
  private revealPulse(input: ThreadInputs, x: number, row: number) {
    const out = this.pulseOut;
    out.amount = 0;
    const turn = input.beats.turn;
    if (turn <= 0 || input.beats.gather > 0.1) return out;
    for (let k = 0; k < 4; k += 1) {
      const [a, b] = turnWindow(k, input.layout.portrait);
      const p = fit(turn, a + (b - a) * 0.45, b + 0.12, 0, 1);
      if (p <= 0 || p >= 1) continue;
      const front = -1.2 + p * 2.6 + (row % 3) * 0.04;
      const amount = Math.exp(-((x - front) ** 2) / 0.05) * Math.sin(p * Math.PI) * 0.8;
      if (amount > out.amount) {
        out.amount = amount;
        out.rgb = ACCENT_RGB.get(STORY_CARDS.at(k)?.accent ?? "blue") ?? YELLOW;
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ 2. the spine

  private spine(input: ThreadInputs, time: number) {
    const { stream, layout } = input;
    if (stream.on <= 0.001) return;
    const path = stream.back ? layout.back : layout.snake;
    const lead = 0.07;
    const from = Math.max(0, stream.tail - 0.04);
    const to = Math.min(path.length, stream.head + lead);
    if (to - from < 0.01) return;
    const gold = this.gold;
    const n = SAMPLES;
    // A spark that runs down the thread from the head to the tail, over and over.
    const spark = mix(to, from, (time * 0.55) % 1);
    for (let i = 0; i < n; i += 1) {
      const u = i / (n - 1);
      const s = mix(from, to, u);
      path.point(s, va);
      // Fades in from the tail, glows at the first card, thins to nothing just ahead of it.
      const ahead = smoothstep(stream.head, to, s);
      const tail = smoothstep(0, 0.2, u);
      const glow = Math.exp(-(((s - stream.head) / 0.05) ** 2));
      const run = Math.exp(-(((s - spark) / 0.03) ** 2));
      const alpha = (0.55 * tail * (1 - ahead) + glow * 0.4 + run * 0.35) * stream.on;
      // In front of the cards (a banked card's edge comes 15 mm forward), so it runs over the deck.
      this.field.point(
        this.rowSpine,
        i,
        va.x,
        va.y,
        va.z + SPINE_LIFT,
        1.1 + glow * 2.2 + run * 1.2 - ahead,
        gold[0],
        gold[1],
        gold[2],
        alpha,
      );
    }
    // A star at the head: the magic leading the deck.
    path.point(Math.min(path.length, stream.head + 0.012), vb);
    this.stars.star(
      0,
      vb.x,
      vb.y,
      vb.z + SPINE_LIFT + 0.002,
      15 * stream.on,
      YELLOW[0],
      YELLOW[1],
      YELLOW[2],
      0.95 * stream.on,
      stream.head * 3,
    );
  }

  // ------------------------------------------------------------------ 3. puppet strings

  private strings(input: ThreadInputs, ink: Rgb, inkAlpha: number, dt: number, time: number) {
    const { beats, view } = input;
    // On from the moment the four reach their slots, cut at the gather's snap.
    const on = smoothstep(0.55, 0.95, beats.draw) * (beats.drop > 0 ? 0 : 1);
    const cut = smoothstep(0.02, 0.12, beats.gather);
    for (let k = 0; k < 4; k += 1) {
      const pose = input.heroes.at(k);
      if (!pose) continue;
      for (let side = 0; side < 2; side += 1) {
        const strand = this.strands.at(k * 2 + side);
        if (!strand) continue;
        const row = this.rowStrings + k * 2 + side;
        if (on <= 0.001 || !pose.visible || cut >= 1) {
          strand.live = false;
          continue;
        }
        // The card's top corner (a little in from the edge) in the stage frame.
        corner.set((side === 0 ? -1 : 1) * CARD_W * 0.36, CARD_H * 0.5, 0);
        corner.multiplyScalar(pose.scale).applyQuaternion(pose.quaternion).add(pose.position);
        const depth = STAGE_DISTANCE - corner.z;
        const top = halfHeightAt(view, depth) * 1.25;
        const anchorX = corner.x * 1.04 + (side === 0 ? -1 : 1) * 0.004;
        if (!strand.live) this.resetStrand(strand, anchorX, top, corner);
        strand.live = true;
        const taut = input.hover.at(k) ?? 0;
        this.stepStrand(strand, anchorX, top, corner, dt, taut, cut, time + k);
        const hover = taut;
        const accent = ACCENT_RGB.get(STORY_CARDS.at(k)?.accent ?? "blue") ?? YELLOW;
        const flipGlint = Math.sin(saturate(input.faceUp.at(k) ?? 0) * Math.PI);
        for (let i = 0; i < STRING_NODES; i += 1) {
          const o = i * 3;
          const x = strand.pos.at(o) ?? 0;
          const y = strand.pos.at(o + 1) ?? 0;
          const z = strand.pos.at(o + 2) ?? 0;
          const u = i / (STRING_NODES - 1);
          // A glint running up the string as the card turns.
          const glint = flipGlint * Math.exp(-((1 - u - flipGlint) ** 2) / 0.02);
          const mixK = saturate(hover * 0.8 + glint);
          const alpha = (inkAlpha * 1.25 + hover * 0.35 + glint * 0.4) * on * (1 - cut);
          this.field.point(
            row,
            i,
            x,
            y,
            z,
            0.9 + hover * 0.5,
            mix(ink[0], accent[0], mixK),
            mix(ink[1], accent[1], mixK),
            mix(ink[2], accent[2], mixK),
            alpha * smoothstep(0, 0.12, u),
          );
        }
      }
    }
  }

  private resetStrand(strand: Strand, anchorX: number, top: number, end: Vector3) {
    for (let i = 0; i < STRING_NODES; i += 1) {
      const u = i / (STRING_NODES - 1);
      const x = mix(anchorX, end.x, 1 - u);
      const y = mix(top, end.y, 1 - u);
      const z = end.z;
      strand.pos.set([x, y, z], i * 3);
      strand.prev.set([x, y, z], i * 3);
    }
    strand.cut = 0;
  }

  /** Verlet: node 0 hangs from the card's corner, the last node is the anchor above the frame. */
  private stepStrand(
    strand: Strand,
    anchorX: number,
    top: number,
    end: Vector3,
    dt: number,
    taut: number,
    cut: number,
    seed: number,
  ) {
    const n = STRING_NODES;
    const pos = strand.pos;
    const prev = strand.prev;
    const total = Math.hypot(anchorX - end.x, top - end.y);
    const rest = (total / (n - 1)) * mix(1.035, 0.995, taut);
    const gravity = -0.35;
    const h = Math.min(dt, 1 / 30);
    const sway = Math.sin(seed * 1.7) * 0.0004;
    for (let i = 1; i < n - 1; i += 1) {
      const o = i * 3;
      for (let c = 0; c < 3; c += 1) {
        const p = pos.at(o + c) ?? 0;
        const q = prev.at(o + c) ?? 0;
        const accel = c === 1 ? gravity * (1 - cut) + cut * 1.6 : c === 0 ? sway : 0;
        const next = p + (p - q) * 0.985 + accel * h * h;
        prev.set([p], o + c);
        pos.set([next], o + c);
      }
    }
    // Pin the ends: the corner (unless cut) and the anchor.
    pos.set([end.x, end.y, end.z], 0);
    pos.set([anchorX, top, end.z], (n - 1) * 3);
    if (cut > 0) pos.set([mix(end.x, anchorX, cut), mix(end.y, top, cut), end.z], 0);
    for (let iter = 0; iter < 6; iter += 1) {
      for (let i = 0; i < n - 1; i += 1) {
        const a = i * 3;
        const b = a + 3;
        const ax = pos.at(a) ?? 0;
        const ay = pos.at(a + 1) ?? 0;
        const az = pos.at(a + 2) ?? 0;
        const bx = pos.at(b) ?? 0;
        const by = pos.at(b + 1) ?? 0;
        const bz = pos.at(b + 2) ?? 0;
        const dx = bx - ax;
        const dy = by - ay;
        const dz = bz - az;
        const d = Math.max(1e-6, Math.hypot(dx, dy, dz));
        const diff = (d - rest) / d;
        const wa = i === 0 ? 0 : 0.5;
        const wb = i + 1 === n - 1 ? 0 : 0.5;
        const norm = wa + wb || 1;
        pos.set(
          [
            ax + dx * diff * (wa / norm),
            ay + dy * diff * (wa / norm),
            az + dz * diff * (wa / norm),
          ],
          a,
        );
        pos.set(
          [
            bx - dx * diff * (wb / norm),
            by - dy * diff * (wb / norm),
            bz - dz * diff * (wb / norm),
          ],
          b,
        );
      }
    }
  }

  // ------------------------------------------------------------------ 4. the constellation

  /** The lattice's polylines (stage x, y) around the four slots, for this layout. */
  private lattice(layout: DeckLayout): Point[][] {
    const slots = layout.slots;
    const p0 = slots.at(0)?.position;
    const p1 = slots.at(1)?.position;
    const p2 = slots.at(2)?.position;
    const p3 = slots.at(3)?.position;
    if (!p0 || !p1 || !p2 || !p3) return [];
    const w = CARD_W * 0.5;
    const h = CARD_H * 0.5;
    if (layout.portrait) {
      // A ring around the 2 x 2 and a cross through its gaps.
      const cx = (p0.x + p3.x) / 2;
      const cy = (p0.y + p3.y) / 2;
      const ex = Math.abs(p1.x - p0.x) / 2 + w * 1.14;
      const ey = Math.abs(p0.y - p2.y) / 2 + h * 1.1;
      const ring: Point[] = [
        [cx - ex, cy + ey],
        [cx, cy + ey * 1.04],
        [cx + ex, cy + ey],
        [cx + ex * 1.04, cy],
        [cx + ex, cy - ey],
        [cx, cy - ey * 1.04],
        [cx - ex, cy - ey],
        [cx - ex * 1.04, cy],
        [cx - ex, cy + ey],
      ];
      return [
        ring,
        [
          [cx, cy + ey * 1.04],
          [cx, cy],
          [cx, cy - ey * 1.04],
        ],
        [
          [cx - ex * 1.04, cy],
          [cx, cy],
          [cx + ex * 1.04, cy],
        ],
      ];
    }
    // A row: a chain above, a chain below, a link down every gap and past both ends.
    const y0 = (p0.y + p1.y + p2.y + p3.y) / 4;
    const top = y0 + h * 1.13;
    const bottom = y0 - h * 1.13;
    const xs = [
      p0.x - w * 1.42,
      (p0.x + p1.x) / 2,
      (p1.x + p2.x) / 2,
      (p2.x + p3.x) / 2,
      p3.x + w * 1.42,
    ];
    const lift = (g: number) => (g % 2 === 0 ? 1 : -1) * h * 0.07;
    const upper: Point[] = xs.map((x, g) => [x, top + lift(g)]);
    const lower: Point[] = xs.map((x, g) => [x, bottom - lift(g)]);
    const out: Point[][] = [upper, lower];
    xs.forEach((x, g) => {
      const outer = g === 0 || g === 4;
      const bend = outer ? (g === 0 ? -w * 0.32 : w * 0.32) : 0;
      out.push([
        [x, top + lift(g)],
        [x + bend, y0 + h * 0.08 * (g % 2 === 0 ? 1 : -1)],
        [x, bottom - lift(g)],
      ]);
    });
    return out;
  }

  private constellation(input: ThreadInputs, ink: Rgb, inkAlpha: number, time: number) {
    const { beats, layout } = input;
    const draw =
      fit(beats.turn, 0.7, 1, 0, 1) *
      (1 - smoothstep(0.01, 0.1, beats.gather)) *
      (beats.drop > 0 ? 0 : 1);
    if (draw <= 0.001) return;
    const first = layout.slots.at(0);
    if (!first) return;
    const z = first.position.z - 0.02;
    const lines = this.lattice(layout);
    const row = this.rowConstellation;
    // Samples by length, within the row's budget; a dead point between polylines breaks them.
    const lengths = lines.map((line) => polylineLength(line));
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    const budget = SAMPLES - lines.length - 2;
    let i = 0;
    const slotX = layout.slots.map((slot) => slot.position.x);
    lines.forEach((line, n) => {
      const count = Math.max(6, Math.floor(((lengths.at(n) ?? 0) / total) * budget));
      // Each polyline draws in on its own stretch of the progress.
      const start = (n / Math.max(1, lines.length)) * 0.45;
      const shown = saturate((draw - start) / 0.55);
      for (let j = 0; j < count && i < SAMPLES - 1; j += 1) {
        const u = j / (count - 1);
        if (u > shown) break;
        const [x, y] = pointOn(line, u);
        // Beside a hovered card the links take its colour.
        let r = ink[0];
        let g = ink[1];
        let b = ink[2];
        let a = inkAlpha * 1.05;
        slotX.forEach((sx, k) => {
          const hover = input.hover.at(k) ?? 0;
          if (hover < 0.01) return;
          const near = Math.exp(-(((x - sx) / (CARD_W * 0.75)) ** 2)) * hover;
          const accent = ACCENT_RGB.get(STORY_CARDS.at(k)?.accent ?? "blue") ?? YELLOW;
          r = mix(r, accent[0], near);
          g = mix(g, accent[1], near);
          b = mix(b, accent[2], near);
          a += near * 0.3;
        });
        const shimmer = 0.85 + 0.15 * Math.sin(time * 1.7 + u * 9 + n);
        this.field.point(row, i, x, y, z, 0.85, r, g, b, a * shimmer);
        i += 1;
      }
      i += 1;
    });
    // The stars: every vertex once, twinkling, tinted by the nearest card.
    const seen = new Set<string>();
    let star = 1;
    lines.forEach((line) => {
      line.forEach(([x, y]) => {
        const key = `${x.toFixed(4)},${y.toFixed(4)}`;
        if (seen.has(key) || star >= this.stars.capacity) return;
        seen.add(key);
        let nearest = 0;
        let best = Infinity;
        slotX.forEach((sx, k) => {
          const d = Math.abs(x - sx);
          if (d < best) {
            best = d;
            nearest = k;
          }
        });
        const accent = ACCENT_RGB.get(STORY_CARDS.at(nearest)?.accent ?? "blue") ?? YELLOW;
        const appear = smoothstep(0.1 + (star % 7) * 0.06, 0.3 + (star % 7) * 0.06, draw);
        const twinkle = 0.7 + 0.3 * Math.sin(time * 2.3 + star * 1.9);
        const hover = input.hover.at(nearest) ?? 0;
        this.stars.star(
          star,
          x,
          y,
          z + 0.001,
          (8 + hover * 5) * appear * twinkle,
          mix(ink[0], accent[0], 0.45 + hover * 0.5),
          mix(ink[1], accent[1], 0.45 + hover * 0.5),
          mix(ink[2], accent[2], 0.45 + hover * 0.5),
          0.8 * appear,
          star * 0.4 + time * 0.25,
        );
        star += 1;
      });
    });
  }

  // ------------------------------------------------------------------ 5. the stage line

  private stageLine(input: ThreadInputs, ink: Rgb, inkAlpha: number, time: number) {
    const { beats, layout, view } = input;
    const live =
      smoothstep(0.55, 1, beats.draw) *
      (1 - smoothstep(0.05, 0.22, beats.gather)) *
      (beats.drop > 0 ? 0 : 1);
    if (live <= 0.001) return;
    const p0 = layout.slots.at(0)?.position;
    const p3 = layout.slots.at(3)?.position;
    if (!p0 || !p3) return;
    const w = CARD_W * 0.5;
    const h = CARD_H * 0.5;
    const z = p0.z - 0.03;
    const cx = (p0.x + p3.x) / 2;
    const low = Math.min(p0.y, p3.y);
    const y = low - h * (layout.portrait ? 1.35 : 1.42);
    const half = Math.abs(p3.x - p0.x) / 2 + w * (layout.portrait ? 1.3 : 1.7);
    // Teeth in screen px at the line's depth: 7 px high, 22 px apart.
    const perPx = (2 * (STAGE_DISTANCE - z) * view.tanHalf) / Math.max(1, view.height);
    const amp = 3.5 * perPx;
    const period = 22 * perPx;
    const reach = half * smoothstep(0.55, 1, beats.draw);
    const n = SAMPLES;
    const slotX = layout.slots.map((slot) => slot.position.x);
    for (let i = 0; i < n; i += 1) {
      const u = i / (n - 1);
      const x = cx - half + 2 * half * u;
      if (Math.abs(x - cx) > reach) {
        continue;
      }
      const phase = (x - cx) / period;
      const tooth = Math.abs((((phase % 1) + 1) % 1) * 2 - 1) * 2 - 1;
      // Pulses: each card's colour runs out from it as it turns.
      let pulse = 0;
      let rgb: Rgb = ink;
      slotX.forEach((sx, k) => {
        const [a, b] = turnWindow(k, layout.portrait);
        const p = fit(beats.turn, a + (b - a) * 0.5, b + 0.1, 0, 1);
        if (p <= 0 || p >= 1) return;
        const d = Math.abs(Math.abs(x - sx) - p * half * 1.4);
        const amount = Math.exp(-((d / (half * 0.08)) ** 2)) * Math.sin(p * Math.PI);
        if (amount > pulse) {
          pulse = amount;
          rgb = ACCENT_RGB.get(STORY_CARDS.at(k)?.accent ?? "blue") ?? YELLOW;
        }
      });
      const ends = smoothstep(reach, reach * 0.86, Math.abs(x - cx));
      const breath = 0.85 + 0.15 * Math.sin(time * 1.2 - u * 7);
      const alpha = (inkAlpha * 0.9 * breath + pulse * 0.8) * live * ends;
      this.field.point(
        this.rowStage,
        i,
        x,
        y + tooth * amp,
        z,
        0.9 + pulse * 1.1,
        mix(ink[0], rgb[0], pulse),
        mix(ink[1], rgb[1], pulse),
        mix(ink[2], rgb[2], pulse),
        alpha,
      );
    }
  }

  /** Forgets the strings' motion (a jump). */
  reset() {
    for (const strand of this.strands) strand.live = false;
  }

  dispose() {
    this.field.dispose();
    this.stars.dispose();
  }
}

function polylineLength(line: readonly Point[]) {
  let length = 0;
  for (let i = 1; i < line.length; i += 1) {
    const a = line.at(i - 1);
    const b = line.at(i);
    if (a && b) length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

/** The point at share `u` of a polyline's length. */
function pointOn(line: readonly Point[], u: number): Point {
  const total = polylineLength(line);
  let left = u * total;
  for (let i = 1; i < line.length; i += 1) {
    const a = line.at(i - 1);
    const b = line.at(i);
    if (!a || !b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= length || i === line.length - 1) {
      const k = length > 0 ? Math.min(1, left / length) : 0;
      return [mix(a[0], b[0], k), mix(a[1], b[1], k)];
    }
    left -= length;
  }
  return line.at(0) ?? [0, 0];
}
