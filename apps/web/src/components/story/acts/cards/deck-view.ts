import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Matrix4,
  Quaternion,
  Vector2,
  Vector3,
  type Group,
  type MeshStandardMaterial,
  type PerspectiveCamera,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from "three";

import { saturate, type StoryContext } from "@/components/story/engine/act";
import {
  SWARM_CAPACITY,
  type CardKit,
  type CardSwarm,
  type HeroCard,
} from "@/components/story/props/card-mesh";
import { patchShader } from "@/components/story/props/deck-shared";
import {
  createPose,
  type CardPose,
  type DeckBeats,
  type DeckMotion,
} from "@/components/story/acts/cards/deck-motion";
import type { DeckLayout } from "@/components/story/acts/cards/deck-layout";

/**
 * Draws the deck: one instanced swarm for every card but the four (one draw
 * call), and the four hero cards as their own meshes (their fronts are live
 * textures). Both get a "mist" that mixes a card toward the page colour,
 * after the colour space conversion, so a card at mist 1 is exactly the
 * page (the wheel behind the four recedes into the page this way, in both
 * schemes, without fog).
 *
 * The cursor parts the stream: cards near the pointer on screen are pushed
 * aside on springs (a life layer, added to the pure pose).
 */

type MistUniforms = {
  uMistColor: { value: Vector3 };
  uMist: { value: number };
};

const MIST_VERTEX_SWARM = /* glsl */ `
attribute float aMist;
varying float vMist;
`;
const MIST_VERTEX_HERO = /* glsl */ `
uniform float uMist;
varying float vMist;
`;
const MIST_FRAGMENT_DECL = /* glsl */ `
uniform vec3 uMistColor;
varying float vMist;
`;
// After the conversion to the output colour space: the page colour's own sRGB bytes.
const MIST_FRAGMENT = /* glsl */ `
gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, clamp(vMist, 0.0, 1.0));
`;

/**
 * Chains the mist onto a card material's own shader patch (and gives the
 * program its own key). `compiled` receives the program's uniforms, so the
 * act can reach the card's own (the paper's lift on the hero fronts).
 */
function addMist(
  material: MeshStandardMaterial,
  swarm: boolean,
  uniforms: MistUniforms,
  compiled?: (shader: WebGLProgramParametersWithUniforms) => void,
) {
  const original = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (
    shader: WebGLProgramParametersWithUniforms,
    renderer: WebGLRenderer,
  ) => {
    original(shader, renderer);
    compiled?.(shader);
    shader.uniforms.uMistColor = uniforms.uMistColor;
    shader.uniforms.uMist = uniforms.uMist;
    shader.vertexShader = patchShader(shader.vertexShader, [
      ["after", "common", swarm ? MIST_VERTEX_SWARM : MIST_VERTEX_HERO],
      ["after", "begin_vertex", swarm ? "vMist = aMist;" : "vMist = uMist;"],
    ]);
    shader.fragmentShader = patchShader(shader.fragmentShader, [
      ["after", "common", MIST_FRAGMENT_DECL],
      ["after", "colorspace_fragment", MIST_FRAGMENT],
    ]);
  };
  material.customProgramCacheKey = () => `${key}+cards-mist-v1`;
  material.needsUpdate = true;
}

const matrix = new Matrix4();
const scaleV = new Vector3();
const flipQ = new Quaternion();
const yAxis = new Vector3(0, 1, 0);
const world = new Vector3();
const ndc = new Vector3();
const pointerNdc = new Vector2();

export type HeroSlot = {
  readonly card: HeroCard;
  readonly mist: MistUniforms;
};

/**
 * Extra light on the printed fronts (the card material's `uPaperLift`), so
 * the white card reads as white paper in the studio light, above the page,
 * in both schemes. Its default is tuned for the generic face.
 */
const HERO_PAPER_LIFT = 0.55;
/** Over the light page the paper must sit a touch above the page's own white, never on it. */
const HERO_PAPER_LIFT_LIGHT = 0.85;

