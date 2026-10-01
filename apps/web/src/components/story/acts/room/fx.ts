import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";

import { hash01 } from "@/components/story/props/deck-shared";

/**
 * Small effects of the table act, each one draw call: contact shadows under
 * everything that stands on the table (the baked table receives no
 * shadows), dust motes drifting in the pendant's light, the puff of dust
 * the box raises when it settles, and a pool of light the spark throws on
 * the table top. All of them live in the room frame (identity parent).
 */

// ------------------------------------------------------------------ contact shadows

const SHADOW_VERTEX = /* glsl */ `
attribute float aOpacity;
attribute float aRound;
varying vec2 vUv;
varying float vOpacity;
varying float vRound;
void main() {
  vUv = uv * 2.0 - 1.0;
  vOpacity = aOpacity;
  vRound = aRound;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
varying vec2 vUv;
varying float vOpacity;
varying float vRound;
void main() {
  // A rounded rectangle (vRound 0) to a disc (1), soft all the way: the contact is dark, the edge fades.
  vec2 q = abs(vUv);
  float box = length(max(q - vec2(0.55), 0.0)) / 0.45;
  float disc = length(vUv);
  float d = mix(box, disc, vRound);
  float a = pow(1.0 - smoothstep(0.0, 1.0, d), 1.6);
  gl_FragColor = vec4(uColour, a * vOpacity);
}
`;

export type ShadowSlot = {
  /** Centre on the table, metres (y is the table top). */
  readonly position: Vector3;
  /** Size across x and z of the shadow's own frame, metres. */
  width: number;
  depth: number;
  /** Turn about +y, radians. */
  yaw: number;
  opacity: number;
  /** 0 a rounded rectangle, 1 a disc. */
  round: number;
};

export class ContactShadows {
  readonly mesh: InstancedMesh;
  readonly slots: ShadowSlot[] = [];
  private readonly opacity: InstancedBufferAttribute;
  private readonly roundness: InstancedBufferAttribute;
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(count: number, colour = 0x07080b) {
    const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const material = new ShaderMaterial({
      uniforms: { uColour: { value: new Color(colour) } },
      vertexShader: SHADOW_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.name = "story-room-contact-shadows";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.opacity = new InstancedBufferAttribute(new Float32Array(count), 1).setUsage(
      DynamicDrawUsage,
    );
    this.roundness = new InstancedBufferAttribute(new Float32Array(count), 1);
    geometry.setAttribute("aOpacity", this.opacity);
    geometry.setAttribute("aRound", this.roundness);
    for (let i = 0; i < count; i += 1) {
      this.slots.push({
        position: new Vector3(),
        width: 0.01,
        depth: 0.01,
        yaw: 0,
        opacity: 0,
        round: 0,
      });
    }
  }

  commit() {
    this.slots.forEach((slot, i) => {
      this.quaternion.setFromAxisAngle(this.up, slot.yaw);
      this.scale.set(Math.max(1e-5, slot.width), 1, Math.max(1e-5, slot.depth));
      this.matrix.compose(slot.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.opacity.set([Math.max(0, slot.opacity)], i);
      this.roundness.set([slot.round], i);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.opacity.needsUpdate = true;
    this.roundness.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
    this.mesh.removeFromParent();
  }
}

// ------------------------------------------------------------------ dust motes

const MOTE_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uSize;
uniform float uViewport;
uniform vec3 uCentre;
uniform vec3 uHalf;
uniform vec3 uLight;
uniform float uCone;
varying float vAlpha;
void main() {
  // Each mote drifts on its own slow loop inside a box over the table, sinking a little and rising back.
  vec3 p = uCentre + (aSeed.xyz * 2.0 - 1.0) * uHalf;
  float t = uTime * (0.05 + 0.06 * aSeed.w) + aSeed.w * 37.0;
  p.x += sin(t * 2.1 + aSeed.y * 17.0) * uHalf.x * 0.18;
  p.z += cos(t * 1.7 + aSeed.x * 13.0) * uHalf.z * 0.18;
  p.y += sin(t * 1.3 + aSeed.z * 11.0) * uHalf.y * 0.12;
  // Lit only inside the lamp's cone: brightest on its axis.
  vec3 toMote = p - uLight;
  float along = clamp(dot(normalize(toMote), vec3(0.0, -1.0, 0.0)), 0.0, 1.0);
  float lit = smoothstep(uCone, 1.0, along);
  float twinkle = 0.65 + 0.35 * sin(uTime * (1.1 + aSeed.w * 1.7) + aSeed.x * 40.0);
  vAlpha = lit * twinkle;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uViewport / max(0.05, -mv.z) * (0.6 + 0.8 * aSeed.w), 1.0, 28.0);
}
`;

const MOTE_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uIntensity;
varying float vAlpha;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  float a = exp(-r * 4.0) * vAlpha * uIntensity;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColour * a, 1.0);
  #include <colorspace_fragment>
}
`;

export class DustMotes {
  readonly points: Points;
  private readonly uniforms;

  constructor(count: number, centre: Vector3, half: Vector3, light: Vector3) {
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      seeds.set([hash01(i, 11), hash01(i, 23), hash01(i, 37), hash01(i, 41)], i * 4);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seeds, 4));
    this.uniforms = {
      uTime: { value: 0 },
      uSize: { value: 0.0016 },
      uViewport: { value: 900 },
      uCentre: { value: centre.clone() },
      uHalf: { value: half.clone() },
      uLight: { value: light.clone() },
      uCone: { value: 0.72 },
      uColour: { value: new Color(0xffe2b8) },
      uIntensity: { value: 0 },
    };
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.points = new Points(geometry, material);
    this.points.name = "story-room-motes";
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  update(time: number, viewportHeightPx: number, fovDeg: number, intensity: number) {
    this.uniforms.uTime.value = time;
    // Pixels per metre at 1 m: a mote keeps its real size at any FOV.
    this.uniforms.uViewport.value = viewportHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.uniforms.uIntensity.value = intensity;
    this.points.visible = intensity > 0.002;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
    this.points.removeFromParent();
  }
}

// ------------------------------------------------------------------ dust puff

const PUFF_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uProgress;
uniform vec3 uOrigin;
uniform vec2 uHalf;
uniform float uYaw;
uniform float uSize;
uniform float uViewport;
varying float vAlpha;
void main() {
  // Dust squeezed out from under the box's edges: out along the table, a little up, slowing, fading.
  float k = clamp(uProgress * (0.85 + 0.3 * aSeed.w) - aSeed.z * 0.12, 0.0, 1.0);
  float side = floor(aSeed.x * 4.0);
  float along = aSeed.y * 2.0 - 1.0;
  vec2 edge = side < 1.0 ? vec2(1.0, along) : side < 2.0 ? vec2(-1.0, along) : side < 3.0 ? vec2(along, 1.0) : vec2(along, -1.0);
  vec2 outward = side < 2.0 ? vec2(sign(edge.x), 0.0) : vec2(0.0, sign(edge.y));
  float travel = (1.0 - exp(-k * 4.0)) * (0.012 + 0.02 * aSeed.w);
  vec2 local = edge * uHalf + outward * travel;
  float c = cos(uYaw);
  float s = sin(uYaw);
  vec3 p = uOrigin + vec3(local.x * c + local.y * s, 0.0015 + k * (0.004 + 0.01 * aSeed.z), -local.x * s + local.y * c);
  vAlpha = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.35, 1.0, k)) * (k > 0.0 && k < 1.0 ? 1.0 : 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * (0.7 + 1.6 * k) * uViewport / max(0.05, -mv.z), 1.0, 48.0);
}
`;

const PUFF_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uIntensity;
varying float vAlpha;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(q, q) * 3.0) * vAlpha * uIntensity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColour, a);
}
`;

export class DustPuff {
  readonly points: Points;
  private readonly uniforms;

