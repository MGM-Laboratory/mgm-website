import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Fog,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";

import { aim, beatLabel, beatText } from "@/components/story/acts/placeholder-kit";
import {
  fit,
  seededRandom,
  window4,
  type ActState,
  type BeatId,
  type StoryAct,
  type StoryContext,
  type StoryLabel,
} from "@/components/story/engine/act";
import { STORY_HINTS, STORY_WORLDS } from "@/data/story";

/**
 * PLACEHOLDER for Act 3 (the worlds package replaces it). The wormhole and
 * five worlds, each its own scene with a colour, fog and a field of
 * primitives that keeps flowing on the clock in the last input direction
 * (the world treadmill), a flash at every rift, the HUD captions, the hold
 * hint, the power loss and the fall.
 */

type WorldSpec = Readonly<{
  beat: BeatId;
  caption: string | null;
  sky: number;
  colors: readonly number[];
  geometry: () => BufferGeometry;
}>;

const WORLDS: readonly WorldSpec[] = [
  {
    beat: "w-hole",
    caption: null,
    sky: 0x05060d,
    colors: [0x3a6dc5, 0xffffff, 0x2d318a],
    geometry: () => new TorusGeometry(0.5, 0.02, 6, 32),
  },
  ...STORY_WORLDS.map((world, index) => ({
    beat: world.id as BeatId,
    caption: world.caption,
    sky: [0x9fb9e8, 0xf2d7a2, 0x0e1026, 0xc9e8c3, 0x07070c].at(index) ?? 0x000000,
    colors: [
      [0xffffff, 0x2d318a, 0x3a6dc5],
      [0xf94141, 0xf7bf33, 0x3a6dc5],
      [0xf7bf33, 0x3a6dc5, 0xf94141],
      [0x0f8657, 0x5fb36f, 0xf7bf33],
      [0xffffff, 0xf7bf33, 0x3a6dc5],
    ].at(index) ?? [0xffffff],
    geometry:
      [
        () => new BoxGeometry(0.063, 0.001, 0.088),
        () => new ConeGeometry(0.25, 0.5, 4),
        () => new BoxGeometry(0.12, 0.8, 0.12),
        () => new IcosahedronGeometry(0.2, 0),
        () => new IcosahedronGeometry(0.08, 1),
      ].at(index) ?? (() => new BoxGeometry(0.1, 0.1, 0.1)),
  })),
];

const FIELD = 90;
const LENGTH = 24;
const dummy = new Object3D();

class World {
  readonly scene = new Scene();
  readonly field: InstancedMesh;
  readonly figure: Mesh;
  private readonly seeds: Float32Array;
  travel = 0;

  constructor(
    readonly spec: WorldSpec,
    geometry: BufferGeometry,
    material: Material,
    body: BufferGeometry,
    skin: Material,
  ) {
    this.scene.background = new Color(spec.sky);
    this.scene.fog = new Fog(spec.sky, 2, LENGTH * 0.8);
    const sun = new DirectionalLight(0xffffff, 2);
    sun.position.set(1, 3, 2);
    this.scene.add(sun, new AmbientLight(0xffffff, 0.6));
    this.field = new InstancedMesh(geometry, material, FIELD);
    this.field.instanceMatrix.setUsage(DynamicDrawUsage);
    this.field.frustumCulled = false;
    const random = seededRandom(spec.beat.length * 977 + spec.sky);
    this.seeds = new Float32Array(FIELD * 4);
    const color = new Color();
    for (let i = 0; i < FIELD; i += 1) {
      this.seeds.set([random(), random(), random(), random()], i * 4);
      color.setHex(spec.colors.at(i % spec.colors.length) ?? 0xffffff);
      this.field.setColorAt(i, color);
    }
    this.scene.add(this.field);
    this.figure = new Mesh(body, skin);
    this.scene.add(this.figure);
  }

  layout(time: number, freeze: number) {
    for (let i = 0; i < FIELD; i += 1) {
      const a = this.seeds.at(i * 4) ?? 0;
      const b = this.seeds.at(i * 4 + 1) ?? 0;
      const c = this.seeds.at(i * 4 + 2) ?? 0;
      const d = this.seeds.at(i * 4 + 3) ?? 0;
      const z = -((((a * LENGTH + this.travel) % LENGTH) + LENGTH) % LENGTH);
      const radius = this.spec.beat === "w-hole" ? 0.9 : 0.6 + b * 2.4;
      const angle = c * Math.PI * 2 + (this.spec.beat === "w-hole" ? z * 0.2 : 0);
      dummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.7 - 0.2, z);
      dummy.rotation.set(time * (0.2 + d) * (1 - freeze * 0.7), d * 6, a * 6);
      dummy.scale.setScalar(this.spec.beat === "w-hole" ? 1 : 0.6 + d);
      dummy.updateMatrix();
      this.field.setMatrixAt(i, dummy.matrix);
    }
    this.field.instanceMatrix.needsUpdate = true;
  }
}

