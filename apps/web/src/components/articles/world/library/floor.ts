import { Color, Mesh, PlaneGeometry, ShaderMaterial } from "three";

import { FLOOR_Y, NEAR_Z, farZ } from "@/components/articles/world/library/layout";
import {
  LIBRARY_COMMON,
  type LibraryUniforms,
} from "@/components/articles/world/library/library-glsl";
import { WORLD_PALETTE } from "@/components/articles/world/palette";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The nave's floor: pale marble in large veined tiles, and down its middle a
 * river of light flowing toward the great window (faster while the list
 * scrolls, like the cards it carries), catching the window's glow in a long
 * reflection and the lanterns' warmth in pools.
 */

const FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  ${LIBRARY_COMMON}
  uniform vec3 uStoneLight;
  uniform vec3 uStoneDark;
  uniform vec3 uRiverLight;
  uniform vec3 uRiverDark;
  uniform float uFar;
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    float dark = darkAt();
    vec2 css = worldFragCss();
    vec3 local = vWorld / uEnvScale;
    vec2 p = local.xz;
    // Marble: big tiles, soft veins, a faint sheen.
    vec2 tile = abs(fract(p / 2.6) - 0.5);
    float grout = smoothstep(0.485, 0.5, max(tile.x, tile.y));
    float vein = worldNoise(p * 0.7 + worldNoise(p * 0.25) * 3.0);
    vein = smoothstep(0.55, 0.62, vein) - smoothstep(0.62, 0.7, vein);
    vec3 stone = mix(uStoneLight, uStoneDark, dark);
    stone *= 1.0 - grout * mix(0.05, 0.3, dark) - vein * mix(0.03, 0.08, dark);
    stone = themeTint(stone, dark);

    // The river: a band down the nave's middle, its current running toward the window.
    float halfWidth = max(uNaveHalf * 0.3, 0.9);
    float bank = abs(p.x) / halfWidth;
    float band = exp(-pow(bank, 2.4) * 2.2);
    float flow = worldNoise(vec2(p.x * 0.9, p.y * 0.35 + uFlow)) * 0.55
               + worldNoise(vec2(p.x * 2.3 + 4.0, p.y * 1.1 + uFlow * 1.9)) * 0.3
               + worldNoise(vec2(p.x * 5.0, p.y * 2.6 + uFlow * 3.1)) * 0.15;
    float glints = smoothstep(0.72, 0.9, worldNoise(vec2(p.x * 7.0, p.y * 3.5 + uFlow * 4.0)));
    vec3 river = themeTint(mix(uRiverLight, uRiverDark, dark), dark);
    float toWindow = smoothstep(0.0, 1.0, clamp(p.y / uFar, 0.0, 1.0));
    float light = band * (0.42 + 0.46 * flow + glints * 0.45) * (0.7 + 0.5 * toWindow);
    float stream = clamp(light, 0.0, 1.0) * mix(0.75, 0.9, dark);
    vec3 color = mix(stone, river, stream);
    // Gold glints by day (white on white would never show), blue fire by night.
    vec3 glint = mix(vec3(0.95, 0.78, 0.42), river * 1.6, dark);
    color = mix(color, glint, glints * band * mix(0.55, 0.0, dark));
    color += river * (glints * 0.9 + flow * 0.25) * band * dark;
    // Pools of lantern light on the marble.
    color += (stone * 0.8 + 0.1) * lanternLight(local, vec3(0.0, 1.0, 0.0), css) * mix(0.8, 1.3, dark);
    color += uFlood * vec3(0.35, 0.3, 0.2) * (0.4 + band);
    // The river is light: it carries through the fog further than the
    // marble does, a luminous path running away to the window.
    float shine = clamp(band * (0.5 + glints), 0.0, 1.0);
    vec3 marble = libraryFog(color, vDepth, vWorld.y, dark);
    vec3 lit = libraryFogReach(color, vDepth, vWorld.y, dark, 2.2);
    gl_FragColor = vec4(mix(marble, lit, shine), 1.0);
  }
`;

export type Floor = {
  mesh: Mesh;
  setNaveHalf(half: number): void;
  dispose(): void;
};

export function createFloor(
  world: WorldUniforms,
  library: LibraryUniforms,
  options: { bays: number },
): Floor {
  const far = farZ(options.bays) - 4;
  const near = NEAR_Z + 12;
  const material = new ShaderMaterial({
    uniforms: {
      ...world,
      ...library,
      uStoneLight: { value: new Color(WORLD_PALETTE.light.stone) },
      uStoneDark: { value: new Color("#07090E") },
      uRiverLight: { value: new Color(WORLD_PALETTE.light.river) },
      uRiverDark: { value: new Color(WORLD_PALETTE.dark.river) },
      uFar: { value: far },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: FRAGMENT,
  });
  const geometry = new PlaneGeometry(1, 1, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(0, FLOOR_Y, (near + far) / 2);
  mesh.frustumCulled = false;
  return {
    mesh,
    setNaveHalf(half) {
      mesh.scale.set(2 * half + 6, 1, near - far);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
