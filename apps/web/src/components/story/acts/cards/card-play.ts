import { Vector3, type Group, type Intersection, type Object3D } from "three";

import {
  cubicInOut,
  damp,
  saturate,
  stepSpring,
  type StoryContext,
  type StoryHotspot,
  type StoryPointerEvent,
  type StoryRect,
} from "@/components/story/engine/act";
import { projectPoint } from "@/components/story/engine/dom-glue";
import { CARD_H, CARD_W } from "@/components/story/props/card-mesh";
import { STORY_CARDS, STORY_CARD_PLAY, type StoryCard } from "@/data/story";
import { FRONT_UNITS } from "@/components/story/acts/cards/card-front";
import { CardPill, PILL_ASPECT, PILL_HEIGHT_PX } from "@/components/story/acts/cards/card-pill";
import type { DeckBeats } from "@/components/story/acts/cards/deck-motion";
import type { DeckLayout } from "@/components/story/acts/cards/deck-layout";
import type { DeckView } from "@/components/story/acts/cards/deck-view";
import type { HeroCards } from "@/components/story/acts/cards/hero-cards";
import { STAGE_DISTANCE, type StageView } from "@/components/story/acts/cards/stage-space";

/**
 * The four cards at rest (ACTS Act 1, "At rest"): everything a visitor can
 * do with them, written into each card's life (`HeroLife`), which the
 * hero layer adds on top of the pure poses. None of it changes the story.
 *
 * - Hover (a raycast, ignored while the page scrolls): the card lifts 1.5 cm
 *   toward the lens and tilts toward the cursor (10 degrees at most, a soft
 *   spring), its neighbours lean away, its logo plays its hover personality
 *   and follows the pointer on the face, its threads go taut and take its
 *   colour.
 * - Click, tap or Enter: a closer look. The card turns once on its long
 *   axis as it comes to the centre, big, the others step back into the mist,
 *   and a link to its focus page appears under it (drawn here, a real link
 *   over it). Esc, a click outside, the card again or any scroll returns it.
 * - Idle: every card bobs on its own beat; after four still seconds one card
 *   twirls, then the next, and so on.
 * - Keyboard and screen readers: one button per card over its projected
 *   rect (a focus ring from the overlay), and the link while it shows.
 */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
/** Spring for the hover (stiffness, damping): about 1.4 Hz with a damping ratio near 0.55. */
const HOVER_K = 78;
const HOVER_D = 9.8;
const TILT_MAX = 10 * DEG;
/** How far a scroll may go (vh) before a closer look closes by itself. */
const FOCUS_SCROLL = 0.035;

const ACCENT_HEX: ReadonlyMap<StoryCard["accent"], string> = new Map([
  ["blue", "#3a6dc5"],
  ["red", "#f94141"],
  ["green", "#0f8657"],
  ["yellow", "#f7bf33"],
]);

type Spring = [number, number];
type CardSprings = { hover: Spring; lift: Spring; tiltX: Spring; tiltY: Spring; lean: Spring };

const local = new Vector3();
const corner = new Vector3();
const point = { x: 0, y: 0 };

