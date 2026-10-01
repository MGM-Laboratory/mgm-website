import { Group, MeshStandardMaterial } from "three";

import {
  type ActState,
  type StoryAct,
  type StoryContext,
  type StoryPointerEvent,
} from "@/components/story/engine/act";
import { ensureCardKit, ensureDeckBox, ensureRoom } from "@/components/story/props/shared";
import type { DeckBox } from "@/components/story/props/deck-box";
import type { StoryRoom } from "@/components/story/props/room";
import { BoxDirector, REST_LEAN, REST_YAW } from "@/components/story/acts/cards/box-director";
import { CameraDirector } from "@/components/story/acts/cards/camera-director";
import { createStudioLights, type StudioLights } from "@/components/story/acts/cards/lighting";
import { RoomReveal } from "@/components/story/acts/cards/room-reveal";
import { PageFall } from "@/components/story/acts/cards/page-fall";
import { DeckLayout } from "@/components/story/acts/cards/deck-layout";
import {
  DeckMotion,
  createBeats,
  heroIndices,
  readBeats,
} from "@/components/story/acts/cards/deck-motion";
import { DeckView } from "@/components/story/acts/cards/deck-view";
import { HeroCards } from "@/components/story/acts/cards/hero-cards";
import { Threads } from "@/components/story/acts/cards/threads";
import { CardPlay } from "@/components/story/acts/cards/card-play";
import { Entrance } from "@/components/story/acts/cards/entrance";
import type { StreamExtent } from "@/components/story/acts/cards/deck-motion";
import { swarmCountFor } from "@/components/story/props/card-mesh";
import { smoothstep, window4 } from "@/components/story/engine/act";
import { STORY_HINTS } from "@/data/story";
import {
  STAGE_ORIGIN,
  STAGE_YAW,
  stageView,
  type StageView,
} from "@/components/story/acts/cards/stage-space";

/**
 * Act 1, "The deck" (SPEC section 1, ACTS.md Act 1): the Competencies
 * entrance, the box rising to the card stage, the tease and the opening,
 * the deck's spring, snake, waterfall and fan, the four drawn cards and
 * their reveal, the gather back into the box and the fall onto the coffee
 * table, where the room act takes over at `r-land`.
 *
 * Everything lives in the room's frame; the act's own poses are written in
 * the stage frame (`stage-space.ts`) and carried by `stage`, a group at the
 * card stage point. The shared props (the room, the card kit, the box) come
 * from `props/shared.ts`.
 */

declare module "@/components/story/engine/act" {
  interface StoryPropMap {
    /**
     * Read by the spine's placeholder room act (`acts/room`) in this branch.
     * Nothing registers it any more; the declaration goes with that placeholder.
     */
    placeholderBox: Group;
  }
}

class CardsAct implements StoryAct {
  readonly id = "cards" as const;
  /** The stage frame in the room: everything the act draws but the box. */
  private readonly stage = new Group();
  private room: StoryRoom | null = null;
  private box: DeckBox | null = null;
  private studio: StudioLights | null = null;
  private boxDirector: BoxDirector | null = null;
  private readonly camera = new CameraDirector();
  private reveal: RoomReveal | null = null;
  private readonly pageFall = new PageFall();
  private readonly view: StageView = { tanHalf: 0.12, aspect: 1, width: 1, height: 1 };
  private readonly layout = new DeckLayout();
  private motion: DeckMotion | null = null;
  private deck: DeckView | null = null;
  private heroes: HeroCards | null = null;
  private threads: Threads | null = null;
  private play: CardPlay | null = null;
  private readonly entrance = new Entrance();
  private readonly stream: StreamExtent = { head: 0, tail: 0, back: false, on: 0 };
  private readonly hover = [0, 0, 0, 0];
  private readonly beats = createBeats();