export class DeckView {
  readonly swarm: CardSwarm;
  readonly heroes: HeroSlot[] = [];
  private readonly swarmMist: MistUniforms;
  private readonly mistAttr: InstancedBufferAttribute;
  private readonly pose = createPose();
  /** Per card: the cursor's push (x, y, stage metres) and its velocity. */
  private readonly push = new Float32Array(SWARM_CAPACITY * 4);
  private readonly pageColour = new Vector3(0.97, 0.97, 0.96);
  /** The four's poses this frame (the act adds the turn and the interaction on top). */
  readonly heroPoses: CardPose[] = [createPose(), createPose(), createPose(), createPose()];
  /** Whether each card (deck order) is out of the box this frame. */
  readonly visible = new Uint8Array(SWARM_CAPACITY);
  private paperLift = HERO_PAPER_LIFT;
  /** The four fronts' paper lift uniforms (reached once their programs compile). */
  private readonly paperLifts: { value: number }[] = [];

  constructor(
    kit: CardKit,
    private readonly stage: Group,
  ) {
    this.swarm = kit.createSwarm(SWARM_CAPACITY);
    this.swarmMist = { uMistColor: { value: this.pageColour }, uMist: { value: 0 } };
    this.mistAttr = new InstancedBufferAttribute(new Float32Array(SWARM_CAPACITY), 1);
    this.mistAttr.setUsage(DynamicDrawUsage);
    this.swarm.mesh.geometry.setAttribute("aMist", this.mistAttr);
    addMist(this.swarm.mesh.material as MeshStandardMaterial, true, this.swarmMist);
    this.swarm.mesh.name = "cards-swarm";
    stage.add(this.swarm.mesh);
    for (let k = 0; k < 4; k += 1) {
      const card = kit.createHeroCard(null);
      const mist: MistUniforms = { uMistColor: { value: this.pageColour }, uMist: { value: 0 } };
      addMist(card.material, false, mist, (shader) => {
        const lift = shader.uniforms.uPaperLift as { value: number } | undefined;
        if (!lift) return;
        lift.value = this.paperLift;
        if (!this.paperLifts.includes(lift)) this.paperLifts.push(lift);
      });
      card.mesh.name = `cards-hero-${k}`;
      stage.add(card.mesh);
      this.heroes.push({ card, mist });
    }
  }

  /**
   * The page colour the mist fades toward (sRGB bytes, as the DOM shows it),
   * and the paper's lift for the page's scheme.
   */
  setPage(hex: number, scheme: "light" | "dark") {
    this.pageColour.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
    this.paperLift = scheme === "light" ? HERO_PAPER_LIFT_LIGHT : HERO_PAPER_LIFT;
    for (const lift of this.paperLifts) lift.value = this.paperLift;
  }

  /** Shows everything for a compile pass. */
  warm(on: boolean) {
    this.swarm.mesh.visible = on;
    for (const hero of this.heroes) hero.card.mesh.visible = on;
    if (on) this.swarm.count = 1;
  }

  /**
   * Writes every card's pose for this frame. The four's poses land in
   * `heroPoses` (the act finishes them); the swarm is written here.
   */
  update(
    ctx: StoryContext,
    motion: DeckMotion,
    beats: DeckBeats,
    layout: DeckLayout,
    parting: number,
  ) {
    const time = ctx.clock.time;
    const dt = ctx.clock.dt;
    const swarm = this.swarm;
    const camera = ctx.stage.camera;
    this.stage.updateMatrixWorld();
    const pointerOn = ctx.pointer.inside && parting > 0.001;
    if (pointerOn) pointerNdc.set(ctx.pointer.ndc.x, ctx.pointer.ndc.y);
    let j = 0;
    let shown = 0;
    for (let i = 0; i < motion.count; i += 1) {
      const hero = motion.heroOf(i);
      const pose = hero >= 0 ? (this.heroPoses.at(hero) ?? this.pose) : this.pose;
      const on = motion.pose(i, beats, layout, time, pose);
      this.visible.set([on ? 1 : 0], i);
      if (on) {
        this.part(i, pose, camera, pointerOn, parting, dt);
        shown += 1;
      }
      if (hero >= 0) continue;
      if (on) {
        scaleV.setScalar(pose.scale);
        matrix.compose(pose.position, pose.quaternion, scaleV);
      } else {
        matrix.makeScale(0, 0, 0);
      }
      swarm.setMatrixAt(j, matrix);
      swarm.setFlipAt(j, pose.flip);
      swarm.setBendAt(j, pose.curl, pose.flex);
      this.mistAttr.setX(j, pose.mist);
      j += 1;
    }
    swarm.count = j;
    swarm.mesh.visible = shown > 0;
    swarm.commit();
    this.mistAttr.needsUpdate = true;
  }

