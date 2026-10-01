import { Vector3 } from "three";

import {
  cubicInOut,
  fit,
  mix,
  smoothstep,
  stepSpring,
  type ActState,
  type StoryContext,
} from "@/components/story/engine/act";
import {
  SHOT_LAND_POSITION,
  SHOT_LAND_TARGET,
  STAGE_DISTANCE,
  STAGE_ORIGIN,
  aimCamera,
  landFov,
  stageFov,
  stageToWorld,
} from "@/components/story/acts/cards/stage-space";

/**
 * The card act's camera: a locked-off stage (SPEC CREATIVE 6) whose only
 * moves are a slow push across the show and a small drift toward the
 * cursor, then, in `c-drop`, a crane down with the falling box into the
 * landing shot `a_land`, where the room act takes it.
 *
 * The drift is a spring on the clock, weighted to 0 during the entrance
 * (the glue) and by the end of the drop, so the hand-off lands exactly on
 * SHOT_LAND.
 */

const position = new Vector3();
const target = new Vector3();
const crane = new Vector3();

export class CameraDirector {
  private readonly drift: [number, number] = [0, 0];
  private readonly driftV: [number, number] = [0, 0];
  private readonly lift: [number, number] = [0, 0];

  update(ctx: StoryContext, state: ActState, box: Vector3) {
    const camera = ctx.stage.camera;
    const dt = ctx.clock.dt;
    const t = state.t;
    const drop = state.beat("c-drop");
    const aspect = ctx.size.aspect;

    // The drift toward the cursor: none while the box is glued to the page, gone by the landing.
    const weight = smoothstep(0.1, 0.9, state.beat("c-rise")) * (1 - smoothstep(0.05, 0.55, drop));
    const px = ctx.pointer.inside ? ctx.pointer.ndc.x : 0;
    const py = ctx.pointer.inside ? ctx.pointer.ndc.y : 0;
    stepSpring(this.drift, px, dt, 18, 7);
    stepSpring(this.lift, py, dt, 18, 7);
    this.driftV[0] = this.drift[0] * weight;
    this.driftV[1] = this.lift[0] * weight;

    // The slow push: 0.8 m at the rest, a little closer through the show, back for the gather.
    const push = fit(t, 1, 8.6, 0, 1) * (1 - smoothstep(0, 0.5, state.beat("c-gather"))) * 0.05;
    const distance = STAGE_DISTANCE - push;
    stageToWorld(this.driftV[0] * 0.012, this.driftV[1] * 0.008, distance, position);
    target.copy(STAGE_ORIGIN);
    let fov = stageFov(aspect);
    let near = 0.01;
    let far = 40;

    if (drop > 0) {
      // The crane: down with the box, then into the landing shot. The aim follows the box first.
      const k = cubicInOut(fit(drop, 0.03, 1, 0, 1));
      crane.copy(position).lerp(SHOT_LAND_POSITION, k);
      // A slight rise of the path's middle keeps the lens clear of the lamp and the box.
      crane.y += Math.sin(k * Math.PI) * 0.03;
      position.copy(crane);
      const aimOnBox = 1 - smoothstep(0.3, 0.97, drop);
      target.copy(SHOT_LAND_TARGET).lerp(box, aimOnBox);
      fov = mix(fov, landFov(aspect), smoothstep(0.08, 0.95, drop));
      near = mix(0.01, 0.02, drop);
      far = mix(40, 60, drop);
    }
    aimCamera(camera, position, target, fov, near, far);
  }
}
