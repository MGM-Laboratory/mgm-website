import { Quaternion, Vector3 } from "three";

import {
  cubicInOut,
  fit,
  mix,
  saturate,
  type StoryContext,
  type StoryTier,
} from "@/components/story/engine/act";
import { STORY_CARDS } from "@/data/story";
import { CardFront } from "@/components/story/acts/cards/card-front";
import type { CardPose, DeckBeats } from "@/components/story/acts/cards/deck-motion";
import type { DeckLayout } from "@/components/story/acts/cards/deck-layout";
import type { DeckView } from "@/components/story/acts/cards/deck-view";

/**
 * The four drawn cards on top of the deck's pure poses (`deck-motion.ts`):
 *
 * - The turn (`c-turn`): each card turns over about its long edge in its own
 *   window (left to right, overlapping), with a small wind up, an overshoot
 *   and a settle, lifting toward the camera and tilting as it turns, a
 *   glint crossing its face as it lands. On a portrait screen each card
 *   comes to the centre big, turns, holds, and settles into its 2 x 2 slot.
 * - The wake: once a face is up, its front (`card-front.ts`) comes alive.
 * - The gather's snap: the four turn face down in a quick domino wave,
 *   latched on a calm forward crossing and scrubbed otherwise.
 *
 * The life layers (hover, focus, idle twirls) are written by the act's
 * interaction layer into `life` and added here.
 */

const DEG = Math.PI / 180;
const qa = new Quaternion();
const zAxis = new Vector3(0, 0, 1);
const xAxis = new Vector3(1, 0, 0);
const yAxis = new Vector3(0, 1, 0);
const centre = new Vector3();

/** Added on top of a hero's pose by the interaction layer (stage frame). */
export type HeroLife = {
  /** Offset toward the camera and up, metres. */
  lift: Vector3;
  /** Tilt toward the pointer about x and y, radians. */
  tiltX: number;
  tiltY: number;
  /** In-plane spin (an idle twirl), radians. */
  spin: number;
  /** 0..1: brought forward to the centre (focus mode). */
  focus: number;
  /** 0..1: stepped back and dimmed (another card has the focus). */
  dim: number;
  /** An extra flip (a playful turn in focus mode), radians. */
  flip: number;
  /** The hover spring, 0..1 (for the front). */
  hover: number;
  /** The pointer on the face, canvas units, or null. */
  pointer: { x: number; y: number } | null;
};

export function createLife(): HeroLife {
  return {
    lift: new Vector3(),
    tiltX: 0,
    tiltY: 0,
    spin: 0,
    focus: 0,
    dim: 0,
    flip: 0,
    hover: 0,
    pointer: null,
  };
}

/** The flip about the long edge for a turn window's progress x: wind up, swing, overshoot, settle. */
function turnCurve(x: number) {
  const base = cubicInOut(fit(x, 0.12, 0.86, 0, 1));
  const windUp = -0.067 * Math.sin(Math.PI * fit(x, 0, 0.32, 0, 1)) * (1 - base);
  const settle = 0.034 * Math.sin(Math.PI * fit(x, 0.7, 1, 0, 1));
  return base + windUp + settle;
}

/** A turn window for card k as [start, end] of `c-turn`. */
export function turnWindow(k: number, portrait: boolean): readonly [number, number] {
  if (portrait) {
    const span = 0.235;
    return [0.04 + span * k, 0.04 + span * (k + 1)];
  }
  // Left to right, overlapping; the last one lands just before the rest at the beat's end.
  return [0.06 + 0.19 * k, 0.42 + 0.19 * k];
}

export class HeroCards {
  readonly fronts: CardFront[];
  readonly life: HeroLife[] = [createLife(), createLife(), createLife(), createLife()];
  /** Each card's flip progress this frame (0 back, 1 face up), for the threads and the hotspots. */
  readonly faceUp = new Float32Array(4);
  private snapStart = -10;
  private snapArmed = true;
  /** Each card's timed snap face down (0..1): rises in its domino slot, unwinds on the way back. */
  private readonly snap = new Float32Array(4);
  private readonly frontOn = new Uint8Array(4);

  constructor(
    private readonly view: DeckView,
    tier: StoryTier,
  ) {
    const width = tier === "low" ? 512 : 768;
    this.fronts = STORY_CARDS.slice(0, 4).map((card, k) => new CardFront(card, k, width));
    void document.fonts.ready.then(() => {
      for (const front of this.fronts) front.refreshFonts();
    });
  }

