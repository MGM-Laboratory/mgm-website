import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Group,
} from "three";

import { saturate, smoothstep } from "@/components/story/engine/act";
import { CARD_H, CARD_W } from "@/components/story/props/card-mesh";
import type { CardPose, DeckBeats } from "@/components/story/acts/cards/deck-motion";
import type { HeroLife } from "@/components/story/acts/cards/hero-cards";

/**
 * Soft shadows under the four drawn cards, so a white card never melts into
 * the light page: one instanced quad per card (one draw call for the four)
 * on a plane a little behind it, drawn as a rounded box with an analytic
 * blur (no texture), a soft drop shadow plus a tighter contact shadow along
 * its lower edge.
 *
 * The shadow's plane travels with the card; as the card lifts off it toward
 * the lens (a hover, an idle twirl) the shadow drops further, grows softer
 * and fainter. It narrows with the card as the card turns edge on, follows
 * its spin in the plane, and fades with the card when another card has the
 * focus.
 */

const VERTEX = /* glsl */ `
attribute vec4 aShadow;
attribute vec4 aContact;
varying vec2 vP;
varying vec4 vShadow;
varying vec4 vContact;
void main() {
  // The quad covers the box and its blur on every side.
  vec2 ext = aShadow.xy + 2.6 * aShadow.z;
  vec2 p = position.xy * 2.0 * ext;
  vP = p;
  vShadow = aShadow;
  vContact = aContact;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec2 vP;
varying vec4 vShadow;
varying vec4 vContact;
float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 half_ = vShadow.xy;
  float r = min(half_.x, half_.y) * 0.18;
  // The drop shadow: a wide, soft falloff.
  float d = roundBox(vP, half_, r);
  float blur = vShadow.z;
  float drop = 1.0 - smoothstep(-blur, blur * 1.8, d);
  drop *= drop;
  // The contact shadow: tighter, nearer the card (raised by its own offset).
  float c = roundBox(vP - vec2(0.0, vContact.x), half_ * vec2(0.97, 0.985), r);
  float contact = 1.0 - smoothstep(-vContact.y, vContact.y * 1.4, c);
  float a = vShadow.w * drop + vContact.z * contact;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

/** Ink on the light page, black on the dark one; strengths for each. */
const SHADOW_LIGHT = { color: 0x0e1116, drop: 0.15, contact: 0.1 };
const SHADOW_DARK = { color: 0x000000, drop: 0.42, contact: 0.3 };
/** How far behind the card's rest the shadow's plane lies, metres. */
const PLANE_BEHIND = 0.022;

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const unit = new Vector3(1, 1, 1);
const zAxis = new Vector3(0, 0, 1);
const longAxis = new Vector3();

export class CardShadows {
  readonly mesh: InstancedMesh;
  private readonly shadow: InstancedBufferAttribute;
  private readonly contact: InstancedBufferAttribute;
  private readonly material: ShaderMaterial;
  private readonly color = new Color();

  constructor(stage: Group) {
    const geometry = new PlaneGeometry(1, 1);
    this.shadow = new InstancedBufferAttribute(new Float32Array(16), 4);
    this.shadow.setUsage(DynamicDrawUsage);
    this.contact = new InstancedBufferAttribute(new Float32Array(16), 4);
    this.contact.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aShadow", this.shadow);
    geometry.setAttribute("aContact", this.contact);
    this.material = new ShaderMaterial({
      uniforms: { uColor: { value: this.color } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(geometry, this.material, 4);
    this.mesh.name = "cards-hero-shadows";
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    // Before the cards and the wheel in the transparent pass, after everything opaque.
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
    stage.add(this.mesh);
  }

  /** Shows the shadows for a compile pass. */
  warm(on: boolean) {
    this.mesh.visible = on;
  }

  /**
   * After the four are placed: each card's shadow from its final pose and
   * life (stage frame), for the page's scheme.
   */
  update(
    poses: readonly CardPose[],
    life: readonly HeroLife[],
    beats: DeckBeats,
    scheme: "light" | "dark",
  ) {
    const look = scheme === "light" ? SHADOW_LIGHT : SHADOW_DARK;
    this.color.setHex(look.color);
    // On the stage from the draw's landing to the gather's snap.
    const presence =
      smoothstep(0.55, 0.95, beats.draw) *
      (1 - smoothstep(0.06, 0.2, beats.gather)) *
      (beats.drop > 0 ? 0 : 1);
    let any = false;
    for (let k = 0; k < 4; k += 1) {
      const pose = poses.at(k);
      const cardLife = life.at(k);
      if (!pose || !cardLife) continue;
      const strength = pose.visible ? presence * (1 - 0.75 * cardLife.dim) : 0;
      if (strength < 0.002) {
        this.write(k, 0, 0, 0, 0, 0);
        continue;
      }
      any = true;
      // The plane: just behind the card where it would rest; a hover's lift raises the card off it.
      const focus = cardLife.focus;
      const lift = Math.max(0, cardLife.lift.z);
      const planeZ = pose.position.z - lift - PLANE_BEHIND;
      const away = saturate(lift / 0.05);
      // Its spin in the plane (from the card's long axis; the turn about that axis leaves it).
      longAxis.set(0, 1, 0).applyQuaternion(pose.quaternion);
      const spin = Math.atan2(-longAxis.x, longAxis.y);
      // Edge on as it turns, the shadow narrows with it.
      const turn = Math.max(0.12, Math.abs(Math.cos(pose.flip)));
      const scale = pose.scale;
      const halfW = (CARD_W / 2) * scale * turn;
      const halfH = (CARD_H / 2) * scale;
      const drop = 0.005 + 0.2 * lift;
      position.set(pose.position.x, pose.position.y - drop, planeZ);
      quaternion.setFromAxisAngle(zAxis, spin);
      matrix.compose(position, quaternion, unit);
      this.mesh.setMatrixAt(k, matrix);
      const blur = 0.0045 + 0.22 * lift;
      const alpha = look.drop * strength * (1 - 0.45 * away);
      // The contact shadow sits closer under the card and goes as it lifts.
      const contactAlpha = look.contact * strength * (1 - away) * (1 - 0.6 * focus);
      this.write(k, halfW, halfH, blur, alpha, contactAlpha, drop * 0.7, 0.0018 + 0.05 * lift);
    }
    this.mesh.visible = any;
    if (!any) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadow.needsUpdate = true;
    this.contact.needsUpdate = true;
  }

  private write(
    k: number,
    halfW: number,
    halfH: number,
    blur: number,
    alpha: number,
    contact: number,
    contactLift = 0,
    contactBlur = 0.002,
  ) {
    this.shadow.setXYZW(k, halfW, halfH, blur, alpha);
    this.contact.setXYZW(k, contactLift, contactBlur, contact, 0);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
