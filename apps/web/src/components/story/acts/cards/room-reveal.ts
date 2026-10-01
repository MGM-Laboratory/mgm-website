import { Group, Mesh, MeshStandardMaterial, Vector2, type Texture } from "three";

import {
  STORY_LAYERS,
  smoothstep,
  type ActState,
  type StoryContext,
} from "@/components/story/engine/act";
import { LAMPS_AT_LAND } from "@/components/story/engine/frame";
import type { DeckBox } from "@/components/story/props/deck-box";
import type { RoomPhase, StoryRoom } from "@/components/story/props/room";
import type { StudioLights } from "@/components/story/acts/cards/lighting";
import type { PageFall } from "@/components/story/acts/cards/page-fall";

/**
 * The fall into the room (`c-drop`): the page falls with the box. It breaks
 * into card-shaped tiles that tip toward the lens and drop, in a wave from
 * where the box let go (`page-fall.ts`), and the living room shows behind
 * them with its lamps warming up, while the studio light of the card stage
 * hands over to the room's own rig. Before the drop the room is hidden (the
 * page covers it); at the end of the drop everything of the room is
 * revealed and lit, as the room act expects at `r-land`.
 *
 * The plain dissolve of the backdrop opened on the dark TV wall behind the
 * box first, a black hole with a hard rim; the tiles show the whole lit room
 * at once, between them, and they are the page, so the switch from the
 * painted page to them is invisible.
 *
 * The box's reflections swap from the studio's to the room's half way (the
 * two maps are the same size, so no program changes), with the reflection
 * strength dipping through the swap so it never pops.
 */

/** The studio reflections' strength on the box over the page. */
const STUDIO_ENV = 0.8;
/** Where the box lets go on screen (NDC): the wave of falling tiles starts there. */
const FALL_ORIGIN = new Vector2(0, -0.08);

export class RoomReveal {
  private phase: RoomPhase | null = null;
  private lamps = -1;
  private presence = -1;
  private grade = "";
  /** The box's reflective materials, to move their reflection strength without a program change. */
  private readonly boxMaterials: MeshStandardMaterial[] = [];
  /** The box's groups: a group's render order is its subtree's group order (nested ones reset it). */
  private readonly boxGroups: Group[] = [];
  private boxOrder = 0;

  constructor(
    private readonly room: StoryRoom,
    private readonly studio: StudioLights,
    private readonly box: DeckBox,
    private readonly page: PageFall,
  ) {
    room.setLayer(STORY_LAYERS.behind);
    const seen = new Set<MeshStandardMaterial>();
    box.root.traverse((object) => {
      if (object instanceof Group) this.boxGroups.push(object);
      if (!(object instanceof Mesh)) return;
      const materials: unknown[] = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial && !seen.has(material)) {
          seen.add(material);
          this.boxMaterials.push(material);
        }
      }
    });
  }

  /** Every frame the act is active (the room act takes over at `r-land`). */
  update(ctx: StoryContext, state: ActState) {
    const drop = state.beat("c-drop");
    // In the drop the room act is near and writes its own defaults to the room before this runs
    // (every frame), so every setting is written again here, changed or not.
    if (drop > 0) this.invalidate();
    const scheme = ctx.palette.scheme;
    const pointer = ctx.pointer;
    const gone = this.page.update(ctx.size, drop, FALL_ORIGIN, scheme, ctx.palette.page, {
      x: pointer.ndc.x,
      y: pointer.ndc.y,
      inside: pointer.inside,
    });
    // The box draws after the falling page (its groups' order), never under it.
    this.setBoxOrder(drop > 0 ? 2 : 0);
    if (!this.page.mesh.visible && drop < 0.5) {
      this.setPhase("hidden");
      this.studio.set(1, scheme);
      this.setEnv(this.studio.env, STUDIO_ENV);
      if (state.t >= 0) ctx.stage.backdrop.set({ paint: 1, reveal: 0 });
      else ctx.stage.backdrop.set({ paint: 0, reveal: 0 });
      return;
    }
    // The room is all there behind the tiles; the lamps warm up as the page falls away, to the
    // level the room act starts from at `r-land`.
    const presence = smoothstep(0.05, 0.6, drop);
    this.setPhase("crane");
    this.setGrade(scheme);
    this.setLamps(LAMPS_AT_LAND * (0.5 + 0.5 * smoothstep(0.05, 0.55, drop)));
    this.setPresence(presence);
    this.studio.set(1 - presence, scheme);
    // The reflections: the studio's, dipping out, then the room's, rising in.
    const swap = 0.42;
    const roomEnv = this.room.envMap;
    if (drop < swap || !roomEnv)
      this.setEnv(this.studio.env, STUDIO_ENV * (1 - smoothstep(0.2, swap, drop)));
    else this.setEnv(roomEnv, smoothstep(swap, 0.7, drop));

    ctx.stage.backdrop.set({ paint: 1, reveal: 1 });
    if (gone > 0.5) ctx.setHeaderTone("dark");
  }

  /** `r-land` (near, before the room act's own update): the room as the drop left it. */
  landed(ctx: StoryContext) {
    this.invalidate();
    this.page.mesh.visible = false;
    this.setBoxOrder(0);
    this.setPhase("land");
    this.setGrade(ctx.palette.scheme);
    this.setLamps(LAMPS_AT_LAND);
    this.setPresence(1);
    this.studio.set(0, ctx.palette.scheme);
  }

  /** The act left its window: the studio off, the page tiles gone, the box's order back. */
  sleep(ctx: StoryContext) {
    this.studio.set(0, ctx.palette.scheme);
    this.page.mesh.visible = false;
    this.setBoxOrder(0);
  }

  private setBoxOrder(order: number) {
    if (order === this.boxOrder) return;
    this.boxOrder = order;
    for (const group of this.boxGroups) group.renderOrder = order;
  }

  private setPhase(phase: RoomPhase) {
    if (phase === this.phase) return;
    this.phase = phase;
    this.room.setPhase(phase);
  }

  private setGrade(scheme: "light" | "dark") {
    if (scheme === this.grade) return;
    this.grade = scheme;
    this.room.setGrade(scheme);
  }

  private setLamps(level: number) {
    if (Math.abs(level - this.lamps) < 1e-4) return;
    this.lamps = level;
    this.room.lamps(level);
  }

  private setPresence(level: number) {
    if (Math.abs(level - this.presence) < 1e-4) return;
    this.presence = level;
    this.room.setPresence(level);
  }

  /** The box's reflections. Compared with what the materials hold, since the room act sets them too. */
  private setEnv(texture: Texture, intensity: number) {
    const first = this.boxMaterials.at(0);
    if (!first) return;
    if (first.envMap !== texture) {
      this.box.setEnvironment(texture, intensity);
      return;
    }
    if (Math.abs(first.envMapIntensity - intensity) < 1e-3) return;
    // Same map: only the strength moves (no program change, no needsUpdate).
    for (const material of this.boxMaterials) material.envMapIntensity = intensity;
  }

  /** Forget the cached settings (another act may have changed the room). */
  invalidate() {
    this.phase = null;
    this.lamps = -1;
    this.presence = -1;
    this.grade = "";
  }
}
