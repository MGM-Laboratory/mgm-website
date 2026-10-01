import { Vector3, type PerspectiveCamera } from "three";

import type { StoryContext, StoryHotspot, StoryRect } from "@/components/story/engine/act";
import { STORY_FLIGHT, STORY_HINTS, STORY_WORLDS } from "@/data/story";

/**
 * The act's overlay: the world captions (Geist Mono, top left) that latch
 * on at each world's start, the "Hold to slow time." hint in World 01 (until
 * the visitor has held once), and a real button over Godette for keyboard
 * and screen reader visitors (it cheers her on: a spin and a laugh).
 */
export class WorldsHud {
  private hotspot: StoryHotspot | null = null;
  private held = false;
  private readonly centre = new Vector3();
  private readonly view = new Vector3();

  init(ctx: StoryContext, cheer: () => void) {
    this.hotspot = ctx.overlay.hotspot({
      id: "worlds-godette",
      label: STORY_FLIGHT.cheer,
      onActivate: cheer,
    });
  }

  /** Captions and the hint for world `index` (0..4) at its beat progress `p`, or nothing. */
  update(ctx: StoryContext, index: number | null, p: number) {
    if (ctx.director.held) this.held = true;
    if (index === null) return;
    const world = STORY_WORLDS.at(index);
    if (world && p > 0.03 && p < 0.42) ctx.overlay.setHud(world.caption);
    // While the low middle of Paper Tide's frame is the dark sea (her wake turns cards white later).
    if (index === 0 && !this.held && p > 0.04 && p < 0.24)
      ctx.overlay.setHint(STORY_HINTS.holdToSlow);
  }

  /** Places the button over her (a circle of `radius` metres around `centre`), or hides it. */
  place(ctx: StoryContext, camera: PerspectiveCamera, centre: Vector3 | null, radius: number) {
    const hotspot = this.hotspot;
    if (!hotspot) return;
    if (!centre) {
      hotspot.place(null);
      return;
    }
    this.view.copy(centre).applyMatrix4(camera.matrixWorldInverse);
    if (this.view.z > -0.2) {
      hotspot.place(null);
      return;
    }
    this.centre.copy(centre).project(camera);
    const { width, height } = ctx.size;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const r = (radius / (-this.view.z * tanV)) * (height / 2);
    const size = Math.max(44, Math.min(height * 0.6, r * 2));
    const x = (this.centre.x * 0.5 + 0.5) * width;
    const y = (1 - (this.centre.y * 0.5 + 0.5)) * height;
    if (x < -size || x > width + size || y < -size || y > height + size) {
      hotspot.place(null);
      return;
    }
    const rect: StoryRect = { x: x - size / 2, y: y - size / 2, width: size, height: size };
    hotspot.place(rect);
  }

  get hovered() {
    return this.hotspot?.hovered ?? false;
  }

  get focused() {
    return this.hotspot?.focused ?? false;
  }

  dispose() {
    this.hotspot?.dispose();
    this.hotspot = null;
  }
}
