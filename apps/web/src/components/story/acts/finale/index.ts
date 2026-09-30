import {
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";

import { aim, beatLabel, beatText } from "@/components/story/acts/placeholder-kit";
import {
  backOut,
  cubicOut,
  fit,
  stepSpring,
  type ActState,
  type StoryAct,
  type StoryContext,
  type StoryLabel,
  type StoryPointerEvent,
} from "@/components/story/engine/act";

/**
 * PLACEHOLDER for Act 4 (the finale package replaces it). A hard cut to the
 * page colour, a capsule that falls into frame, lands, stands and waves,
 * then lives there (hover makes it shy, a tap makes it hop). During `f-out`
 * the canvas rides on the finale block, so she leaves with the text.
 */

/** A spot of its own, far from the room, so nothing else is in frame. */
const HOME = new Vector3(40, 0, 0);

class FinalePlaceholder implements StoryAct {
  readonly id = "finale" as const;
  private readonly group = new Group();
  private readonly body = new Group();
  private readonly arm = new Group();
  private hitMesh: Mesh | null = null;
  private label: StoryLabel | null = null;
  private readonly materials: Material[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly hop: [number, number] = [0, 0];
  private hopTarget = 0;
  private shy = 0;
  private hovered = false;

  async init(ctx: StoryContext) {
    const skin = new MeshStandardMaterial({ color: 0xf7bf33, roughness: 0.45 });
    const suit = new MeshStandardMaterial({ color: 0x3a6dc5, roughness: 0.55 });
    this.materials.push(skin, suit);
    const torso = new CapsuleGeometry(0.16, 0.42, 6, 16);
    const head = new SphereGeometry(0.15, 24, 16);
    const limb = new CapsuleGeometry(0.045, 0.3, 4, 10);
    this.geometries.push(torso, head, limb);
    const torsoMesh = new Mesh(torso, suit);
    torsoMesh.position.y = 0.45;
    const headMesh = new Mesh(head, skin);
    headMesh.position.y = 0.92;
    const armMesh = new Mesh(limb, skin);
    armMesh.position.y = 0.18;
    this.arm.add(armMesh);
    this.arm.position.set(0.22, 0.62, 0);
    this.body.add(torsoMesh, headMesh, this.arm);
    this.hitMesh = torsoMesh;
    this.group.add(this.body);
    this.group.position.copy(HOME);
    this.label = await beatLabel(ctx, 0.08);
    this.group.add(this.label.object);
    this.group.visible = false;
    ctx.stage.rootScene.add(this.group);
    await ctx.stage.compile();
  }

  update(ctx: StoryContext, state: ActState) {
    if (!state.active) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    // The hard cut: the plain page, exact to the DOM.
    ctx.stage.backdrop.set({ paint: 1, reveal: 0 });
    const life = ctx.clock.time;
    const cut = state.beat("f-cut");
    const land = state.beat("f-land");
    const stand = state.beat("f-stand");
    const wave = state.beat("f-wave");
    // Falls in from the top, lands on her bottom, stands, waves.
    const drop = cubicOut(Math.min(1, cut * 0.4 + land * 1.2));
    const y = 2.2 * (1 - drop);
    const squash = fit(land, 0.35, 0.6, 0, 1) * (1 - fit(land, 0.6, 1, 0, 1));
    stepSpring(this.hop, this.hopTarget, ctx.clock.dt, 240, 14);
    if (this.hopTarget > 0 && this.hop[0] > 0.8 * this.hopTarget) this.hopTarget = 0;
    this.shy += ((this.hovered ? 1 : 0) - this.shy) * Math.min(1, ctx.clock.dt * 8);
    this.body.position.set(0, y + this.hop[0] * 0.25 + Math.sin(life * 2) * 0.01 * wave, 0);
    this.body.scale.set(
      1 + squash * 0.18,
      (1 - squash * 0.2) * (1 - this.shy * 0.06),
      1 + squash * 0.18,
    );
    this.body.rotation.set(
      0,
      Math.sin(life * 0.7) * 0.15 * wave - this.shy * 0.4,
      (1 - backOut(stand)) * 0.9,
    );
    const waving = fit(wave, 0.1, 0.4, 0, 1);
    this.arm.rotation.z = Math.PI * 0.85 * waving + Math.sin(life * 9) * 0.35 * waving;

    // A static medium shot, straight on, eye level (portrait keeps her larger).
    const { camera } = ctx.stage;
    const portrait = ctx.size.portrait;
    const eye = new Vector3(HOME.x + (portrait ? 0 : 0.55), 0.75, HOME.z + (portrait ? 3.1 : 3.4));
    const look = new Vector3(HOME.x + (portrait ? 0 : 0.55), 0.62, HOME.z);
    aim(camera, eye, look, portrait ? 42 : 30);

    const label = this.label;
    if (label) {
      label.setText(beatText(state));
      label.object.position.set(0, 1.35, 0);
    }
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent) {
    const mesh = this.hitMesh;
    if (!mesh) return false;
    const hit = event.raycast([this.body]).length > 0;
    if (event.type === "move" || event.type === "leave") {
      this.hovered = hit && event.type === "move";
      ctx.pointer.setCursor(this.hovered ? "pointer" : null);
      return hit;
    }
    if (event.type === "tap" && hit) {
      this.hopTarget = 1;
      return true;
    }
    return false;
  }

  sleep() {
    this.group.visible = false;
  }

  dispose() {
    this.group.removeFromParent();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.label?.dispose();
  }
}

export function createAct(): StoryAct {
  return new FinalePlaceholder();
}
