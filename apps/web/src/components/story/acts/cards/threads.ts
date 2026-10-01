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
 *    the cursor, and carry each card's colour across the screen when it
 *    turns.
 * 2. The spine: the stream's own path, drawn from its last card to just
 *    ahead of its first, with a glowing head: the cards ride the line.
 * 3. Puppet strings: two threads from each drawn card's top corners up out
 *    of the frame, simulated (verlet), swinging with the card, taut when
 *    it is hovered, cut when the gather snaps the cards face down.
 * 4. Constellations: small four-point stars between the four, linked by
 *    hairlines drawn in once they are revealed, twinkling.
 * 5. The zigzag frame (the card back's border) along the screen's edges,
 *    pulsing in a card's colour as it turns.
 */

type Rgb = readonly [number, number, number];

const ACCENT_RGB: ReadonlyMap<string, Rgb> = new Map<string, Rgb>([
  ["blue", [58 / 255, 109 / 255, 197 / 255]],
  ["red", [249 / 255, 65 / 255, 65 / 255]],
  ["green", [15 / 255, 134 / 255, 87 / 255]],
  ["yellow", [247 / 255, 191 / 255, 51 / 255]],
]);
const INK_LIGHT: Rgb = [14 / 255, 17 / 255, 22 / 255];
const INK_DARK: Rgb = [1, 1, 1];
const YELLOW: Rgb = [247 / 255, 191 / 255, 51 / 255];

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
  private readonly rowZigzag: number;
  private readonly strands: Strand[] = [];
  private readonly cursor = { x: 0, y: 0, strength: 0 };
  private lastTime = 0;

  constructor(stage: Group, tier: StoryTier) {
    this.braidLines = tier === "low" ? 6 : tier === "medium" ? 8 : 9;
    this.braidSamples = tier === "low" ? 110 : tier === "medium" ? 150 : 200;
    // Rows: two braids, the spine, the strings, a constellation, the zigzag frame.
    this.rowSpine = this.braidLines * 2;
    this.rowStrings = this.rowSpine + 1;
    this.rowConstellation = this.rowStrings + ROWS_STRINGS;
    this.rowZigzag = this.rowConstellation + 1;
    this.field = new ThreadField(this.rowZigzag + 1);
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
    field.setViewport(ctx.size.width, ctx.size.height, ctx.size.dpr);
    this.stars.setPixelRatio(ctx.size.dpr);
    field.clear();
    this.stars.clear();
    const ink = ctx.palette.scheme === "dark" ? INK_DARK : INK_LIGHT;
    const inkAlpha = ctx.palette.scheme === "dark" ? 0.24 : 0.19;

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
    this.spine(input, ink, inkAlpha);
    this.strings(input, ink, inkAlpha, dt, time);
    this.constellation(input, ink, inkAlpha, time);
    this.zigzag(input, ink, time);
    field.commit();
    this.stars.commit();
  }

  // ------------------------------------------------------------------ 1. guilloche braids

  private braids(input: ThreadInputs, ink: Rgb, inkAlpha: number, time: number) {
    const { view, beats, t } = input;
    const lines = this.braidLines;
    const samples = this.braidSamples;
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
          const nx = x / 1.0;
          const dx = (nx - this.cursor.x) * view.aspect;
          const dy = y - this.cursor.y;
          const d2 = dx * dx + dy * dy;
          if (this.cursor.strength > 0.01 && d2 < 0.2) {
            const push = Math.exp(-d2 / 0.012) * 0.09 * this.cursor.strength;
            y += dy >= 0 ? push : -push;
          }
          // The head glows a little brighter; the tail fades in.
          const tip = smoothstep(head - 0.08, head, u);
          const ends = smoothstep(0, 0.06, u) * (1 - smoothstep(0.94, 1, u));
          let r = ink[0];
          let g = ink[1];
          let b = ink[2];
          const pulse = this.revealPulse(input, x, row);
          if (pulse.amount > 0.001) {
            r = mix(r, pulse.rgb[0], pulse.amount);
            g = mix(g, pulse.rgb[1], pulse.amount);
            b = mix(b, pulse.rgb[2], pulse.amount);
          }
          const alpha = (inkAlpha + pulse.amount * 0.4) * fade * ends * (1 + tip * 0.8);
          this.field.point(
            row,
            i,
            x * hx,
            y * hy,
            z,
            (band === 0 ? 1.1 : 0.9) + tip * 0.8,
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

  private spine(input: ThreadInputs, ink: Rgb, inkAlpha: number) {
    const { stream, layout } = input;
    if (stream.on <= 0.001) return;
    const path = stream.back ? layout.back : layout.snake;
    const lead = 0.06;
    const from = Math.max(0, stream.tail - 0.04);
    const to = Math.min(path.length, stream.head + lead);
    if (to - from < 0.01) return;
    const n = SAMPLES;
    for (let i = 0; i < n; i += 1) {
      const u = i / (n - 1);
      const s = mix(from, to, u);
      path.point(s, va);
      // Fades in from the tail, glows at the first card, thins to nothing just ahead of it.
      const ahead = smoothstep(stream.head, to, s);
      const tail = smoothstep(0, 0.25, u);
      const glow = Math.exp(-(((s - stream.head) / 0.05) ** 2));
      const r = mix(ink[0], YELLOW[0], glow);
      const g = mix(ink[1], YELLOW[1], glow);
      const b = mix(ink[2], YELLOW[2], glow);
      const alpha = (inkAlpha * 1.7 * tail * (1 - ahead) + glow * 0.75) * stream.on;
      this.field.point(
        this.rowSpine,
        i,
        va.x,
        va.y,
        va.z,
        1.3 + glow * 2.2 - ahead,
        r,
        g,
        b,
        alpha,
      );
    }
    // A star at the head: the magic leading the deck.
    path.point(Math.min(path.length, stream.head + 0.012), vb);
    this.stars.star(
      0,
      vb.x,
      vb.y,
      vb.z + 0.002,
      14 * stream.on,
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

  // ------------------------------------------------------------------ 4. constellations

  private constellation(input: ThreadInputs, ink: Rgb, inkAlpha: number, time: number) {
    const { beats, layout } = input;
    const draw =
      fit(beats.turn, 0.78, 1, 0, 1) *
      (1 - smoothstep(0.01, 0.1, beats.gather)) *
      (beats.drop > 0 ? 0 : 1);
    if (draw <= 0.001) return;
    const slots = layout.slots;
    const first = slots.at(0);
    if (!first) return;
    const z = first.position.z - 0.025;
    // Star places: around and between the four (row) or the grid (2 x 2).
    const points: [number, number][] = [];
    const w = CARD_W * 0.5;
    const h = CARD_H * 0.5;
    if (layout.portrait) {
      const a = slots.at(0)?.position ?? va;
      const d = slots.at(3)?.position ?? va;
      const cx = (a.x + d.x) / 2;
      const cy = (a.y + d.y) / 2;
      const ex = Math.abs(d.x - a.x) / 2 + w * 1.12;
      const ey = Math.abs(d.y - a.y) / 2 + h * 1.08;
      points.push(
        [cx - ex, cy + ey * 0.4],
        [cx - ex * 0.5, cy + ey],
        [cx, cy + ey * 0.15],
        [cx + ex * 0.5, cy + ey],
        [cx + ex, cy + ey * 0.4],
      );
      points.push(
        [cx + ex, cy - ey * 0.4],
        [cx + ex * 0.5, cy - ey],
        [cx, cy - ey * 0.15],
        [cx - ex * 0.5, cy - ey],
        [cx - ex, cy - ey * 0.4],
      );
    } else {
      for (let k = 0; k <= 4; k += 1) {
        const left = slots.at(Math.max(0, k - 1))?.position.x ?? 0;
        const right = slots.at(Math.min(3, k))?.position.x ?? 0;
        const gapX = k === 0 ? left - w * 1.25 : k === 4 ? right + w * 1.25 : (left + right) / 2;
        const y = first.position.y + (k % 2 === 0 ? h * 1.16 : -h * 1.16);
        points.push([gapX, y]);
      }
      for (let k = 4; k >= 0; k -= 1) {
        const pt = points.at(k);
        if (pt) points.push([pt[0], first.position.y + (k % 2 === 0 ? -h * 1.24 : h * 1.24)]);
      }
    }
    const row = this.rowConstellation;
    const count = points.length;
    const per = Math.floor((SAMPLES - 1) / Math.max(1, count - 1));
    let i = 0;
    for (let p = 0; p < count - 1 && i < SAMPLES - 1; p += 1) {
      const [x0, y0] = points.at(p) ?? [0, 0];
      const [x1, y1] = points.at(p + 1) ?? [0, 0];
      const segStart = p / (count - 1);
      for (let j = 0; j < per && i < SAMPLES; j += 1) {
        const u = j / per;
        const along = segStart + u / (count - 1);
        if (along > draw * 1.02) break;
        this.field.point(
          row,
          i,
          mix(x0, x1, u),
          mix(y0, y1, u),
          z,
          0.8,
          ink[0],
          ink[1],
          ink[2],
          inkAlpha * 0.9,
        );
        i += 1;
      }
    }
    points.forEach(([x, y], p) => {
      const appear = smoothstep(p / count, p / count + 0.12, draw);
      const twinkle = 0.75 + 0.25 * Math.sin(time * 2.2 + p * 1.9);
      const accent = ACCENT_RGB.get(STORY_CARDS.at(p % 4)?.accent ?? "blue") ?? YELLOW;
      this.stars.star(
        1 + p,
        x,
        y,
        z,
        9 * appear * twinkle,
        mix(ink[0], accent[0], 0.35),
        mix(ink[1], accent[1], 0.35),
        mix(ink[2], accent[2], 0.35),
        0.75 * appear,
        p * 0.4 + time * 0.2,
      );
    });
  }

  // ------------------------------------------------------------------ 5. the zigzag frame

  private zigzag(input: ThreadInputs, ink: Rgb, time: number) {
    const { beats, view } = input;
    const live =
      smoothstep(0.6, 1, beats.draw) *
      (1 - smoothstep(0.05, 0.25, beats.gather)) *
      (beats.drop > 0 ? 0 : 1);
    if (live <= 0.001) return;
    const depth = STAGE_DISTANCE - (input.layout.slots.at(0)?.position.z ?? 0) + 0.08;
    const hx = halfWidthAt(view, depth) * 0.94;
    const hy = halfHeightAt(view, depth) * 0.9;
    const z = STAGE_DISTANCE - depth;
    const perimeter = 4 * (hx + hy);
    const teeth = 64;
    const amp = Math.min(hx, hy) * 0.018;
    const n = SAMPLES;
    for (let i = 0; i < n; i += 1) {
      const u = i / (n - 1);
      const s = u * perimeter;
      // Walk the frame clockwise from the top left corner.
      let x: number;
      let y: number;
      let nx: number;
      let ny: number;
      if (s < 2 * hx) {
        x = -hx + s;
        y = hy;
        nx = 0;
        ny = 1;
      } else if (s < 2 * hx + 2 * hy) {
        x = hx;
        y = hy - (s - 2 * hx);
        nx = 1;
        ny = 0;
      } else if (s < 4 * hx + 2 * hy) {
        x = hx - (s - 2 * hx - 2 * hy);
        y = -hy;
        nx = 0;
        ny = -1;
      } else {
        x = -hx;
        y = -hy + (s - 4 * hx - 2 * hy);
        nx = -1;
        ny = 0;
      }
      const tooth = Math.abs(((u * teeth) % 1) * 2 - 1) * 2 - 1;
      x += nx * tooth * amp;
      y += ny * tooth * amp;
      // Pulses: each card's colour runs round the frame as it turns.
      let pulse = 0;
      let rgb: Rgb = ink;
      for (let k = 0; k < 4; k += 1) {
        const [a, b] = turnWindow(k, input.layout.portrait);
        const p = fit(beats.turn, a + (b - a) * 0.5, b + 0.08, 0, 1);
        if (p <= 0 || p >= 1) continue;
        const d = Math.abs(((u - p + 1.5) % 1) - 0.5);
        const amount = Math.exp(-(d * d) / 0.004) * Math.sin(p * Math.PI);
        if (amount > pulse) {
          pulse = amount;
          rgb = ACCENT_RGB.get(STORY_CARDS.at(k)?.accent ?? "blue") ?? YELLOW;
        }
      }
      const idle = 0.06 + 0.03 * Math.sin(u * 40 - time * 1.5);
      const alpha = (idle + pulse * 0.85) * live;
      this.field.point(
        this.rowZigzag,
        i,
        x,
        y,
        z,
        0.9 + pulse * 1.2,
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