class WorldsPlaceholder implements StoryAct {
  readonly id = "worlds" as const;
  private readonly worlds: World[] = [];
  private label: StoryLabel | null = null;
  private readonly materials: Material[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly look = new Vector3();

  async init(ctx: StoryContext) {
    const body = new CapsuleGeometry(0.05, 0.16, 6, 12);
    const skin = new MeshStandardMaterial({ color: 0xf7bf33, emissive: 0x6b4a00, roughness: 0.4 });
    this.geometries.push(body);
    this.materials.push(skin);
    this.label = await beatLabel(ctx, 0.05, "#0e1116");
    for (const spec of WORLDS) {
      const geometry = spec.geometry();
      const material = new MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
      this.geometries.push(geometry);
      this.materials.push(material);
      const world = new World(spec, geometry, material, body, skin);
      this.worlds.push(world);
      await ctx.stage.compile(world.scene);
    }
  }

  update(ctx: StoryContext, state: ActState) {
    if (!state.active) return;
    // Which world: the rift beats belong to the world they open onto.
    let index = 0;
    this.worlds.forEach((world, i) => {
      if (state.beat(world.spec.beat) > 0) index = i;
    });
    const world = this.worlds.at(index);
    if (!world) return;
    const spec = world.spec;
    ctx.stage.setScene(world.scene);
    ctx.stage.backdrop.set({ reveal: 1 });
    ctx.setHeaderTone(index === 2 || index === 0 || index === 5 ? "dark" : "light");

    // The treadmill: time flows in the last input direction, scroll adds its share.
    const local = state.beat(spec.beat);
    const speed = 2.2 * ctx.clock.storyDt * state.direction;
    world.travel += speed;
    world.layout(ctx.clock.time, state.freeze);

    const { camera } = ctx.stage;
    const bob = Math.sin(ctx.clock.time * 1.3) * 0.05;
    const loss = state.beat("w-loss");
    const fall = state.beat("w-fall");
    const figure = world.figure;
    figure.visible = true;
    figure.position.set(
      Math.sin(local * 6 + ctx.clock.time) * 0.25,
      -0.1 + bob - fall * 1.6,
      -1.4 + fall * 0.4,
    );
    figure.rotation.set(
      Math.PI / 2 - 0.3 + fall * 2.5,
      0,
      Math.sin(ctx.clock.time * 2) * 0.4 + index * 0.6,
    );
    const flicker = loss > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(ctx.clock.time * 30 * loss)) : 1;
    figure.scale.setScalar(flicker);
    this.look.set(figure.position.x * 0.5, figure.position.y * 0.3 + 0.05, -3);
    aim(camera, new Vector3(0, 0.15 + bob * 0.3, 0), this.look, index === 0 ? 70 : 55);
    camera.rotation.z += Math.sin(local * Math.PI * 2) * 0.12 * (index === 3 ? 1 : 0.3);
    camera.updateMatrixWorld();

    // A flash at every rift, bloom and a little grain in the worlds.
    let flash = 0;
    for (const rift of ["w-1r", "w-2r", "w-3r", "w-4r"] as const) {
      const p = state.beat(rift);
      flash = Math.max(flash, window4(p, 0.25, 0.48, 0.52, 0.8));
    }
    const enter = window4(state.beat("w-hole"), 0, 0.02, 0.12, 0.35) * 0.8;
    ctx.stage.post.set({
      bloom: 0.6,
      bloomThreshold: 0.72,
      vignette: 0.45,
      grain: 0.35,
      flash: Math.max(flash, enter),
      fade: fit(fall, 0.85, 1, 0, 1),
      fadeColor: 0x000000,
    });

    // HUD captions latch at each world's start; the hold hint lives in world 01.
    if (spec.caption && local < 0.35) ctx.overlay.setHud(spec.caption);
    if (spec.beat === "w-1" && local > 0.05 && local < 0.5)
      ctx.overlay.setHint(STORY_HINTS.holdToSlow);

    const label = this.label;
    if (label) {
      label.setText(beatText(state));
      if (label.object.parent !== world.scene) world.scene.add(label.object);
      label.object.position.set(0, 0.62, -2.2);
    }
  }

  sleep() {
    for (const world of this.worlds) world.figure.visible = false;
  }

  dispose() {
    for (const world of this.worlds) world.field.dispose();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.label?.dispose();
  }
}

export function createAct(): StoryAct {
  return new WorldsPlaceholder();
}
