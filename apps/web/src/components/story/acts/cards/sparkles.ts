import { Vector3, type Group } from "three";

import { OneShot, type StoryContext, type StoryTier } from "@/components/story/engine/act";
import { CARD_H } from "@/components/story/props/card-mesh";
import { createSparkleBurst, type SparkleBurst } from "@/components/story/props/fx/sparkle-burst";
import type { CardPose, DeckBeats } from "@/components/story/acts/cards/deck-motion";
import type { DeckLayout } from "@/components/story/acts/cards/deck-layout";
import { turnWindow } from "@/components/story/acts/cards/hero-cards";
import { worldToStage } from "@/components/story/acts/cards/stage-space";

/**
 * The act's little cheers (REQUEST: "micro animations like congratulating"):
 * bursts of four-point stars in the brand colours, from the deck's own
 * sparkle prop.
 *
 * - The lid swings open: dust sparkles lift out of the box.
 * - Each card lands face up: a burst from its face.
 * - A closer look opens, or the box hops under a click: a cheer.
 * - The lid shuts at the end of the gather: a last puff.
 *
 * The scroll's bursts fire on a calm forward crossing only (a fling or a
 * jump fires nothing, and the way back is quiet), then play on the clock,
 * so a visitor who stops mid-scroll never sees one frozen half way. One
 * system for the light page (normal blending, saturated colours; light
 * added to white vanishes) and one for the dark page; only the one for
 * the scheme draws, and only while a burst is alive.
 */

const LIFE = 1.1;
const SLOT_OPEN = 0;
const SLOT_CLOSE = 5;
const SLOT_CHEER = 6;
const SLOT_HOP = 7;

const origin = new Vector3();
const local = new Vector3();

export class Sparkles {
  private readonly light: SparkleBurst;
  private readonly dark: SparkleBurst;
  private readonly open = new OneShot();
  private readonly close = new OneShot();
  private readonly lands = [new OneShot(), new OneShot(), new OneShot(), new OneShot()];
  /** Clock time until which a burst is alive (the systems are hidden after it). */
  private alive = -1;
  private time = 0;
  private scheme: "light" | "dark" = "light";

  constructor(stage: Group, tier: StoryTier) {
    const count = tier === "low" ? 14 : tier === "medium" ? 20 : 26;
    const shared = { count, slots: 8, life: LIFE, size: 0.0075, speed: 0.2, gravity: 0.07 };
    this.light = createSparkleBurst({ ...shared, onLight: true });
    this.dark = createSparkleBurst(shared);
    for (const burst of [this.light, this.dark]) {
      burst.points.name = "cards-sparkles";
      burst.points.visible = false;
      stage.add(burst.points);
    }
  }

  /** Shows both systems for a compile pass. */
  warm(on: boolean) {
    this.light.points.visible = on;
    this.dark.points.visible = on;
  }

  private fire(slot: number, at: Vector3, power: number) {
    this.light.place(slot, at, this.time, power);
    this.dark.place(slot, at, this.time, power);
    this.alive = this.time + LIFE + 0.1;
  }

  /** A cheer at a stage point (a closer look opening). */
  cheer(at: Vector3) {
    this.fire(SLOT_CHEER, at, 1);
  }

  /** The box hopped under a click: a pop at its mouth (stage point). */
  hop(at: Vector3) {
    this.fire(SLOT_HOP, at, 0.6);
  }

  /**
   * Every frame. `box` is the box's centre in the room's frame, `boxTop`
   * its mouth as an offset in the stage frame; `heroes` the four's final
   * poses this frame.
   */
  update(
    ctx: StoryContext,
    beats: DeckBeats,
    layout: DeckLayout,
    heroes: readonly CardPose[],
    box: Vector3,
    boxTop: Vector3,
    velocity: number,
  ) {
    this.time = ctx.clock.time;
    this.scheme = ctx.palette.scheme;
    worldToStage(box, local);
    // The lid swings open (c-open past 0.55) and shuts (c-gather past 0.86).
    // Each shot re-arms just before its mark (the warm-up renders every beat once at load).
    if (this.open.cross(beats.open, 0.55, velocity, 3.5, 0.5)) {
      this.fire(SLOT_OPEN, origin.copy(local).add(boxTop), 0.7);
    }
    if (this.close.cross(beats.gather, 0.86, velocity, 3.5, 0.82)) {
      this.fire(SLOT_CLOSE, origin.copy(local).add(boxTop), 0.45);
    }
    // Each card lands face up at the end of its turn.
    this.lands.forEach((shot, k) => {
      const [, end] = turnWindow(k, layout.portrait);
      const at = Math.min(0.995, end);
      if (!shot.cross(beats.turn, at, velocity, 3.5, at - 0.04)) return;
      const pose = heroes.at(k);
      if (!pose) return;
      // From the logo, in the top half of the face.
      origin.copy(pose.position);
      origin.y += CARD_H * 0.23 * pose.scale;
      origin.z += 0.012;
      this.fire(1 + k, origin, 0.8);
    });
    const live = this.time < this.alive;
    const dark = this.scheme === "dark";
    this.light.points.visible = live && !dark;
    this.dark.points.visible = live && dark;
    const height = ctx.size.height * ctx.size.dpr;
    this.light.update(this.time, height);
    this.dark.update(this.time, height);
  }

  /** The act left its window: nothing alive. */
  sleep() {
    this.alive = -1;
    this.light.points.visible = false;
    this.dark.points.visible = false;
  }

  dispose() {
    this.light.dispose();
    this.dark.dispose();
  }
}