export class CardPlay {
  readonly pill = new CardPill();
  /** The card in a closer look, or -1. */
  focus = -1;
  /** A closer look opened (the act cheers it). */
  onOpen: (k: number) => void = () => {};
  private readonly springs: CardSprings[] = [0, 1, 2, 3].map(() => ({
    hover: [0, 0],
    lift: [0, 0],
    tiltX: [0, 0],
    tiltY: [0, 0],
    lean: [0, 0],
  }));
  private readonly focusK = new Float32Array(4);
  private readonly dimK = new Float32Array(4);
  private readonly ready = new Uint8Array(4);
  private readonly rects: (StoryRect | null)[] = [null, null, null, null];
  private readonly facePointer = [0, 1, 2, 3].map(() => ({ x: 0, y: 0 }));
  private hovered = -1;
  private hit: Intersection | null = null;
  private focusT = 0;
  private focusStart = -10;
  private twirlCard = -1;
  private twirlStart = -10;
  private nextTwirl = 0;
  private twirlStep = 0;
  private readonly pillHover: Spring = [0, 0];
  private pillShown = 0;
  private cards: StoryHotspot[] = [];
  private links: StoryHotspot[] = [];
  private t = 0;
  /** The story clock at the last update (a keyboard activation happens between frames). */
  private time = 0;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || this.focus < 0) return;
    this.close(true);
  };

  constructor(
    stage: Group,
    private readonly view: DeckView,
    private readonly heroes: HeroCards,
  ) {
    stage.add(this.pill.mesh);
    window.addEventListener("keydown", this.onKey);
    void document.fonts.ready.then(() => {
      this.pill.refreshFonts();
    });
  }

  /** Shows the pill for a compile pass. */
  warm(on: boolean) {
    this.pill.mesh.visible = on;
  }

  private meshes(): Object3D[] {
    const out: Object3D[] = [];
    this.view.heroes.forEach((hero, k) => {
      if (this.ready.at(k) === 1) out.push(hero.card.mesh);
    });
    return out;
  }

  private indexOf(object: Object3D) {
    return this.view.heroes.findIndex((hero) => hero.card.mesh === object);
  }

  /** The hotspots, created once (overlay order: each card, then its link, so Tab goes card, link, card). */
  private ensureHotspots(ctx: StoryContext) {
    if (this.cards.length > 0) return;
    STORY_CARDS.slice(0, 4).forEach((card, k) => {
      const copy = STORY_CARD_PLAY[card.id];
      this.cards.push(
        ctx.overlay.hotspot({
          id: `cards-card-${card.id}`,
          label: copy.look,
          onActivate: () => {
            if (this.focus === k) this.close(false);
            else this.open(k);
          },
        }),
      );
      this.links.push(
        ctx.overlay.hotspot({ id: `cards-link-${card.id}`, label: copy.link, href: card.href }),
      );
    });
  }

  private open(k: number) {
    if (this.ready.at(k) !== 1) return;
    this.focus = k;
    this.focusT = this.t;
    this.focusStart = this.time;
    this.twirlCard = -1;
    this.onOpen(k);
  }

  /** Back to the row. With `restore`, the keyboard focus goes back to the card's control. */
  private close(restore: boolean) {
    const k = this.focus;
    this.focus = -1;
    if (!restore || k < 0) return;
    const card = STORY_CARDS.at(k);
    if (!card) return;
    const active = document.activeElement;
    const overlay = document.querySelector("[data-story-overlay]");
    if (!overlay || !active || !overlay.contains(active)) return;
    const label = STORY_CARD_PLAY[card.id].look;
    for (const element of overlay.querySelectorAll<HTMLElement>("[aria-label]")) {
      if (element.getAttribute("aria-label") === label) {
        element.focus({ preventScroll: true });
        return;
      }
    }
  }

  /**
   * Before the hero layer: reads the pointer, steps the springs and writes
   * every card's life for this frame.
   */
  update(ctx: StoryContext, beats: DeckBeats, t: number, velocity: number) {
    this.ensureHotspots(ctx);
    this.t = t;
    const time = ctx.clock.time;
    this.time = time;
    const dt = ctx.clock.dt;
    const pointer = ctx.pointer;
    let anyReady = false;
    for (let k = 0; k < 4; k += 1) {
      const up = this.heroes.faceUp.at(k) ?? 0;
      const ready = beats.draw >= 1 && beats.gather <= 0 && beats.drop <= 0 && up > 0.97;
      this.ready.set([ready ? 1 : 0], k);
      anyReady ||= ready;
    }
    // A closer look ends with a scroll, or when its card is no longer at rest.
    if (
      this.focus >= 0 &&
      (Math.abs(t - this.focusT) > FOCUS_SCROLL || this.ready.at(this.focus) !== 1)
    ) {
      this.close(true);
    }

    // Hover: the nearest ready card under the pointer, ignored while the page moves.
    const calm = Math.abs(velocity) < 0.08;
    this.hovered = -1;
    this.hit = null;
    if (anyReady && calm && pointer.inside && pointer.type !== "touch") {
      const hits = pointer.raycast(this.meshes(), false);
      const first = hits.at(0);
      if (first) {
        this.hovered = this.indexOf(first.object);
        this.hit = first;
      }
    }

    // Idle: after four still seconds, one card twirls, then the next.
    const still = anyReady && this.focus < 0 && this.hovered < 0 && ctx.director.idle > 4 && calm;
    if (!still) this.nextTwirl = Math.max(this.nextTwirl, time + 1.2);
    if (still && time > this.nextTwirl) {
      const order = [2, 0, 3, 1];
      this.twirlCard = order.at(this.twirlStep % 4) ?? 0;
      this.twirlStep += 1;
      this.twirlStart = time;
      this.nextTwirl = time + 4.6;
    }

    const focusAge = time - this.focusStart;
    for (let k = 0; k < 4; k += 1) {
      const life = this.heroes.life.at(k);
      const s = this.springs.at(k);
      if (!life || !s) continue;
      const ready = this.ready.at(k) === 1;
      const keyed = this.cards.at(k)?.focused ?? false;
      const engaged = ready && (this.hovered === k || keyed || this.focus === k);
      stepSpring(s.hover, engaged ? 1 : 0, dt, 140, 18);
      // Where the pointer is on the card (-1..1 across, -1..1 down), from last frame's rect.
      let rx = 0;
      let ry = 0;
      const rect = this.rects.at(k);
      if (this.hovered === k && rect) {
        rx = Math.max(
          -1.2,
          Math.min(1.2, (pointer.px.x - rect.x - rect.width / 2) / (rect.width / 2)),
        );
        ry = Math.max(
          -1.2,
          Math.min(1.2, (pointer.px.y - rect.y - rect.height / 2) / (rect.height / 2)),
        );
      } else if (engaged) {
        // Keyboard or a closer look without the pointer on it: a slow look around.
        rx = Math.sin(time * 0.9 + k) * 0.35;
        ry = Math.cos(time * 0.7 + k) * 0.25;
      }
      const reach = this.focus === k ? 0.7 : 1;
      stepSpring(s.tiltY, engaged ? rx * TILT_MAX * reach : 0, dt, HOVER_K, HOVER_D);
      stepSpring(s.tiltX, engaged ? ry * TILT_MAX * reach : 0, dt, HOVER_K, HOVER_D);
      stepSpring(s.lift, engaged && this.focus !== k ? 1 : 0, dt, HOVER_K, HOVER_D);
      // Neighbours lean away from a hovered card.
      let lean = 0;
      for (let j = 0; j < 4; j += 1) {
        if (j === k) continue;
        const other = this.springs.at(j)?.hover[0] ?? 0;
        lean += Math.sign(k - j) * other * (Math.abs(k - j) === 1 ? 1 : 0.4);
      }
      stepSpring(s.lean, ready && this.focus < 0 ? lean : 0, dt, HOVER_K, HOVER_D);

      // A closer look, and the others stepping back.
      const focused = this.focus === k;
      this.focusK.set([damp(this.focusK.at(k) ?? 0, focused ? 1 : 0, 5.5, dt)], k);
      this.dimK.set([damp(this.dimK.at(k) ?? 0, this.focus >= 0 && !focused ? 1 : 0, 5.5, dt)], k);

      // Life: a bob on each card's own beat, the twirl, the closer look's turn.
      const settle = ready ? 1 : 0;
      const bob = Math.sin(time * 2.1 + k * 1.05) * 0.0011 * settle;
      const sway = Math.sin(time * 1.3 + k * 0.9) * 0.55 * DEG * settle;
      const twirlAge = this.twirlCard === k ? (time - this.twirlStart) / 0.95 : -1;
      const twirl = twirlAge > 0 && twirlAge < 1 ? cubicInOut(twirlAge) : 0;
      const hover = saturate(s.hover[0]);
      life.lift.set(
        s.lean[0] * 0.0055,
        bob + s.lift[0] * 0.004 + Math.sin(Math.PI * twirl) * 0.004,
        s.lift[0] * 0.015 + Math.sin(Math.PI * twirl) * 0.01,
      );
      life.tiltX = s.tiltX[0];
      life.tiltY = s.tiltY[0] + s.lean[0] * 3 * DEG;
      life.spin = sway + TAU * twirl;
      life.focus = this.focusK.at(k) ?? 0;
      life.dim = this.dimK.at(k) ?? 0;
      life.flip = focused && focusAge >= 0 && focusAge < 0.8 ? TAU * cubicInOut(focusAge / 0.8) : 0;
      life.hover = hover;
      life.pointer = this.facePoint(k, engaged, time);
    }
  }

  /** The pointer on card k's face in canvas units, or a slow circle for the keyboard. */
  private facePoint(k: number, engaged: boolean, time: number) {
    const out = this.facePointer.at(k);
    if (!out || !engaged) return null;
    const hit = this.hit;
    if (this.hovered === k && hit) {
      local.copy(hit.point);
      hit.object.worldToLocal(local);
      out.x = (0.5 - local.x / CARD_W) * FRONT_UNITS.width;
      out.y = (0.5 - local.y / CARD_H) * FRONT_UNITS.height;
      return out;
    }
    out.x = FRONT_UNITS.width * (0.5 + 0.22 * Math.cos(time * 1.1));
    out.y = FRONT_UNITS.height * (0.27 + 0.1 * Math.sin(time * 1.1));
    return out;
  }

  /**
   * After the hero layer placed the cards: the hotspots over them, the link
   * and its pill under the card in a closer look.
   */
  place(ctx: StoryContext, layout: DeckLayout, view: StageView) {
    const camera = ctx.stage.camera;
    const size = ctx.size;
    this.view.heroes.forEach((hero, k) => {
      const mesh = hero.card.mesh;
      let rect: StoryRect | null = null;
      if (this.ready.at(k) === 1 && mesh.visible) {
        mesh.updateMatrixWorld();
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < 4; i += 1) {
          corner.set((i & 1 ? 0.5 : -0.5) * CARD_W, (i & 2 ? 0.5 : -0.5) * CARD_H, 0);
          corner.applyMatrix4(mesh.matrixWorld);
          projectPoint(corner, camera, size, point);
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
        rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
      this.rects.splice(k, 1, rect);
      const shown = rect && (this.focus < 0 || this.focus === k) ? rect : null;
      this.cards.at(k)?.place(shown);
    });

    // The pill under the card in a closer look.
    const k = this.focus >= 0 ? this.focus : -1;
    const card = k >= 0 ? STORY_CARDS.at(k) : undefined;
    const target = card && (this.focusK.at(k) ?? 0) > 0.55 ? 1 : 0;
    this.pillShown = damp(this.pillShown, target, target ? 9 : 14, ctx.clock.dt);
    const link = k >= 0 ? this.links.at(k) : undefined;
    stepSpring(
      this.pillHover,
      link && (link.hovered || link.focused) ? 1 : 0,
      ctx.clock.dt,
      160,
      20,
    );
    const mesh = this.pill.mesh;
    mesh.visible = this.pillShown > 0.01 && Boolean(card);
    if (card) {
      this.pill.draw(
        STORY_CARD_PLAY[card.id].link,
        ACCENT_HEX.get(card.accent) ?? "#3a6dc5",
        saturate(this.pillHover[0]),
        ctx.palette.scheme,
      );
      const centre = layout.focus.position;
      const depth = STAGE_DISTANCE - centre.z;
      const perPx = (2 * depth * view.tanHalf) / Math.max(1, view.height);
      const h = PILL_HEIGHT_PX * perPx;
      const gap = 18 * perPx;
      const rise = (1 - this.pillShown) * 14 * perPx;
      mesh.position.set(
        centre.x,
        centre.y - (CARD_H * layout.focus.scale) / 2 - gap - h / 2 - rise,
        centre.z + 0.004,
      );
      const pop = 0.92 + 0.08 * this.pillShown + 0.03 * this.pillHover[0];
      mesh.scale.set(h * pop, h * pop, 1);
      mesh.material.opacity = saturate(this.pillShown);
    }
    for (let j = 0; j < 4; j += 1) {
      const linkJ = this.links.at(j);
      if (!linkJ) continue;
      if (j !== k || this.pillShown < 0.6) {
        linkJ.place(null);
        continue;
      }
      mesh.updateMatrixWorld();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < 4; i += 1) {
        corner.set((i & 1 ? 0.5 : -0.5) * PILL_ASPECT, i & 2 ? 0.5 : -0.5, 0);
        corner.applyMatrix4(mesh.matrixWorld);
        projectPoint(corner, camera, size, point);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
      linkJ.place({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }
  }

  /** The card under the pointer (for the cursor), or -1. */
  cardAt(event: StoryPointerEvent) {
    if (!this.ready.some((r) => r === 1)) return -1;
    const first = event.raycast(this.meshes(), false).at(0);
    return first ? this.indexOf(first.object) : -1;
  }

  /** Taps: a card opens (or closes) its closer look; a tap elsewhere closes it. */
  pointer(ctx: StoryContext, event: StoryPointerEvent) {
    if (event.type === "move" || event.type === "leave") {
      const k = event.type === "move" ? this.cardAt(event) : -1;
      if (k >= 0) ctx.pointer.setCursor("pointer");
      return k >= 0;
    }
    if (event.type !== "tap") return false;
    const k = this.cardAt(event);
    if (k >= 0) {
      if (this.focus === k) this.close(false);
      else this.open(k);
      return true;
    }
    if (this.focus >= 0) {
      this.close(false);
      return true;
    }
    return false;
  }

  /** The act left its window: nothing hovered, no closer look, the controls hidden. */
  sleep() {
    this.focus = -1;
    this.hovered = -1;
    for (const spot of this.cards) spot.place(null);
    for (const spot of this.links) spot.place(null);
    this.pill.mesh.visible = false;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKey);
    for (const spot of this.cards) spot.dispose();
    for (const spot of this.links) spot.dispose();
    this.cards = [];
    this.links = [];
    this.pill.dispose();
  }
}
