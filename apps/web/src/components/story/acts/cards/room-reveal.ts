import { Mesh, MeshStandardMaterial, Vector3, type Texture } from "three";

import {
  STORY_LAYERS,
  smoothstep,
  type ActState,
  type StoryContext,
} from "@/components/story/engine/act";
import type { DeckBox } from "@/components/story/props/deck-box";
import type { RoomPhase, StoryRoom } from "@/components/story/props/room";
import type { StudioLights } from "@/components/story/acts/cards/lighting";

/**
 * The fall into the room (`c-drop`): the page colour dissolves from the
 * box's place on screen (noise plus a radial reveal) and the living room
 * fades in around it, its lamps warming up, while the studio light of the
 * card stage hands over to the room's own rig. Before the drop the room is
 * hidden (the page covers it); at the end of the drop everything of the
 * room is revealed and lit, as the room act expects at `r-land`.
 *
 * The box's reflections swap from the studio's to the room's half way (the
 * two maps are the same size, so no program changes), with the reflection
 * strength dipping through the swap so it never pops.
 */

const ndc = new Vector3();
/** The studio reflections' strength on the box over the page. */
const STUDIO_ENV = 0.8;

export class RoomReveal {
  private phase: RoomPhase | null = null;
  private lamps = -1;
  private presence = -1;
  private grade = "";
  /** The box's reflective materials, to move their reflection strength without a program change. */
  private readonly boxMaterials: MeshStandardMaterial[] = [];

  constructor(
    private readonly room: StoryRoom,
    private readonly studio: StudioLights,
    private readonly box: DeckBox,
  ) {
    room.setLayer(STORY_LAYERS.behind);
    const seen = new Set<MeshStandardMaterial>();
    box.root.traverse((object) => {
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

  /** Every frame the act is active (and while near in r-land, before the room act takes over). */
  update(ctx: StoryContext, state: ActState, boxPosition: Vector3) {
    const drop = state.beat("c-drop");
    const scheme = ctx.palette.scheme;
    if (drop <= 0) {
      this.setPhase("hidden");
      this.studio.set(1, scheme);
      this.setEnv(this.studio.env, STUDIO_ENV);
      if (state.t >= 0) ctx.stage.backdrop.set({ paint: 1, reveal: 0 });
      else ctx.stage.backdrop.set({ paint: 0, reveal: 0 });
      return;
    }
    const reveal = smoothstep(0.1, 0.74, drop);
    const presence = smoothstep(0.08, 0.8, drop);
    this.setPhase(reveal > 0 ? "crane" : "hidden");
    this.setGrade(scheme);
    this.setLamps(0.2 + 0.8 * smoothstep(0.15, 1, drop));
    this.setPresence(presence);
    this.studio.set(1 - presence, scheme);
    // The reflections: the studio's, dipping out, then the room's, rising in.
    const swap = 0.42;
    const roomEnv = this.room.envMap;
    if (drop < swap || !roomEnv)
      this.setEnv(this.studio.env, STUDIO_ENV * (1 - smoothstep(0.2, swap, drop)));
    else this.setEnv(roomEnv, smoothstep(swap, 0.7, drop));

    ndc.copy(boxPosition).project(ctx.stage.camera);
    ctx.stage.backdrop.set({
      paint: 1,
      reveal,
      origin: [ndc.x, ndc.y],
      noise: 0.42,
      edge: 0.32 * (1 - smoothstep(0.6, 0.74, drop)),
      edgeColor: scheme === "light" ? 0xf7bf33 : 0xffc978,
    });
    if (reveal > 0.55) ctx.setHeaderTone("dark");
  }

  /** `r-land` (near, before the room act's own update): the room as the drop left it. */
  landed(ctx: StoryContext) {
    this.setPhase("land");
    this.setGrade(ctx.palette.scheme);
    this.setLamps(1);
    this.setPresence(1);
    this.studio.set(0, ctx.palette.scheme);
  }

  /** The act left its window: hand the room back hidden and the studio off. */
  sleep(ctx: StoryContext) {
    this.studio.set(0, ctx.palette.scheme);
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
