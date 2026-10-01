import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import { CARD_H, CARD_W } from "@/components/story/props/card-mesh";
import type { DeckBox } from "@/components/story/props/deck-box";
import { DeckPath } from "@/components/story/acts/cards/deck-path";
import {
  STAGE_DISTANCE,
  depthForHeight,
  springPull,
  halfHeightAt,
  halfWidthAt,
  screenToStage,
  underHeader,
  type StageView,
} from "@/components/story/acts/cards/stage-space";

/**
 * Where the deck goes, for the current viewport: the spring and snake path
 * out of the box, the return path for the gather, the stack and pressure
 * fan, the wheel behind the drawn four, and the four reveal slots (a row on
 * landscape screens, 2 x 2 on portrait ones), plus the big centre spot a
 * portrait reveal and the focus mode use. Everything is in the stage frame
 * (x right, y up, z toward the camera), laid out from screen fractions at a
 * depth so it fits any aspect. Rebuilt when the size changes.
 */

const DEG = Math.PI / 180;

/** Screen fraction (x, y in -1..1) and depth (metres from the resting camera). */
type ViewPoint = readonly [number, number, number];

/**
 * The spring's arc out of the box mouth (CREATIVE 4, "the spring"): up and to
 * the right, curling over, as shares of the spring frame's half width and
 * half height at the box (x, y above the mouth) and metres toward the lens.
 */
const SPRING_ARC: readonly ViewPoint[] = [
  [0.12, 0.1, 0.02],
  [0.34, 0.17, 0.035],
  [0.54, 0.1, 0.04],
  [0.64, -0.08, 0.02],
];

/**
 * The spring on a portrait screen: the screen is narrow and a card is a
 * third of its half width, so the arc climbs, curls right and leaves away
 * from the lens toward the snake's start, which lies deeper.
 */
const SPRING_ARC_PORTRAIT: readonly ViewPoint[] = [
  [0.08, 0.1, 0.0],
  [0.24, 0.24, -0.04],
  [0.36, 0.27, -0.1],
  [0.4, 0.14, -0.17],
];

/**
 * The snake on a landscape screen after the spring's arc (`SPRING_ARC`): down the right, a loop
 * near the lens, a far meander, the pour.
 */
const SNAKE_LANDSCAPE: readonly ViewPoint[] = [
  [0.66, 0.3, 1.3],
  [0.64, -0.4, 1.15],
  [0.2, -0.66, 1.0],
  [-0.45, -0.52, 1.05],
  [-0.8, -0.05, 1.3],
  [-0.62, 0.52, 1.6],
  [-0.05, 0.66, 1.9],
  [0.55, 0.55, 2.0],
  [0.8, 0.0, 1.85],
  [0.5, -0.5, 1.7],
  [-0.2, -0.48, 1.6],
  [-0.48, 0.12, 1.5],
  [-0.05, 0.56, 1.36],
  [0.24, 0.24, 1.2],
];

/** The snake on a portrait screen after the spring's arc: the same story, stacked vertically. */
const SNAKE_PORTRAIT: readonly ViewPoint[] = [
  [0.42, 0.06, 1.2],
  [-0.28, -0.18, 1.1],
  [-0.58, -0.48, 1.15],
  [-0.16, -0.7, 1.2],
  [0.5, -0.62, 1.35],
  [0.6, -0.14, 1.55],
  [0.22, 0.26, 1.75],
  [-0.5, 0.46, 1.8],
  [-0.56, 0.74, 1.7],
  [0.18, 0.7, 1.55],
  [0.5, 0.32, 1.4],
  [-0.26, 0.14, 1.25],
];

/** The gather's return: off the top of the wheel, a sweep around the frame, back down into the box. */
const RETURN_LANDSCAPE: readonly ViewPoint[] = [
  [-0.32, 0.62, 1.3],
  [-0.78, 0.16, 1.45],
  [-0.48, -0.55, 1.5],
  [0.32, -0.58, 1.42],
  [0.62, 0.06, 1.3],
  [0.24, 0.42, 1.1],
];

const RETURN_PORTRAIT: readonly ViewPoint[] = [
  [-0.3, 0.56, 1.3],
  [-0.6, 0.14, 1.4],
  [-0.36, -0.5, 1.45],
  [0.36, -0.52, 1.38],
  [0.56, 0.06, 1.25],
  [0.2, 0.36, 1.05],
];

