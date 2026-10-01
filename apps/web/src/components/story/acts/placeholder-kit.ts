import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  Vector3,
  type PerspectiveCamera,
} from "three";

import type { ActState, StoryContext, StoryLabel } from "@/components/story/engine/act";
import type { Vec3 } from "@/components/story/engine/frame";

/**
 * Shared pieces of the spine's placeholder acts (coloured shapes, a label
 * naming the beat, a camera move per beat). Wave 2 replaces each act; this
 * kit goes with the last placeholder.
 */

declare module "@/components/story/engine/act" {
  interface StoryPropMap {
    placeholderLights: Group;
  }
}

/** Soft key, fill and sky light for the placeholders, on every layer. */
export function placeholderLights(ctx: StoryContext) {
  return ctx.props.ensure("placeholderLights", () => {
    const group = new Group();
    group.name = "placeholder-lights";
    const hemi = new HemisphereLight(0xf4f1ea, 0x3a3f52, 1.4);
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 3.5, 1.5);
    const fill = new AmbientLight(0xffffff, 0.35);
    group.add(hemi, key, key.target, fill);
    for (const light of [hemi, key, fill]) light.layers.enableAll();
    ctx.stage.rootScene.add(group);
    return group;
  });
}

export async function beatLabel(ctx: StoryContext, height: number, color = "#0e1116") {
  const labels = await ctx.props.ensure("labels", () => {
    throw new Error("labels are registered by the engine");
  });
  return labels.create({ height, color, background: "rgba(255,255,255,0.72)" });
}

/** "c-open 0.42": the beat and its progress. */
export function beatText(state: ActState) {
  return `${state.current ?? state.act} ${state.local.toFixed(2)}`;
}

const target = new Vector3();

/** Points the camera from `position` at `look` with a vertical FOV in degrees. */
export function aim(
  camera: PerspectiveCamera,
  position: Vector3 | Vec3,
  look: Vector3 | Vec3,
  fovDeg: number,
) {
  if (position instanceof Vector3) camera.position.copy(position);
  else camera.position.set(position[0], position[1], position[2]);
  if (look instanceof Vector3) target.copy(look);
  else target.set(look[0], look[1], look[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.fov = fovDeg;
  camera.near = 0.005;
  camera.far = 200;
  camera.updateMatrixWorld();
}

/** Keeps a label near the camera's view, facing it (sprites always face the camera). */
export function placeLabel(label: StoryLabel, at: Vector3 | Vec3) {
  if (at instanceof Vector3) label.object.position.copy(at);
  else label.object.position.set(at[0], at[1], at[2]);
}

export function vec(v: Vec3) {
  return new Vector3(v[0], v[1], v[2]);
}