  async init(ctx: StoryContext) {
    const [room, box, kit] = await Promise.all([
      ensureRoom(ctx),
      ensureDeckBox(ctx),
      ensureCardKit(ctx),
    ]);
    this.room = room;
    this.box = box;
    const scene = ctx.stage.rootScene;
    if (!room.root.parent) scene.add(room.root);
    if (!box.root.parent) scene.add(box.root);
    this.stage.name = "cards-stage";
    this.stage.position.copy(STAGE_ORIGIN);
    this.stage.rotation.set(0, STAGE_YAW, 0);
    scene.add(this.stage);

    const studio = createStudioLights(ctx.stage.renderer, room.tier === "low" ? 64 : 128);
    this.studio = studio;
    scene.add(studio.group);
    scene.add(this.pageFall.mesh);
    this.reveal = new RoomReveal(room, studio, box, this.pageFall);
    // The room's reflections come from its own capture (whoever asks first makes it).
    if (!room.envMap) await room.prepare(ctx.stage.renderer);
    room.setPhase("hidden");
    box.setEnvironment(studio.env, 1);
    this.boxDirector = new BoxDirector(box);
    const count = swarmCountFor(ctx.tier);
    this.motion = new DeckMotion({ count, heroes: heroIndices(count) });
    const deck = new DeckView(kit, this.stage);
    deck.setPage(ctx.palette.page);
    // Printed paper takes a soft studio sheen; the light must not wash the fronts out.
    for (const hero of deck.heroes) {
      hero.card.material.envMap = studio.env;
      hero.card.material.envMapIntensity = 0.42;
    }
    const swarmMaterial = deck.swarm.mesh.material;
    if (swarmMaterial instanceof MeshStandardMaterial) {
      swarmMaterial.envMap = studio.env;
      swarmMaterial.envMapIntensity = 0.55;
    }
    this.deck = deck;
    this.threads = new Threads(this.stage, ctx.tier);
    const heroes = new HeroCards(deck, ctx.tier);
    this.heroes = heroes;
    const play = new CardPlay(this.stage, deck, heroes);
    this.play = play;
    // Compile the live fronts too (a hero with a front texture is the same program as without).
    deck.heroes.forEach((hero, k) => {
      hero.card.setFront(heroes.fronts.at(k)?.texture ?? null);
    });
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __storyCards: this });

    // Compile with every object shown once (hidden objects are not compiled).
    box.warm(true);
    deck.warm(true);
    this.threads.warm(true);
    this.pageFall.warm(true);
    play.warm(true);
    await ctx.stage.compile();
    play.warm(false);
    box.warm(false);
    deck.warm(false);
    this.threads.warm(false);
    this.pageFall.warm(false);
    for (const hero of deck.heroes) hero.card.setFront(null);
  }

  update(ctx: StoryContext, state: ActState) {
    const director = this.boxDirector;
    const reveal = this.reveal;
    if (!director || !reveal) return;
    stageView(ctx.size, this.view);
    this.stage.visible = true;

    if (!state.active) {
      // Near but not active (`r-land`, before the room act's update): the box lies where it landed.
      director.landed();
      reveal.landed(ctx);
      this.stage.visible = false;
      return;
    }

    this.entrance.update(ctx, state);
    const drop = state.beat("c-drop");
    const motion = this.motion;
    const deck = this.deck;
    const box = this.box;
    if (motion && box) {
      this.layout.update(this.view, box, REST_YAW, REST_LEAN);
      readBeats(state, this.beats);
      director.frame.stack = motion.stackFill(this.beats, this.layout);
    }
    if (drop > 0) {
      director.update(ctx, state, this.view);
      this.camera.update(ctx, state, director.frame.position, this.view);
    } else {
      this.camera.update(ctx, state, director.frame.position, this.view);
      director.update(ctx, state, this.view);
    }
    reveal.update(ctx, state);
    this.hints(ctx, state);
    if (motion && deck) {
      // The cursor parts the stream while it flows (not while the four are on show).
      const parting =
        window4(state.t, 1.9, 2.3, 5.0, 5.4) +
        smoothstep(0.12, 0.3, this.beats.gather) * (1 - smoothstep(0.7, 0.85, this.beats.gather));
      deck.update(ctx, motion, this.beats, this.layout, Math.min(1, parting));
      const heroes = this.heroes;
      const play = this.play;
      play?.update(ctx, this.beats, state.t, state.velocity);
      heroes?.update(ctx, this.beats, this.layout, state.velocity);
      play?.place(ctx, this.layout, this.view);
      const threads = this.threads;
      if (threads && heroes) {
        heroes.life.forEach((life, k) => {
          this.hover.splice(k, 1, life.hover);
        });
        threads.update(ctx, {
          beats: this.beats,
          layout: this.layout,
          view: this.view,
          heroes: deck.heroPoses,
          faceUp: heroes.faceUp,
          hover: this.hover,
          stream: motion.stream(this.beats, this.layout, this.stream),
          entrance: state.entrance,
          drop: drop,
          t: state.t,
        });
      }
    }
  }

  /** The overlay's hint line at the two rests, once the visitor has been still a moment. */
  private hints(ctx: StoryContext, state: ActState) {
    const idle = ctx.director.idle;
    const resting = (id: string) => state.current === id && state.local > 0.985;
    if (resting("c-rise") && idle > 1.2) ctx.overlay.setHint(STORY_HINTS.deckWaiting);
    else if (resting("c-turn") && idle > 1.5 && (this.play?.focus ?? -1) < 0)
      ctx.overlay.setHint(STORY_HINTS.cardsReady);
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent) {
    if (this.play?.pointer(ctx, event)) return true;
    const director = this.boxDirector;
    const box = this.box;
    if (!director || !box) return false;
    const hit = event.raycast([box.root]).length > 0;
    if (event.type === "move" || event.type === "leave") {
      director.hovered = hit && event.type === "move";
      ctx.pointer.setCursor(hit ? "pointer" : null);
      return hit;
    }
    if (event.type === "tap" && hit) {
      director.poke(ctx.clock.time);
      return true;
    }
    return false;
  }

  palette(ctx: StoryContext) {
    this.deck?.setPage(ctx.palette.page);
  }

  resize() {
    this.layout.invalidate();
  }

  tier(ctx: StoryContext) {
    const count = swarmCountFor(ctx.tier);
    this.motion?.setCount(count, heroIndices(count));
  }

  sleep(ctx: StoryContext) {
    this.stage.visible = false;
    this.play?.sleep();
    this.entrance.left(ctx.director.t);
    this.reveal?.sleep(ctx);
    if (this.boxDirector) this.boxDirector.hovered = false;
  }

  dispose() {
    this.stage.removeFromParent();
    this.deck?.dispose();
    this.deck = null;
    this.heroes?.dispose();
    this.heroes = null;
    this.threads?.dispose();
    this.threads = null;
    this.play?.dispose();
    this.play = null;
    this.entrance.reset();
    this.pageFall.dispose();
    this.studio?.dispose();
    this.studio = null;
    this.boxDirector = null;
    this.reveal = null;
  }
}

export function createAct(): StoryAct {
  return new CardsAct();
}