export type Slot = {
  /** Centre, stage frame. */
  readonly position: Vector3;
  /** Card scale at the slot (1: the card's real size). */
  scale: number;
};

export class DeckLayout {
  readonly snake = new DeckPath();
  readonly back = new DeckPath();
  readonly slots: Slot[] = [0, 1, 2, 3].map(() => ({ position: new Vector3(), scale: 1 }));
  /** The big spot at the centre for a portrait reveal. */
  readonly centre: Slot = { position: new Vector3(), scale: 1 };
  /** A card's closer look: big, a little above the centre, with room under it for its link. */
  readonly focus: Slot = { position: new Vector3(), scale: 1 };
  /** The stack the snake pours into, and the fan's common pivot below it. */
  readonly stack = new Vector3();
  readonly pivot = new Vector3();
  /** The wheel behind the drawn four. */
  readonly ring = new Vector3();
  ringRadius = 0.03;
  ringScale = 0.86;
  /** The fan's full spread, radians. */
  fanSpread = 200 * DEG;
  portrait = false;
  /** Box frame to stage frame, at the box's rest pose on the card stage. */
  readonly boxToStage = new Matrix4();
  /** A card standing in the box (its back to the box front), in the stage frame. */
  readonly cardInBox = new Quaternion();
  /**
   * Distance along a path at which a card leaving the box has cleared the
   * rim (its bottom edge above the box's top): until then it rises straight
   * along the box's own up axis, upright in the box's plane, with no spin,
   * roll or flex, so it never cuts a wall. The return mirrors it.
   */
  exitLength = 0.09;
  private key = "";

