import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  NormalBlending,
  ShaderMaterial,
  Vector3,
} from "three";

import { BRAND } from "@/components/story/props/deck-shared";

/**
 * A ribbon of light behind a moving point: camera facing, tapered at both
 * ends, a soft glowing head and a tail that fades out. Two ways to feed it:
 *
 * - `push(point, time)`: a live history (the spark's idle flight, her glow
 *   while she flies freely). Points older than `life` seconds fade away.
 * - `follow(sample, head, length)`: a pure function of a path parameter,
 *   for anything scrubbed by scroll. The trail is the path itself between
 *   `head - length` and `head`, so scrolling back runs it back exactly.
 *
 * Add `trail.mesh` to a scene with an identity parent; points are in that
 * frame. One draw call, additive, never writes depth.
 */

export type MagicTrailOptions = {
  /** Samples along the ribbon (more is smoother; 48 is plenty for a screen-long trail). */
  points?: number;
  /** Half width at the widest, metres. */
  width?: number;
  /** Seconds a history point lives. */
  life?: number;
  head?: number;
  tail?: number;
  intensity?: number;
  /** Over the light page: normal blending (additive light vanishes on white). */
  onLight?: boolean;
};

export type MagicTrail = {
  readonly mesh: Mesh;
  push(point: Vector3, time: number): void;
  follow(sample: (u: number, out: Vector3) => void, head: number, length: number): void;
  /** Ages the history (fade) at `time`; call once a frame in history mode. */
  update(time: number): void;
  clear(): void;
  setWidth(width: number): void;
  setIntensity(intensity: number): void;
  /** Shows the ribbon for a compile pass (hidden objects are not compiled), then restores. */
  warm(on: boolean): void;
  setColours(head: number, tail: number): void;
  dispose(): void;
};

const VERTEX = /* glsl */ `
attribute vec3 aTangent;
attribute float aSide;
attribute float aT;
attribute float aFade;
uniform float uWidth;
varying float vT;
varying float vSide;
varying float vFade;
void main() {
  vT = aT;
  vSide = aSide;
  vFade = aFade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 tangent = (modelViewMatrix * vec4(aTangent, 0.0)).xyz;
  vec3 side = cross(normalize(tangent + vec3(1e-6)), normalize(mv.xyz));
  float len = length(side);
  side = len > 1e-5 ? side / len : vec3(0.0, 1.0, 0.0);
  // Taper: a quick swell at the head, a long thinning tail.
  float taper = smoothstep(0.0, 0.06, aT) * pow(1.0 - aT, 0.8);
  mv.xyz += side * aSide * uWidth * mix(0.35, 1.0, taper) * (0.25 + 0.75 * aFade);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uWhiten;
uniform vec3 uHead;
uniform vec3 uTail;
uniform float uIntensity;
varying float vT;
varying float vSide;
varying float vFade;
void main() {
  float edge = 1.0 - vSide * vSide;
  float core = pow(edge, 3.0);
  float alpha = pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.04, vT + 0.01) * vFade;
  vec3 col = mix(uHead, uTail, smoothstep(0.0, 0.7, vT));
  col = mix(col, vec3(1.0), core * (1.0 - vT) * 0.6 * uWhiten);
  gl_FragColor = vec4(col, clamp((edge * 0.55 + core * 0.9) * alpha * uIntensity, 0.0, 1.0));
}
`;

export function createMagicTrail(options: MagicTrailOptions = {}): MagicTrail {
  const count = Math.max(4, Math.floor(options.points ?? 48));
  const life = options.life ?? 0.6;
  const verts = count * 2;
  const pos = new Float32Array(verts * 3);
  const tan = new Float32Array(verts * 3);
  const side = new Float32Array(verts);
  const along = new Float32Array(verts);
  const fade = new Float32Array(verts);
  const idx: number[] = [];
  for (let i = 0; i < count; i++) {
    side.set([-1, 1], i * 2);
    along.set([i / (count - 1), i / (count - 1)], i * 2);
    if (i < count - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
  const tanAttr = new BufferAttribute(tan, 3).setUsage(DynamicDrawUsage);
  const fadeAttr = new BufferAttribute(fade, 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aTangent", tanAttr);
  geometry.setAttribute("aSide", new BufferAttribute(side, 1));
  geometry.setAttribute("aT", new BufferAttribute(along, 1));
  geometry.setAttribute("aFade", fadeAttr);
  geometry.setIndex(idx);

  const uniforms = {
    uWidth: { value: options.width ?? 0.004 },
    uHead: { value: new Color(options.head ?? 0xfff1cc) },
    uTail: { value: new Color(options.tail ?? BRAND.blue) },
    uIntensity: { value: options.intensity ?? 1 },
    uWhiten: { value: options.onLight ? 0 : 1 },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blending: options.onLight ? NormalBlending : AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "story-magic-trail";
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;

  // History ring (newest first when written out).
  const history = new Float32Array(count * 4);
  let filled = 0;
  const point = new Vector3();
  const prev = new Vector3();
  const next = new Vector3();

  const writeTangents = () => {
    for (let i = 0; i < count; i++) {
      prev.fromArray(pos, Math.max(0, i - 1) * 6);
      next.fromArray(pos, Math.min(count - 1, i + 1) * 6);
      next.sub(prev);
      next.toArray(tan, i * 6);
      next.toArray(tan, i * 6 + 3);
    }
    posAttr.needsUpdate = true;
    tanAttr.needsUpdate = true;
    fadeAttr.needsUpdate = true;
  };

  const trail: MagicTrail = {
    mesh,
    push(p, time) {
      history.copyWithin(4, 0, (count - 1) * 4);
      history.set([p.x, p.y, p.z, time], 0);
      filled = Math.min(count, filled + 1);
    },
    update(time) {
      for (let i = 0; i < count; i++) {
        const k = Math.min(i, Math.max(filled - 1, 0));
        point.fromArray(history, k * 4);
        const born = history.at(k * 4 + 3) ?? time;
        const f = filled === 0 || i >= filled ? 0 : Math.max(0, 1 - (time - born) / life);
        point.toArray(pos, i * 6);
        point.toArray(pos, i * 6 + 3);
        fade.set([f, f], i * 2);
      }
      writeTangents();
    },
    follow(sample, head, length) {
      for (let i = 0; i < count; i++) {
        sample(head - (length * i) / (count - 1), point);
        point.toArray(pos, i * 6);
        point.toArray(pos, i * 6 + 3);
        fade.set([1, 1], i * 2);
      }
      writeTangents();
    },
    clear() {
      filled = 0;
      fade.fill(0);
      fadeAttr.needsUpdate = true;
    },
    setWidth(width) {
      uniforms.uWidth.value = width;
    },
    setIntensity(intensity) {
      uniforms.uIntensity.value = intensity;
      mesh.visible = intensity > 0.001;
    },
    warm(on) {
      mesh.visible = on || uniforms.uIntensity.value > 0.001;
    },
    setColours(head, tail) {
      uniforms.uHead.value.setHex(head);
      uniforms.uTail.value.setHex(tail);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
  return trail;
}
