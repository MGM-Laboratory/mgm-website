import { MathUtils, Quaternion, Vector3, type PerspectiveCamera } from "three";

import type { StorySize } from "@/components/story/engine/act";
import { CARD_STAGE, SHOT_LAND, fovForAspect } from "@/components/story/engine/frame";

/**
 * The card act's own frame, the "stage": origin at the card stage point S
 * (SPEC 2.4a), x to the right of the screen, y up, z toward the camera.
 * In the room's frame that is x = world -z, y = world +y, z = world +x, a
 * quarter turn about +y. A card at rest in this frame stands upright with
 * its back to the camera, so every pose of the act is written here and
 * the stage group carries it into the room.
 *
 * The camera rests at `STAGE_DISTANCE` along +z from S, looking at S, with
 * the frame's long lens (`fovForAspect(14, 24)`). Sizes on screen come from
 * that resting camera, not from the camera's small drifts toward the
 * cursor, so the drifts show depth.
 */

export const STAGE_ORIGIN = new Vector3(...CARD_STAGE.centre);

/** The stage group's rotation: the stage frame in the room's frame. */
export const STAGE_YAW = Math.PI / 2;
export const STAGE_QUATERNION = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), STAGE_YAW);

/** The camera's resting distance from S along the stage's +z. */
export const STAGE_DISTANCE = CARD_STAGE.distance;

export const SHOT_LAND_POSITION = new Vector3(...SHOT_LAND.position);
export const SHOT_LAND_TARGET = new Vector3(...SHOT_LAND.target);

/** The card stage's vertical FOV (degrees) for `aspect`. */
export function stageFov(aspect: number) {
  return fovForAspect(CARD_STAGE.fovLandscapeDeg, CARD_STAGE.fovPortraitDeg, aspect);
}

/** The landing shot's vertical FOV (degrees) for `aspect`. */
export function landFov(aspect: number) {
  return fovForAspect(SHOT_LAND.fovLandscapeDeg, SHOT_LAND.fovPortraitDeg, aspect);
}

/** A stage point in the room's frame. */
export function stageToWorld(x: number, y: number, z: number, out: Vector3) {
  return out.set(STAGE_ORIGIN.x + z, STAGE_ORIGIN.y + y, STAGE_ORIGIN.z - x);
}

/** A room point in the stage frame. */
export function worldToStage(point: Vector3, out: Vector3) {
  return out.set(STAGE_ORIGIN.z - point.z, point.y - STAGE_ORIGIN.y, point.x - STAGE_ORIGIN.x);
}

/**
 * The resting stage camera's view at a depth: half extents (metres) and
 * the metres per CSS px there. `depth` is the distance from the camera
 * along the view axis (stage z = STAGE_DISTANCE - depth).
 */
export type StageView = {
  /** tan(fov / 2) of the resting camera. */
  tanHalf: number;
  aspect: number;
  /** CSS px of the canvas. */
  width: number;
  height: number;
};

export function stageView(size: StorySize, out: StageView): StageView {
  out.tanHalf = Math.tan(MathUtils.degToRad(stageFov(size.aspect)) / 2);
  out.aspect = size.aspect;
  out.width = size.width;
  out.height = size.height;
  return out;
}

/** Half the view height (metres) at `depth`. */
export function halfHeightAt(view: StageView, depth: number) {
  return depth * view.tanHalf;
}

/** Half the view width (metres) at `depth`. */
export function halfWidthAt(view: StageView, depth: number) {
  return depth * view.tanHalf * view.aspect;
}

/**
 * The stage point seen at normalised screen position (nx, ny) in -1..1
 * (x right, y up) at `depth` from the resting camera.
 */
export function screenToStage(
  view: StageView,
  nx: number,
  ny: number,
  depth: number,
  out: Vector3,
) {
  const hy = depth * view.tanHalf;
  return out.set(nx * hy * view.aspect, ny * hy, STAGE_DISTANCE - depth);
}

/** The depth at which a thing `worldHeight` tall spans `px` CSS px on the resting camera. */
export function depthForHeight(view: StageView, worldHeight: number, px: number) {
  return (worldHeight * view.height) / (2 * view.tanHalf * Math.max(1, px));
}

/** Points `camera` from `position` at `target` (room frame), with a vertical FOV in degrees. */
export function aimCamera(
  camera: PerspectiveCamera,
  position: Vector3,
  target: Vector3,
  fovDeg: number,
  near: number,
  far: number,
) {
  camera.position.copy(position);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.fov = fovDeg;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
