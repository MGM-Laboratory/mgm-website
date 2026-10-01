import { Vector3, type PerspectiveCamera } from "three";

import type { StoryContext } from "@/components/story/engine/act";
import { fovForAspect } from "@/components/story/engine/frame";

import { wobble, type CameraShot } from "./common";

/** How much taller the lens gets on a 9:16 screen than on 16:9 (capped at `PORTRAIT_MAX`). */
const PORTRAIT_GAIN = 1.42;
const PORTRAIT_MAX = 84;

/**
 * The vertical FOV for a shot authored on 16:9, on a screen of `aspect`.
 * A phone held upright keeps the subject and some of the world around her:
 * the lens opens on a log-aspect scale (`fovForAspect`), weighted by
 * `widen` (0 keeps `fov` exactly).
 */
export function portraitFov(fov: number, aspect: number, widen = 1) {
  if (widen <= 0) return fov;
  const tall = Math.min(PORTRAIT_MAX, Math.max(fov, fov * PORTRAIT_GAIN));
  const wide = fovForAspect(fov, tall, aspect);
  return fov + (wide - fov) * Math.min(1, widen);
}

/**
 * Puts a `CameraShot` on the stage camera: the scrubbed pose (position,
 * target, lens, Dutch roll) first, then two life layers on top that never
 * change the story: handheld noise on the clock and a small look-around
 * toward the cursor (a finger does nothing here: touch has no hover, and a
 * drag scrolls the page).
 */
export class CameraRig {
  private yaw = 0;
  private pitch = 0;
  private readonly aim = new Vector3();

  /** `time` is the act's life clock; `dt` its step. */
  apply(ctx: StoryContext, shot: CameraShot, time: number, dt: number, near = 0.06, far = 900) {
    const camera = ctx.stage.camera;
    const pointer = ctx.pointer;
    const mouse = pointer.type === "mouse" && pointer.inside;
    const k = 1 - Math.exp(-3 * dt);
    this.yaw += ((mouse ? -pointer.ndc.x * shot.look : 0) - this.yaw) * k;
    this.pitch += ((mouse ? pointer.ndc.y * shot.look * 0.6 : 0) - this.pitch) * k;
    // A narrow (portrait) screen aims part way toward her, so a shot framed beside her keeps her.
    const narrow =
      Math.min(1, Math.max(0, (1.25 - ctx.size.aspect) / 0.7)) * shot.hold * shot.widen;
    if (narrow > 0) {
      this.aim.copy(shot.target);
      shot.target.lerp(shot.subject, 0.78 * narrow);
      place(camera, shot, time, this.yaw, this.pitch);
      shot.target.copy(this.aim);
    } else {
      place(camera, shot, time, this.yaw, this.pitch);
    }
    camera.fov = portraitFov(shot.fov, ctx.size.aspect, shot.widen);
    camera.near = near;
    camera.far = far;
    camera.aspect = ctx.size.aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  /** Forget the cursor drift (a fresh arrival). */
  reset() {
    this.yaw = 0;
    this.pitch = 0;
  }
}

/** The shot plus handheld noise and the look-around offsets. */
export function place(
  camera: PerspectiveCamera,
  shot: CameraShot,
  time: number,
  yaw = 0,
  pitch = 0,
) {
  camera.position.copy(shot.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(shot.target);
  if (shot.roll !== 0) camera.rotateZ(shot.roll);
  if (shot.shake > 0) {
    camera.rotateY(shot.shake * wobble(time * 1.7, 1));
    camera.rotateX(shot.shake * 0.8 * wobble(time * 1.9, 2));
    camera.rotateZ(shot.shake * 0.5 * wobble(time * 1.3, 3));
  }
  if (yaw !== 0) camera.rotateY(yaw);
  if (pitch !== 0) camera.rotateX(pitch);
  camera.fov = shot.fov;
}
