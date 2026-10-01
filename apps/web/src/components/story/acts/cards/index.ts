import { Group } from "three";

import {
  type ActState,
  type StoryAct,
  type StoryContext,
  type StoryPointerEvent,
} from "@/components/story/engine/act";
import { ensureCardKit, ensureDeckBox, ensureRoom } from "@/components/story/props/shared";
import type { DeckBox } from "@/components/story/props/deck-box";
import type { StoryRoom } from "@/components/story/props/room";
import { BoxDirector } from "@/components/story/acts/cards/box-director";
import { CameraDirector } from "@/components/story/acts/cards/camera-director";
import { createStudioLights, type StudioLights } from "@/components/story/acts/cards/lighting";
import { RoomReveal } from "@/components/story/acts/cards/room-reveal";
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
  private readonly view: StageView = { tanHalf: 0.12, aspect: 1, width: 1, height: 1 };

  async init(ctx: StoryContext) {
    const [room, box] = await Promise.all([
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
    this.reveal = new RoomReveal(room, studio, box);
    // The room's reflections come from its own capture (whoever asks first makes it).
    if (!room.envMap) await room.prepare(ctx.stage.renderer);
    room.setPhase("hidden");
    box.setEnvironment(studio.env, 1);
    this.boxDirector = new BoxDirector(box);

    // Compile with every object shown once (hidden objects are not compiled).
    box.warm(true);
    await ctx.stage.compile();
    box.warm(false);
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

    const drop = state.beat("c-drop");
    if (drop > 0) {
      director.update(ctx, state, this.view);
      this.camera.update(ctx, state, director.frame.position);
    } else {
      this.camera.update(ctx, state, director.frame.position);
      director.update(ctx, state, this.view);
    }
    reveal.update(ctx, state, director.frame.position);
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent) {
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

  sleep(ctx: StoryContext) {
    this.stage.visible = false;
    this.reveal?.sleep(ctx);
    if (this.boxDirector) this.boxDirector.hovered = false;
  }

  dispose() {
    this.stage.removeFromParent();
    this.studio?.dispose();
    this.studio = null;
    this.boxDirector = null;
    this.reveal = null;
  }
}

export function createAct(): StoryAct {
  return new CardsAct();
}
