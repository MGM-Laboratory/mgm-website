import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PMREMGenerator,
  type Texture,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { StoryScheme } from "@/components/story/engine/act";
import { STAGE_ORIGIN } from "@/components/story/acts/cards/stage-space";

/**
 * The card stage's studio light: a soft key from the upper left, a cool
 * fill, a rim from behind that draws the cards' white edges, and a sky and
 * ground fill, plus a small studio reflection map. Over the plain page the
 * room's own rig is off (its `hidden` phase), so these light the box and
 * the cards; during the drop they fade out while the room's rig fades in.
 *
 * The light count never changes (every lit program counts the lights):
 * the lights are created once and only their intensity moves.
 */

export type StudioLights = {
  readonly group: Group;
  /** A PMREM of a neutral studio, the same size as the room's, so swapping the two never recompiles. */
  readonly env: Texture;
  /** 0 off, 1 the card stage's light. `scheme` tunes it for the page behind. */
  set(amount: number, scheme: StoryScheme): void;
  dispose(): void;
};

type Rig = { light: DirectionalLight; intensity: number };

export function createStudioLights(renderer: WebGLRenderer, envSize: number): StudioLights {
  const group = new Group();
  group.name = "cards-studio-lights";

  const key = new DirectionalLight(0xfff1e0, 0);
  key.position.set(STAGE_ORIGIN.x + 0.9, STAGE_ORIGIN.y + 1.1, STAGE_ORIGIN.z + 0.75);
  key.target.position.copy(STAGE_ORIGIN);
  const fill = new DirectionalLight(0xdfe8ff, 0);
  fill.position.set(STAGE_ORIGIN.x + 0.7, STAGE_ORIGIN.y - 0.25, STAGE_ORIGIN.z - 1.0);
  fill.target.position.copy(STAGE_ORIGIN);
  const rim = new DirectionalLight(0xffffff, 0);
  rim.position.set(STAGE_ORIGIN.x - 1.0, STAGE_ORIGIN.y + 0.6, STAGE_ORIGIN.z - 0.9);
  rim.target.position.copy(STAGE_ORIGIN);
  const sky = new HemisphereLight(0xf4f2ee, 0x8d93a3, 0);
  group.add(key, key.target, fill, fill.target, rim, rim.target, sky);
  for (const light of [key, fill, rim, sky]) light.layers.enableAll();

  const rigs: readonly Rig[] = [
    { light: key, intensity: 1.75 },
    { light: fill, intensity: 0.5 },
    { light: rim, intensity: 1.25 },
  ];

  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04, 0.1, 100, { size: envSize });
  room.dispose();
  pmrem.dispose();

  let last = -1;
  let lastScheme: StoryScheme | null = null;
  return {
    group,
    env: target.texture,
    set(amount, scheme) {
      if (amount === last && scheme === lastScheme) return;
      last = amount;
      lastScheme = scheme;
      // Over the dark page the key carries a little more and the sky less, so the box keeps its blue.
      const dark = scheme === "dark";
      for (const rig of rigs) rig.light.intensity = rig.intensity * amount * (dark ? 1.08 : 1);
      sky.intensity = (dark ? 0.4 : 0.5) * amount;
    },
    dispose() {
      group.removeFromParent();
      for (const light of [key, fill, rim, sky]) light.dispose();
      target.dispose();
    },
  };
}