  /** Writes the four's final poses into the view. `poses` are the deck's pure poses for them. */
  update(ctx: StoryContext, beats: DeckBeats, layout: DeckLayout, velocity: number) {
    const time = ctx.clock.time;
    const dt = ctx.clock.dt;
    const portrait = layout.portrait;

    // The gather's snap face down: a domino wave at real speed, latched on a calm forward
    // crossing; back before the gather it unwinds on the clock, so nothing flips in one frame.
    if (beats.gather <= 0.004) {
      this.snapArmed = true;
      this.snapStart = -10;
    }
    if (this.snapArmed && beats.gather > 0.004 && beats.gather < 0.06) {
      this.snapArmed = false;
      this.snapStart = Math.abs(velocity) < 4 ? time : -10;
    }
    const snapping = this.snapStart > 0;

    for (let k = 0; k < 4; k += 1) {
      const pose = this.view.heroPoses.at(k);
      const front = this.fronts.at(k);
      const life = this.life.at(k);
      if (!pose || !front || !life) continue;
      const [a, b] = turnWindow(k, portrait);
      const x = fit(beats.turn, a, b, 0, 1);
      let face = 0;
      if (beats.draw >= 1) face = portrait ? turnCurve(fit(x, 0.14, 0.62, 0, 1)) : turnCurve(x);
      const snapNow = this.snap.at(k) ?? 0;
      const snapK = snapping
        ? Math.max(snapNow, saturate((time - this.snapStart - 0.06 * k) / 0.15))
        : Math.max(0, snapNow - dt / 0.32);
      this.snap.set([snapK], k);
      if (beats.gather > 0) {
        const scrub = fit(beats.gather, 0.006 + 0.022 * k, 0.07 + 0.022 * k, 0, 1);
        face = Math.min(face, 1 - cubicInOut(scrub));
      }
      face = Math.min(face, 1 - cubicInOut(snapK));
      if (pose.visible && beats.drop <= 0 && (beats.draw > 0 || beats.gather > 0)) {
        if (beats.draw >= 1 && beats.gather <= 0) {
          this.turnPose(k, x, pose, layout, portrait);
        }
        pose.flip = Math.PI * face;
        this.addLife(pose, life, layout);
      }
      this.faceUp.set([saturate(face)], k);

      // The front: the live face once the card is drawn (the generic printed face before, so no
      // spoiler shows during the spring's spins).
      const wantFront = beats.draw > 0 && beats.drop <= 0;
      const hero = this.view.heroes.at(k);
      if (hero && wantFront !== (this.frontOn.at(k) === 1)) {
        hero.card.setFront(wantFront ? front.texture : null);
        this.frontOn.set([wantFront ? 1 : 0], k);
      }
      const shown = pose.visible && face > 0.35;
      front.update(
        {
          awake: face > 0.72 && beats.gather <= 0.05,
          hover: life.hover,
          pointer: life.pointer,
          shown,
        },
        time,
        dt,
      );
      // The glint crossing the face as it lands.
      if (hero) {
        const g = portrait ? fit(x, 0.42, 0.66, 0, 1) : fit(x, 0.5, 1, 0, 1);
        const strength = beats.gather > 0 ? 0 : Math.sin(Math.PI * g) * 0.9;
        hero.card.setGlint(-1.4 + 2.8 * g, strength + life.hover * 0.35, 0.26);
      }
      this.view.placeHero(k, pose);
    }
  }

  /** The reveal's motion on top of the slot pose. */
  private turnPose(k: number, x: number, pose: CardPose, layout: DeckLayout, portrait: boolean) {
    const slot = layout.slots.at(k);
    if (!slot) return;
    let lift = Math.sin(Math.PI * x);
    if (portrait) {
      // To the centre big, turn, hold, back into the 2 x 2 slot.
      const go = cubicInOut(fit(x, 0, 0.3, 0, 1));
      const back = cubicInOut(fit(x, 0.76, 1, 0, 1));
      const at = go * (1 - back);
      centre.copy(layout.centre.position);
      pose.position.copy(slot.position).lerp(centre, at);
      pose.scale = mix(slot.scale, layout.centre.scale, at);
      lift = Math.sin(Math.PI * fit(x, 0.14, 0.62, 0, 1));
    }
    pose.position.z += 0.03 * lift;
    pose.position.y += 0.004 * lift;
    qa.setFromAxisAngle(zAxis, (k % 2 === 0 ? 1 : -1) * 4 * DEG * lift);
    pose.quaternion.multiply(qa);
    pose.curl = 0.1 * lift;
  }

  private addLife(pose: CardPose, life: HeroLife, layout: DeckLayout) {
    pose.position.add(life.lift);
    if (life.focus > 0.001) {
      pose.position.lerp(layout.focus.position, cubicInOut(life.focus));
      pose.scale = mix(pose.scale, layout.focus.scale, cubicInOut(life.focus));
    }
    if (life.dim > 0.001) {
      pose.position.z -= 0.08 * life.dim;
      pose.mist = Math.max(pose.mist, 0.45 * life.dim);
    }
    if (life.tiltX !== 0 || life.tiltY !== 0) {
      qa.setFromAxisAngle(xAxis, life.tiltX);
      pose.quaternion.multiply(qa);
      qa.setFromAxisAngle(yAxis, life.tiltY);
      pose.quaternion.multiply(qa);
    }
    if (life.spin !== 0) {
      qa.setFromAxisAngle(zAxis, life.spin);
      pose.quaternion.multiply(qa);
    }
    pose.flip += life.flip;
  }

  dispose() {
    for (const front of this.fronts) front.dispose();
  }
}