  /** Writes a hero's final pose (after the act's turn and interaction layers). */
  placeHero(k: number, pose: CardPose) {
    const hero = this.heroes.at(k);
    if (!hero) return;
    const mesh = hero.card.mesh;
    mesh.visible = pose.visible;
    if (!pose.visible) return;
    mesh.position.copy(pose.position);
    flipQ.setFromAxisAngle(yAxis, pose.flip);
    mesh.quaternion.copy(pose.quaternion).multiply(flipQ);
    mesh.scale.setScalar(pose.scale);
    hero.card.setBend(pose.curl, pose.flex);
    hero.mist.uMist.value = pose.mist;
  }

  /** The cursor parts the stream: a spring push away from the pointer on screen. */
  private part(
    i: number,
    pose: CardPose,
    camera: PerspectiveCamera,
    pointerOn: boolean,
    parting: number,
    dt: number,
  ) {
    const base = i * 4;
    let px = this.push.at(base) ?? 0;
    let py = this.push.at(base + 1) ?? 0;
    let vx = this.push.at(base + 2) ?? 0;
    let vy = this.push.at(base + 3) ?? 0;
    let tx = 0;
    let ty = 0;
    if (pointerOn && pose.free > 0) {
      world.copy(pose.position);
      this.stage.localToWorld(world);
      ndc.copy(world).project(camera);
      const dx = (ndc.x - pointerNdc.x) * camera.aspect;
      const dy = ndc.y - pointerNdc.y;
      const d = Math.hypot(dx, dy);
      const reach = 0.26;
      if (d < reach && d > 1e-4) {
        const k = (1 - d / reach) ** 2 * parting * pose.free;
        // Metres per NDC unit at the card's depth, so the push is the same size on screen at any depth.
        const depth = Math.max(0.2, camera.position.distanceTo(world));
        const unit = depth * Math.tan((camera.fov * Math.PI) / 360);
        tx = (dx / d / camera.aspect) * k * unit * 0.32;
        ty = (dy / d) * k * unit * 0.32;
      }
    }
    // A soft spring toward the push target (frame-rate independent sub-steps).
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      vx += ((tx - px) * 90 - vx * 13) * h;
      vy += ((ty - py) * 90 - vy * 13) * h;
      px += vx * h;
      py += vy * h;
    }
    this.push.set([px, py, vx, vy], base);
    // Inside the box nothing may move it (the push springs back to rest out of sight).
    pose.position.x += px * pose.free;
    pose.position.y += py * pose.free;
    // The pushed card tips away a little, like a card brushed by a hand.
    const tip = saturate(Math.hypot(px, py) * 30);
    pose.curl += tip * 0.08;
  }

  /** Forgets the cursor's pushes (a jump). */
  resetLife() {
    this.push.fill(0);
  }

  /** The swarm's glint band (fan snap, the stream). */
  glint(position: number, strength: number) {
    this.swarm.setGlint(position, strength);
  }

  dispose() {
    this.swarm.mesh.removeFromParent();
    this.swarm.dispose();
    for (const hero of this.heroes) {
      hero.card.mesh.removeFromParent();
      hero.card.dispose();
    }
    this.heroes.length = 0;
  }
}
