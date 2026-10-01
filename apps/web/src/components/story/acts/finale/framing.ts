import type { PerspectiveCamera } from "three";

/**
 * The finale's camera: level (no tilt, so her verticals stay vertical),
 * straight on, at her eye line or a little under it, like lusion's
 * astronaut at the end but closer and friendlier.
 *
 * Her feet stand on a floor pinned to one screen height: where the top of
 * the "Let's work together." letters sits at the terminal rest, so the
 * words dock right under her feet as the block scrolls in. With a level
 * camera that pin is a ray: the camera moves along it, and its distance is
 * whatever makes the subject (her height plus headroom) reach `topY`.
 * Closer while she sits, farther as she stands, the floor never moves.
 *
 * Screen heights are fractions of the canvas from its top.
 */

export type Framing = Readonly<{
  /** Screen height of the floor (her feet), 0 top to 1 bottom. */
  floorY: number;
  /** Screen height the top of the subject should reach. */
  topY: number;
  /** Subject height above the floor, metres. */
  height: number;
  /** Half the width the frame must hold at her depth, metres. */
  halfWidth: number;
  fovDeg: number;
  aspect: number;
}>;

export type Shot = { distance: number; eye: number };

/** The camera slide (metres) that puts the floor point at `xFrac` across the frame (0 left, 1 right). */
export function sideFor(shot: Shot, xFrac: number, fovDeg: number, aspect: number) {
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  return -(2 * xFrac - 1) * shot.distance * tan * aspect;
}

/** Distance along the view axis and camera height for `framing` (the floor point is the origin). */
export function solveShot(framing: Framing, out: Shot): Shot {
  const tan = Math.tan((framing.fovDeg * Math.PI) / 360);
  const span = Math.max(0.05, framing.floorY - framing.topY);
  const byHeight = framing.height / (2 * tan * span);
  const byWidth = framing.halfWidth / (tan * Math.max(0.2, framing.aspect));
  const distance = Math.max(byHeight, byWidth);
  out.distance = distance;
  // A level camera puts the floor point at floorY when its height is this.
  out.eye = (2 * framing.floorY - 1) * distance * tan;
  return out;
}

/**
 * Places `camera` for `shot`, turned `yaw` radians about the vertical axis
 * through the floor point (`x`, `z`): the floor point keeps its screen
 * place while the view swings around her. `lift` raises the camera and its
 * aim together (a jolt), `side` slides both along the view's right axis
 * (her place across the frame), in metres.
 */
export function placeCamera(
  camera: PerspectiveCamera,
  shot: Shot,
  x: number,
  z: number,
  yaw: number,
  fovDeg: number,
  lift = 0,
  side = 0,
) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const y = shot.eye + lift;
  // `side` slides the camera along its own right axis (metres): she moves across the frame, level.
  const rx = c * side;
  const rz = -s * side;
  camera.position.set(x + s * shot.distance + rx, y, z + c * shot.distance + rz);
  camera.up.set(0, 1, 0);
  camera.lookAt(x + rx, y, z + rz);
  camera.fov = fovDeg;
  camera.near = Math.max(0.05, shot.distance * 0.1);
  camera.far = shot.distance * 6 + 20;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