  /** Recomputes for this viewport (cheap when nothing changed). */
  update(view: StageView, box: DeckBox, restYaw: number, restLean: number) {
    const key = `${view.width}x${view.height}`;
    if (key === this.key) return false;
    this.key = key;
    this.portrait = view.aspect < 0.85;
    const portrait = this.portrait;

    // The box at rest on the stage: yaw about y, the top leaning toward us (about the box's z).
    // Box frame: +x the front normal; stage frame: +z toward the camera, so a quarter turn.
    const rest = new Matrix4().makeRotationFromEuler(new Euler(0, restYaw, -restLean, "YZX"));
    this.boxToStage.makeRotationY(-Math.PI / 2).multiply(rest);

    const H = box.dims.H;
    this.cardInBox
      .setFromRotationMatrix(this.boxToStage)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
    // The exit, along the box's up axis: the card starts whole inside (its bottom 2 mm above the
    // box's floor), and clears the rim (its bottom 6 mm above the top) at `exitLength`.
    const start = -H / 2 + CARD_H / 2 + 0.002;
    const clear = H / 2 + CARD_H / 2 + 0.006;
    this.exitLength = clear - start;
    const along = (y: number) => new Vector3(0, y, 0).applyMatrix4(this.boxToStage);
    const exit = [along(start), along(start + 0.04), along(clear), along(clear + 0.02)];
    const mouthOut = exit.at(-1) ?? along(clear);

    // The fan and the wheel sit far enough back to fit the screen.
    const spread = (portrait ? 140 : 200) * DEG;
    this.fanSpread = spread;
    const fanHalfWidth =
      (spread > Math.PI ? CARD_H : CARD_H * Math.sin(spread / 2)) * 0.95 + CARD_W / 2;
    const fanDepth = Math.max(1.04, fanHalfWidth / (0.86 * view.tanHalf * view.aspect));
    this.ringRadius = 0.03;
    this.ringScale = 0.86;
    const ringOuter = this.ringRadius + CARD_H * this.ringScale;
    // The wheel fits the width on a portrait screen, and the height under the header otherwise.
    const ringFit = portrait
      ? 0.86 * view.tanHalf * view.aspect
      : Math.min(0.9, view.safeTop - 0.08) * view.tanHalf;
    const ringDepth = Math.max(1.12, ringOuter / Math.max(1e-3, ringFit));
    screenToStage(view, 0, -0.04, fanDepth, this.stack);
    this.stack.y -= CARD_H * 0.06;
    this.pivot.copy(this.stack);
    this.pivot.y -= CARD_H * 0.4;
    screenToStage(view, 0, portrait ? 0.02 : 0.04, ringDepth, this.ring);

    // The snake: out of the box mouth, the spring's arc, through the screen, the pour into the stack.
    const snake = exit.map((point) => point.clone());
    const springDistance = STAGE_DISTANCE + springPull(view);
    const springHalfH = springDistance * view.tanHalf;
    const springHalfW = springHalfH * view.aspect;
    for (const [ax, ay, az] of portrait ? SPRING_ARC_PORTRAIT : SPRING_ARC) {
      snake.push(mouthOut.clone().add(new Vector3(ax * springHalfW, ay * springHalfH, az)));
    }
    // The sweeps are laid out on the whole screen and kept under the header.
    for (const [nx, ny, d] of portrait ? SNAKE_PORTRAIT : SNAKE_LANDSCAPE) {
      const depth = d * (fanDepth / 1.04);
      snake.push(screenToStage(view, nx, underHeader(view, ny), depth, new Vector3()));
    }
    snake.push(this.stack.clone().add(new Vector3(0, CARD_H * 0.32, 0)));
    snake.push(this.stack.clone());
    this.snake.build(snake);

    // The return: from the wheel's top, around, into the box.
    const top = this.ring.clone().add(new Vector3(0, this.ringRadius + CARD_H * 0.5, 0));
    const back = [top];
    for (const [nx, ny, d] of portrait ? RETURN_PORTRAIT : RETURN_LANDSCAPE) {
      back.push(screenToStage(view, nx, underHeader(view, ny), d, new Vector3()));
    }
    back.push(mouthOut.clone().add(new Vector3(0, 0.03, 0)));
    for (const point of [...exit].reverse()) back.push(point.clone());
    this.back.build(back);

    // The reveal slots.
    const W = view.width;
    const Hpx = view.height;
    if (portrait) {
      const cardPx = Math.min(0.37 * W, 0.3 * Hpx * (CARD_W / CARD_H));
      const gap = Math.max(0.045 * W, 12);
      const heightPx = (cardPx * CARD_H) / CARD_W;
      const depth = depthForHeight(view, CARD_H, heightPx);
      const dx = (cardPx + gap) / 2 / (W / 2);
      const dy = (heightPx + gap) / 2 / (Hpx / 2);
      const lift = 0.05;
      this.slots.forEach((slot, k) => {
        const col = k % 2;
        const row = Math.floor(k / 2);
        screenToStage(
          view,
          col === 0 ? -dx : dx,
          (row === 0 ? dy : -dy) + lift,
          depth,
          slot.position,
        );
        slot.scale = 1;
      });
      const bigPx = 0.78 * W;
      const bigDepth = depthForHeight(
        view,
        CARD_H,
        Math.min((bigPx * CARD_H) / CARD_W, 0.66 * Hpx),
      );
      screenToStage(view, 0, 0.04, bigDepth, this.centre.position);
      const focusDepth = depthForHeight(
        view,
        CARD_H,
        Math.min((0.7 * W * CARD_H) / CARD_W, 0.55 * Hpx),
      );
      screenToStage(view, 0, 0.1, focusDepth, this.focus.position);
    } else {
      // A row in the part of the screen under the header (a short landscape screen has little).
      const usable = (Hpx * (view.safeTop + 1)) / 2;
      const cardPx = Math.min(0.19 * W, 0.56 * usable * (CARD_W / CARD_H));
      const gap = Math.max(0.02 * W, 14);
      const heightPx = (cardPx * CARD_H) / CARD_W;
      const depth = depthForHeight(view, CARD_H, heightPx);
      const step = (cardPx + gap) / (W / 2);
      const rowY = underHeader(view, 0.1);
      this.slots.forEach((slot, k) => {
        screenToStage(view, (k - 1.5) * step, rowY, depth, slot.position);
        slot.scale = 1;
      });
      const bigDepth = depthForHeight(view, CARD_H, 0.7 * Hpx);
      screenToStage(view, 0, 0.04, bigDepth, this.centre.position);
      screenToStage(view, 0, 0.09, depthForHeight(view, CARD_H, 0.62 * Hpx), this.focus.position);
    }
    this.centre.scale = 1;
    return true;
  }

  /** Forces a rebuild on the next update (the box or the tier changed). */
  invalidate() {
    this.key = "";
  }
}

/** Half extents of the resting view at the stack's depth (for the cursor's reach). */
export function viewHalf(view: StageView, z: number) {
  const depth = STAGE_DISTANCE - z;
  return { x: halfWidthAt(view, depth), y: halfHeightAt(view, depth) };
}
