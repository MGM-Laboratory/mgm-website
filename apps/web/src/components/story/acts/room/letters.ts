import { Euler, MathUtils, Quaternion, Vector3, type Raycaster } from "three";

import { STORY_LETTERS } from "@/data/story";
import { saturate, smoothstep, type StoryContext } from "@/components/story/engine/act";
import { hash01, hashSigned } from "@/components/story/props/deck-shared";
import type { RoomAnchors } from "@/components/story/props/room";
import { letterDrop, loadToyLetters, type ToyLetters } from "@/components/story/props/toy-letters";
import { random } from "@/lib/random";

import type { ContactShadows } from "./fx";

/**
 * The phrase on the coffee table: the deck's toy letters laid out in the
 * room's five rows (`anchors.letters`), dropped one by one in reading order
 * as a pure function of the story position, then alive on the clock: a
 * wobble under the pointer, a hop on a click, and now and then a letter that
 * rocks on its own.
 */

export type LetterTiming = Readonly<{
  /** Story positions (vh) where the first letter appears and where the last one has settled. */
  from: number;
  to: number;
  /** One letter's drop, vh. */
  each: number;
}>;

export class TableLetters {
  readonly toy: ToyLetters;
  private readonly heights: readonly number[];
  private readonly tilts: readonly Quaternion[];
  private readonly turn = new Quaternion();
  private readonly world = new Vector3();
  private hovered = -1;
  private idleIn = 3;
  private readonly yaw: number;

  private constructor(toy: ToyLetters, yaw: number) {
    this.toy = toy;
    this.yaw = yaw;
    const euler = new Euler();
    this.heights = toy.letters.map((letter) => 0.055 + 0.04 * hash01(letter.index, 3));
    this.tilts = toy.letters.map((letter) =>
      new Quaternion().setFromEuler(
        euler.set(
          MathUtils.degToRad(22 * hashSigned(letter.index, 5)),
          MathUtils.degToRad(14 * hashSigned(letter.index, 7)),
          MathUtils.degToRad(26 * hashSigned(letter.index, 9)),
        ),
      ),
    );
  }

  static async create(ctx: StoryContext, anchors: RoomAnchors["letters"]) {
    const rows = anchors.lines;
    if (process.env.NODE_ENV !== "production") {
      const same =
        rows.length === STORY_LETTERS.length &&
        rows.every((row, i) => row.text === STORY_LETTERS.at(i));
      if (!same) console.warn("[room] STORY_LETTERS no longer match anchors.letters.lines");
    }
    const [cx, cy, cz] = anchors.centre;
    // The group stands on the block's centre, turned so the rows read along `along`. A row's z in the
    // group frame is its offset from the centre along the facing direction.
    const facing = new Vector3(anchors.facing[0], anchors.facing[1], anchors.facing[2]);
    const lineZ = rows.map((row) => {
      return (row.centre[0] - cx) * facing.x + (row.centre[2] - cz) * facing.z;
    });
    const toy = await loadToyLetters(ctx.assets, {
      tier: ctx.tier,
      lines: STORY_LETTERS,
      capHeight: anchors.capHeight,
      maxWidth: Infinity,
      tracking: anchors.tracking,
      rowGap: anchors.rowGap,
      lineZ,
    });
    const yaw = MathUtils.degToRad(anchors.rotationYDeg);
    toy.group.position.set(cx, cy, cz);
    toy.group.rotation.set(0, yaw, 0);
    return new TableLetters(toy, yaw);
  }

  /** Letter `index`'s drop progress at story position `t`. */
  private dropOf(index: number, t: number, timing: LetterTiming) {
    const count = Math.max(1, this.toy.letters.length - 1);
    const start = timing.from + ((timing.to - timing.each - timing.from) * index) / count;
    return saturate((t - start) / timing.each);
  }

