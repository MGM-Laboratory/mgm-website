import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
} from "three";

import type { StoryContext } from "@/components/story/engine/act";
import { hash01 } from "@/components/story/props/deck-shared";
import type { GodetteClip, GodetteFace } from "@/components/story/props/godette";

import {
  GLSL_COMMON,
  ShotTrack,
  chaseShot,
  createSkyLayer,
  ease01,
  fullscreenGeometry,
  type CameraShot,
  type FlightPose,
} from "./common";
import { Course, Walk } from "./course";
import { World, type WorldFrame, type WorldId } from "./world";

/**
 * A sketch of a world: its palette, a gradient sky and a field of brand
 * shapes, with a gentle course and a chase. The worlds that are not built
 * yet use it, so the whole act plays end to end.
 */

export type SketchSpec = Readonly<{
  id: WorldId;
  key: number;
  length: number;
  /** Extra course time past the world's own beat (the loss and the fall of the last world). */
  tail: number;
  zenith: number;
  horizon: number;
  ground: number;
  colours: readonly number[];
  geometry: () => BufferGeometry;
  clip: GodetteClip;
  pitchDeg: number;
  face: GodetteFace;
  entry: Vector3;
  exit: Vector3 | null;
}>;

const SKY_BODY = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform float uFreeze;
${GLSL_COMMON}
vec3 skyColour(vec3 d) {
  vec3 col = d.y > 0.0 ? mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.6)) : mix(uHorizon, uGround, pow(clamp(-d.y * 3.0, 0.0, 1.0), 0.5));
  return freezeGrade(col, uFreeze);
}
`;

const FIELD_VERTEX = /* glsl */ `
attribute vec3 aColour;
uniform float uTime;
varying vec3 vColour;
varying vec3 vNormal;
varying float vDist;
void main() {
  vColour = aColour;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vec4 mv = viewMatrix * world;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FIELD_FRAGMENT = /* glsl */ `
uniform vec3 uHorizon;
uniform float uFreeze;
varying vec3 vColour;
varying vec3 vNormal;
varying float vDist;
${GLSL_COMMON}
void main() {
  float light = 0.55 + 0.45 * max(dot(normalize(vNormal), normalize(vec3(0.4, 0.8, 0.3))), 0.0);
  vec3 col = vColour * light;
  col = fogMix(col, uHorizon, vDist, 0.006);
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

export class SketchWorld extends World {
  readonly id: WorldId;
  readonly key: number;
  readonly length: number;
  private walk: Walk | null = null;
  private track: ShotTrack | null = null;
  private sky: ReturnType<typeof createSkyLayer> | null = null;
  private readonly her = new Vector3();
  private readonly dir = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(private readonly spec: SketchSpec) {
    super();
    this.id = spec.id;
    this.key = spec.key;
    this.length = spec.length;
  }

  async build(ctx: StoryContext) {
    this.tier = ctx.tier;
    const spec = this.spec;
    this.setBackground(spec.horizon);
    const forward = new Vector3(0, 0, -1);
    this.setFrames(spec.entry, forward, spec.exit, spec.exit ? forward : null);
    const fullscreen = fullscreenGeometry();
    this.geometries.push(fullscreen);
    this.sky = createSkyLayer(fullscreen, SKY_BODY, {
      uZenith: { value: new Color(spec.zenith) },
      uHorizon: { value: new Color(spec.horizon) },
      uGround: { value: new Color(spec.ground) },
      uFreeze: this.uniforms.uFreeze,
    });
    this.materials.push(this.sky.material);
    this.scene.add(this.sky.mesh);

    const geometry = spec.geometry();
    this.geometries.push(geometry);
    const count = 160;
    const colours = new Float32Array(count * 3);
    const colour = new Color();
    for (let i = 0; i < count; i += 1) {
      colour.setHex(spec.colours.at(i % spec.colours.length) ?? 0xffffff);
      colours.set([colour.r, colour.g, colour.b], i * 3);
    }
    geometry.setAttribute("aColour", new InstancedBufferAttribute(colours, 3));
    const material = new ShaderMaterial({
      vertexShader: FIELD_VERTEX,
      fragmentShader: FIELD_FRAGMENT,
      uniforms: {
        uTime: this.uniforms.uTime,
        uHorizon: { value: new Color(spec.horizon) },
        uFreeze: this.uniforms.uFreeze,
      },
      toneMapped: false,
    });
    this.materials.push(material);
    const field = new InstancedMesh(geometry, material, count);
    const dummy = new Object3D();
    const start = spec.entry.z;
    for (let i = 0; i < count; i += 1) {
      const z = start - 40 - hash01(i, 1) * 260;
      const side = hash01(i, 2) > 0.5 ? 1 : -1;
      const x = side * (6 + hash01(i, 3) * 40);
      const y = -8 + hash01(i, 4) * 20;
      dummy.position.set(x, y, z);
      dummy.rotation.set(hash01(i, 5) * 3, hash01(i, 6) * 3, hash01(i, 7) * 3);
      dummy.scale.setScalar(1 + hash01(i, 8) * 4);
      dummy.updateMatrix();
      field.setMatrixAt(i, dummy.matrix);
    }
    field.frustumCulled = false;
    this.scene.add(field);

    this.rig.hemi.color.setHex(spec.zenith);
    this.rig.hemi.groundColor.setHex(spec.ground);
    this.rig.hemi.intensity = 1.2;
    this.rig.key.intensity = 2;

    const entryHer = this.fromEntry(0, -0.5, -40);
    const end = spec.exit
      ? this.fromExit(0, -1.3, 3.4)
      : entryHer.clone().add(new Vector3(0, -10, -260));
    const points = [entryHer];
    for (let k = 1; k < 6; k += 1) {
      const p = entryHer.clone().lerp(end, k / 6);
      p.x += Math.sin(k * 1.7) * 8;
      p.y += Math.sin(k * 1.1) * 3;
      points.push(p);
    }
    points.push(end);
    const total = spec.length + spec.tail;
    this.walk = new Walk(new Course(points), total, (T) => {
      if (T < 0.6) return 53 + (32 - 53) * ease01(T, 0, 0.6);
      if (spec.exit && T > spec.length - 1)
        return 32 + (6 - 32) * ease01(T, spec.length - 1, spec.length);
      return 32;
    });
    this.track = new ShotTrack([
      {
        at: 0,
        blend: 0,
        shot: (T, out) => {
          this.place(T);
          chaseShot(out, this.her, this.dir);
          out.shake = 0.003;
          out.look = 0.03;
          out.roll = 0;
        },
      },
      {
        at: 1.6,
        blend: 0.6,
        shot: (T, out) => {
          this.place(T);
          out.position.copy(this.her).addScaledVector(this.right, 7).addScaledVector(this.up, 1.5);
          out.target.copy(this.her).addScaledVector(this.dir, 4);
          out.fov = 46;
          out.roll = 0.04;
          out.shake = 0.002;
          out.look = 0.04;
        },
      },
      {
        at: 3.4,
        blend: 0.6,
        shot: (T, out) => {
          this.place(T);
          chaseShot(out, this.her, this.dir, 7, 1.4, 6, 52);
          out.roll = -0.05;
          out.shake = 0.003;
          out.look = 0.03;
        },
      },
    ]);
  }

  private place(T: number) {
    const walk = this.walk;
    if (!walk) return;
    const u = walk.u(T);
    walk.course.at(u, this.her);
    walk.course.tangent(u, this.dir);
    this.right.crossVectors(this.dir, this.up).normalize();
  }

  course(T: number, pose: FlightPose, shot: CameraShot, time: number) {
    const walk = this.walk;
    if (!walk || !this.track) return;
    this.track.sample(T, shot);
    this.place(T);
    pose.position.copy(this.her);
    pose.heading.copy(this.dir);
    const speed = walk.profile(T);
    pose.velocity.copy(this.dir).multiplyScalar(speed);
    pose.pitch = (this.spec.pitchDeg * Math.PI) / 180;
    pose.yaw = 0;
    pose.roll = 0;
    pose.spin = this.spec.clip === "fly_play_spin" ? time * 2.4 : 0;
    pose.bank = walk.course.bank(walk.u(T), speed);
    pose.lean = 0;
    pose.sway = 1;
    pose.layers = [{ clip: this.spec.clip, weight: 1 }];
    pose.face = this.spec.face;
    pose.faceWeight = 1;
    pose.glow = 1;
    pose.glowColor = this.spec.key;
    pose.rim = 0.7;
    pose.rimColor = 0xffffff;
    pose.lift = 0.08;
    pose.look = null;
    pose.lookWeight = 0;
    pose.nervous = 0;
    pose.visible = true;
  }

  frame(_ctx: StoryContext, f: WorldFrame) {
    const u = this.uniforms;
    u.uTime.value = f.time;
    u.uFreeze.value = f.freeze;
    u.uFlow.value = f.flow;
    this.sky?.aim(f.camera);
    this.place(Math.max(0, f.T));
    this.rig.key.position.copy(this.her).add(new Vector3(8, 14, 6));
    this.rig.key.target.position.copy(this.her);
    this.rig.key.target.updateMatrixWorld();
  }
}