  constructor(count: number) {
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      seeds.set([hash01(i, 5), hash01(i, 7), hash01(i, 9), hash01(i, 13)], i * 4);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seeds, 4));
    this.uniforms = {
      uProgress: { value: 0 },
      uOrigin: { value: new Vector3() },
      uHalf: { value: new Vector2(0.03, 0.045) },
      uYaw: { value: 0 },
      uSize: { value: 0.006 },
      uViewport: { value: 900 },
      uColour: { value: new Color(0xb9ab97) },
      uIntensity: { value: 0.5 },
    };
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: PUFF_VERTEX,
      fragmentShader: PUFF_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      toneMapped: false,
    });
    this.points = new Points(geometry, material);
    this.points.name = "story-room-dust-puff";
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  /** `progress` 0..1 of the puff (scrubbed), around a footprint `halfX` by `halfZ` turned by `yaw`. */
  set(
    origin: Vector3,
    halfX: number,
    halfZ: number,
    yaw: number,
    progress: number,
    viewportHeightPx: number,
    fovDeg: number,
    intensity: number,
  ) {
    const u = this.uniforms;
    u.uOrigin.value.copy(origin);
    u.uHalf.value.set(halfX, halfZ);
    u.uYaw.value = yaw;
    u.uProgress.value = progress;
    u.uViewport.value = viewportHeightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    u.uIntensity.value = intensity;
    this.points.visible = progress > 0 && progress < 1 && intensity > 0.002;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
    this.points.removeFromParent();
  }
}

// ------------------------------------------------------------------ light pool

const POOL_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(uColour * a * uIntensity, 1.0);
  #include <colorspace_fragment>
}
`;

const POOL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** A soft pool of light on the table top under a glowing thing (the spark, then her glow). */
export class LightPool {
  readonly mesh: Mesh;
  private readonly uniforms;

  constructor(colour: number) {
    this.uniforms = {
      uColour: { value: new Color(colour) },
      uIntensity: { value: 0 },
    };
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: POOL_VERTEX,
      fragmentShader: POOL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
    this.mesh.name = "story-room-light-pool";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Under `source`, on the plane y = `floorY`: wider and fainter the higher the source. */
  set(source: Vector3, floorY: number, intensity: number) {
    const height = Math.max(0.005, source.y - floorY);
    const size = 0.05 + height * 1.4;
    this.mesh.position.set(source.x, floorY + 0.0006, source.z);
    this.mesh.scale.set(size, 1, size);
    const falloff = 1 / (1 + (height / 0.06) * (height / 0.06));
    this.uniforms.uIntensity.value = intensity * falloff;
    this.mesh.visible = intensity * falloff > 0.003;
  }

  /** A pool of an explicit size: `width` by `depth` metres on the plane y = `y`, turned by `yaw`. */
  place(centre: Vector3, width: number, depth: number, yaw: number, intensity: number) {
    this.mesh.position.set(centre.x, centre.y + 0.0006, centre.z);
    this.mesh.scale.set(width, 1, depth);
    this.mesh.rotation.set(0, yaw, 0);
    this.uniforms.uIntensity.value = intensity;
    this.mesh.visible = intensity > 0.003;
  }

  setColour(colour: number) {
    this.uniforms.uColour.value.setHex(colour);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
    this.mesh.removeFromParent();
  }
}

/** Every object of `root` on `layer` only (meshes, points and groups alike). */
export function setLayerDeep(root: Object3D, layer: number) {
  root.traverse((object) => {
    object.layers.set(layer);
  });
}