  /**
   * Poses every letter for story position `t`: hidden before its drop, then
   * a pop in, a fall from 5.5 to 9.5 cm with a tumble that straightens as it
   * lands, two bounces and a settle (`letterDrop`), then home. Writes the
   * contact shadows too. Returns how many letters show.
   */
  pose(t: number, timing: LetterTiming, shadows: ContactShadows, shadowFrom: number) {
    let shown = 0;
    const group = this.toy.group;
    for (const letter of this.toy.letters) {
      const p = this.dropOf(letter.index, t, timing);
      const shadow = shadows.slots.at(shadowFrom + letter.index);
      if (p <= 0) {
        letter.scale = 0;
        letter.position.copy(letter.home);
        if (shadow) shadow.opacity = 0;
        continue;
      }
      shown += 1;
      // 0..0.1 pops in at the top, then the fall and the bounces.
      const pop = smoothstep(0, 0.1, p);
      const fall = saturate((p - 0.06) / 0.94);
      const h = this.heights.at(letter.index) ?? 0.07;
      const drop = letterDrop(fall, h);
      letter.scale = pop * (1 + 0.18 * Math.sin(Math.PI * pop));
      letter.squash = drop.squash;
      letter.position.copy(letter.home);
      letter.position.y = drop.y;
      // The tumble follows the height: tilted high up, straight on the table.
      const tilt = this.tilts.at(letter.index);
      const k = Math.pow(saturate(drop.y / h), 0.75);
      if (tilt) letter.quaternion.identity().slerp(tilt, k);
      else letter.quaternion.identity();
      if (shadow) {
        this.world.copy(letter.home).applyEuler(group.rotation).add(group.position);
        shadow.position.set(this.world.x, group.position.y + 0.0003, this.world.z);
        const lift = saturate(drop.y / 0.06);
        const size = letter.size.x * (1.25 + lift * 0.8);
        shadow.width = size;
        shadow.depth = letter.size.z * (2.4 + lift * 0.8);
        shadow.yaw = this.yaw;
        shadow.opacity = pop * 0.42 * (1 - lift * 0.75);
        shadow.round = 0.35;
      }
    }
    return shown;
  }

  /** The letter under the ray, or -1. */
  hit(raycaster: Raycaster) {
    return this.toy.hit(raycaster);
  }

  /**
   * The clock life: the hovered letter wobbles (once on entry, softly while
   * the pointer stays), and when nobody touches anything a random letter
   * rocks now and then. `settled` says every letter has landed.
   */
  life(ctx: StoryContext, hovered: number, settled: boolean, idle: boolean) {
    if (hovered !== this.hovered) {
      if (hovered >= 0) this.toy.poke(hovered, 1);
      this.hovered = hovered;
    }
    if (settled && idle) {
      this.idleIn -= ctx.clock.storyDt;
      if (this.idleIn <= 0) {
        const index = Math.floor(random() * this.toy.letters.length);
        this.toy.poke(index, 0.45);
        this.idleIn = 2.2 + random() * 2.8;
      }
    }
    this.toy.update(ctx.clock.storyDt);
    this.toy.commit();
  }

  /** A click: the letter hops, and its neighbours feel it a little. */
  hop(index: number) {
    this.toy.hop(index);
    const letter = this.toy.letters.at(index);
    if (!letter) return;
    for (const other of this.toy.letters) {
      if (other.line !== letter.line || other.index === index) continue;
      const gap = Math.abs(other.index - index);
      if (gap <= 2) this.toy.poke(other.index, 0.5 / gap);
    }
  }

  /** A nudge for the whole phrase (the keyboard's way to touch it): a wave of hops along the rows. */
  wave(time: number) {
    const lead = Math.floor(time * 7) % 3;
    for (const letter of this.toy.letters) {
      if ((letter.index + lead) % 3 === 0) this.toy.poke(letter.index, 0.8);
    }
  }

  /** Every letter at home, no reactions. */
  reset() {
    this.hovered = -1;
    this.idleIn = 3;
  }

  dispose() {
    this.toy.dispose();
  }
}
