import {
  BoxGeometry,
  ConeGeometry,
  IcosahedronGeometry,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  type BufferGeometry,
  type WebGLRenderTarget,
} from "three";

import {
  type ActState,
  type StoryAct,
  type StoryContext,
  type StoryPointerEvent,
} from "@/components/story/engine/act";
import { beatOf } from "@/components/story/engine/timeline";
import { createSparkleBurst, type SparkleBurst } from "@/components/story/props/fx/sparkle-burst";
import type { Godette } from "@/components/story/props/godette";
import { ensureCardKit, ensureGodette } from "@/components/story/props/shared";

import { CameraRig } from "./camera";
import {
  LifeClock,
  RendererState,
  backgroundScale,
  copyPose,
  createDisplayTarget,
  createLightRig,
  createPose,
  createScreenLayer,
  createShot,
  ease01,
  fullscreenGeometry,
  lin01,
  mixPose,
  mixShot,
  scaledSize,
  type FlightPose,
} from "./common";
import { FlightDriver } from "./flight";
import { WorldsHud } from "./hud";
import {
  RIFTS,
  RIFT_CUT,
  RIFT_LIGHT,
  RiftVisual,
  riftChoreo,
  riftState,
  type RiftState,
} from "./rift";
import { EdgeWorld } from "./world-edge";
import { SketchWorld } from "./world-sketch";
import { PaperTide } from "./world-paper";
import { World, transformPose } from "./world";
import {
  HOLE_CUT,
  WormholePass,
  createTvFeed,
  holeChoreo,
  holeEntryFlash,
  holeStreak,
} from "./wormhole";

/**
 * Act 3, "Five worlds" (`w-hole` to `w-fall`). The TV's portal grows into
 * the wormhole; she dives through it into Paper Tide, then punches four
 * star rifts open, each steadier than the last, through Bauhaus Dunes,
 * Signal City and Leafhold to The Edge, where her glow gives out and she
 * falls.
 *
 * Structure: one module per world (`world-*.ts`, each its own scene, course
 * and camera grammar), the wormhole (`wormhole.ts`, which also draws the TV
 * feed for the table act), the rifts (`rift.ts`), her flight (`flight.ts`),
 * the camera (`camera.ts`) and the overlay (`hud.ts`). This file routes the
 * scroll position to them: which scene is on screen, which course time it
 * shows, where a crossing cuts, and the post effects that hide each cut.
 */

const HOLE_BEAT = beatOf("w-hole");
const WORLD_BEATS = [beatOf("w-1"), beatOf("w-2"), beatOf("w-3"), beatOf("w-4"), beatOf("w-5")];
const RIFT_BEATS = [beatOf("w-1r"), beatOf("w-2r"), beatOf("w-3r"), beatOf("w-4r")];
const LOSS_BEAT = beatOf("w-loss");
const FALL_BEAT = beatOf("w-fall");
/** Course time before a world's end over which she slows and rights herself for the punch. */
const EXIT_BLEND = 0.45;
/** Course time after an arrival over which her flying style turns into the world's own. */
const ARRIVE_BLEND = 0.4;

type Route =
  | { kind: "hole"; p: number }
  | {
      kind: "world";
      index: number;
      /** Course time in the world (vh from its beat's start). */
      T: number;
      /** The crossing she arrived through (`hole` or a rift index) and its progress, while arriving. */
      arrive: { from: "hole" | number; p: number } | null;
      /** The rift ahead and its beat progress, once the world's beat is over. */
      leave: { rift: number; p: number } | null;
    };

function worldStart(index: number) {
  if (index === 0) return HOLE_BEAT.start + HOLE_CUT * HOLE_BEAT.vh;
  const rift = RIFT_BEATS.at(index - 1);
  return rift ? rift.start + RIFT_CUT * rift.vh : Number.POSITIVE_INFINITY;
}

function route(t: number): Route {
  const holeP = lin01(t, HOLE_BEAT.start, HOLE_BEAT.end);
  if (t < worldStart(0)) return { kind: "hole", p: holeP };
  let index = 0;
  for (let k = 1; k < WORLD_BEATS.length; k += 1) if (t >= worldStart(k)) index = k;
  const beat = WORLD_BEATS.at(index) ?? HOLE_BEAT;
  const T = t - beat.start;
  if (T < 0) {
    if (index === 0)
      return { kind: "world", index, T, arrive: { from: "hole", p: holeP }, leave: null };
    const rift = RIFT_BEATS.at(index - 1) ?? HOLE_BEAT;
    return {
      kind: "world",
      index,
      T,
      arrive: { from: index - 1, p: lin01(t, rift.start, rift.end) },
      leave: null,
    };
  }
  const exit = RIFT_BEATS.at(index);
  if (exit && t >= exit.start) {
    return {
      kind: "world",
      index,
      T,
      arrive: null,
      leave: { rift: index, p: lin01(t, exit.start, exit.end) },
    };
  }
  return { kind: "world", index, T, arrive: null, leave: null };
}

class WorldsAct implements StoryAct {
  readonly id = "worlds" as const;
  private readonly life = new LifeClock();
  private worlds: World[] = [];
  private hole: WormholePass | null = null;
  private readonly holeScene = new Scene();
  private readonly holeRig = createLightRig();
  private holeTarget: WebGLRenderTarget | null = null;
  private holeLayer: ReturnType<typeof createScreenLayer> | null = null;
  private portalTarget: WebGLRenderTarget | null = null;
  private readonly portalCamera = new PerspectiveCamera();
  private rift: RiftVisual | null = null;
  private flight: FlightDriver | null = null;
  private godette: Godette | null = null;
  private burst: SparkleBurst | null = null;
  private readonly rig = new CameraRig();
  private readonly hud = new WorldsHud();
  private readonly pose = createPose();
  private readonly poseB = createPose();
  private readonly shot = createShot();
  private readonly shotB = createShot();
  private readonly riftNow: RiftState = {
    seed: 0,
    crack: 0,
    radius: 0,
    burst: -1,
    portal: false,
    light: 0,
    surge: 0,
  };
  private readonly state = new RendererState();
  private readonly geometries: BufferGeometry[] = [];
  private readonly holeToPaper = new Matrix4();
  private readonly paperEye = new Vector3();
  private readonly portalMatrix = new Matrix4();
  private readonly inverse = new Matrix4();
  private readonly tmpQ = new Quaternion();
  private readonly tmpV = new Vector3();
  private readonly footL = new Vector3();
  private readonly footR = new Vector3();
  private trailScene: Scene | null = null;
  private lastScene: Scene | null = null;
  private hoverAt = -10;
  private feed: ReturnType<typeof createTvFeed> | null = null;
  private quality: StoryContext["tier"] = "high";

  async init(ctx: StoryContext) {
    this.quality = ctx.tier;
    const fullscreen = fullscreenGeometry();
    this.geometries.push(fullscreen);
    const godette = await ensureGodette(ctx);
    this.godette = godette;
    this.flight = new FlightDriver(godette);
    this.burst = createSparkleBurst({
      count: 40,
      slots: 4,
      size: 0.09,
      speed: 3.2,
      gravity: 0.6,
      life: 1.2,
    });
    this.burst.points.frustumCulled = false;

    // The wormhole and the TV feed.
    const hole = await WormholePass.create(fullscreen, yieldToMain);
    this.hole = hole;
    const kit = await ensureCardKit(ctx);
    hole.material.uniforms.tPaperBack.value = kit.back;
    const size = scaledSize(ctx, backgroundScale(ctx.tier));
    this.holeTarget = createDisplayTarget(size.width, size.height, false);
    this.holeLayer = createScreenLayer(fullscreen, this.holeTarget.texture);
    this.holeScene.add(this.holeLayer.mesh, this.holeRig.group);
    this.holeRig.hemi.color.setHex(0x3a4c9a);
    this.holeRig.hemi.groundColor.setHex(0x070a1f);
    this.holeRig.hemi.intensity = 0.55;
    this.holeRig.key.color.setHex(0xffe6a6);
    this.holeRig.key.intensity = 1.2;
    this.holeRig.spill.color.setHex(0xffe6a6);

    // The worlds.
    const paper = new PaperTide();
    const sketches = [
      new SketchWorld({
        id: "dunes",
        key: 0xf94141,
        length: WORLD_BEATS.at(1)?.vh ?? 5.5,
        tail: 0,
        zenith: 0x3a6dc5,
        horizon: 0xfef6e0,
        ground: 0xf7bf33,
        colours: [0xf94141, 0xf7bf33, 0x3a6dc5, 0x0f8657],
        geometry: () => new ConeGeometry(1.4, 3.2, 4),
        clip: "fly_slalom",
        pitchDeg: 80,
        face: "determined",
        entry: new Vector3(0, 8, 0),
        exit: new Vector3(0, 9, -240),
      }),
      new SketchWorld({
        id: "city",
        key: 0x3a6dc5,
        length: WORLD_BEATS.at(2)?.vh ?? 5.5,
        tail: 0,
        zenith: 0x05060c,
        horizon: 0x1a1f3a,
        ground: 0x0e1116,
        colours: [0xf7bf33, 0x3a6dc5, 0xf94141, 0xffffff],
        geometry: () => new BoxGeometry(2, 9, 2),
        clip: "fly_action",
        pitchDeg: 85,
        face: "determined",
        entry: new Vector3(0, 20, 0),
        exit: new Vector3(0, 26, -240),
      }),
      new SketchWorld({
        id: "leaf",
        key: 0x0f8657,
        length: WORLD_BEATS.at(3)?.vh ?? 5.5,
        tail: 0,
        zenith: 0xbfe3b4,
        horizon: 0xf3f6d8,
        ground: 0x0f8657,
        colours: [0x0f8657, 0x5fb36f, 0xf7bf33, 0xf94141],
        geometry: () => new IcosahedronGeometry(1.6, 0),
        clip: "fly_play_spin",
        pitchDeg: 0,
        face: "laugh",
        entry: new Vector3(0, 6, 0),
        exit: new Vector3(0, 8, -220),
      }),
    ];
    const edge = new EdgeWorld(WORLD_BEATS.at(4)?.vh ?? 4, LOSS_BEAT.vh, FALL_BEAT.vh);
    this.worlds = [paper, ...sketches, edge];
    for (const world of this.worlds) {
      await yieldToMain();
      await world.build(ctx);
    }
    this.holeToPaper.copy(paper.entry);

    // The rift (one star, reused by every crossing) and its portal view.
    this.rift = new RiftVisual(fullscreen);
    this.rift.setTier(ctx.tier);
    const portal = scaledSize(ctx, portalScale(ctx.tier));
    this.portalTarget = createDisplayTarget(portal.width, portal.height, true);

    // The feed the table act puts on the TV.
    const feed = createTvFeed(
      hole,
      (c) => {
        this.life.advance(c);
        return { time: this.life.time, flow: this.life.flow, freeze: c.director.freeze };
      },
      () => {
        this.paperEye.set(0, 0, 0).applyMatrix4(this.holeToPaper);
        return { toPaper: this.holeToPaper, eye: this.paperEye };
      },
      () => backgroundScale(this.quality),
    );
    this.feed = feed;
    await ctx.props.ensure("tvFeed", () => feed);

    this.hud.init(ctx, () => {
      this.cheer();
    });

    await this.compile(ctx);
  }

  /** Every program on the GPU, and one draw into every target, before anyone scrolls. */
  private async compile(ctx: StoryContext) {
    const { stage } = ctx;
    const renderer = stage.renderer;
    const godette = this.godette;
    const rift = this.rift;
    const flight = this.flight;
    const burst = this.burst;
    if (!godette || !rift || !flight || !burst) return;
    const scenes = [this.holeScene, ...this.worlds.map((world) => world.scene)];
    const camera = stage.camera;
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    for (const scene of scenes) {
      await yieldToMain();
      const world = this.worlds.find((w) => w.scene === scene);
      world?.warm(true);
      rift.warm(true);
      scene.add(rift.group, rift.warp, flight.trail.mesh, burst.points);
      flight.trail.warm(true);
      await stage.compile(scene);
      await godette.compile(renderer, camera, scene);
      flight.trail.warm(false);
      rift.group.removeFromParent();
      rift.warp.removeFromParent();
      flight.trail.mesh.removeFromParent();
      burst.points.removeFromParent();
      world?.warm(false);
      world?.warmTargets?.(renderer);
    }
    // One draw into each of the act's own targets (Metal builds a pipeline per target on the first draw).
    const hole = this.hole;
    const holeTarget = this.holeTarget;
    const portal = this.portalTarget;
    if (hole && holeTarget) {
      hole.aim(camera, this.holeToPaper, this.paperEye, holeTarget.height);
      hole.render(renderer, holeTarget);
      hole.render(renderer, hole.feedTarget);
    }
    if (portal) {
      this.state.save(renderer);
      for (const world of this.worlds) {
        await yieldToMain();
        renderer.setRenderTarget(portal);
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, 2, 2);
        renderer.render(world.scene, camera);
        renderer.setScissorTest(false);
      }
      this.state.restore(renderer);
    }
  }

  private cheer() {
    const godette = this.godette;
    if (!godette) return;
    godette.react("click");
    const scene = this.lastScene;
    const burst = this.burst;
    if (scene && burst) {
      if (burst.points.parent !== scene) scene.add(burst.points);
      godette.socket("chest", this.tmpV);
      burst.fire(this.tmpV, this.life.time, 1);
    }
  }

  update(ctx: StoryContext, state: ActState) {
    if (!state.active) {
      this.life.advance(ctx, 1);
      this.hud.place(ctx, ctx.stage.camera, null, 0);
      return;
    }
    const flight = this.flight;
    const hole = this.hole;
    const rift = this.rift;
    if (!flight || !hole || !rift) return;
    if (state.arrived) this.rig.reset();
    const r = route(state.t);
    // Life runs at the world's rate (a speed ramp, the hang time), in the last input direction.
    let rate = 1;
    if (r.kind === "world" && !r.arrive && !r.leave) {
      rate = this.worlds.at(r.index)?.timeRate?.(r.T) ?? 1;
    }
    this.life.advance(ctx, rate);
    const life = this.life;
    const camera = ctx.stage.camera;
    const pose = this.pose;
    const shot = this.shot;
    ctx.stage.backdrop.set({ reveal: 1 });

    if (r.kind === "hole") {
      holeChoreo(r.p, ctx.size.aspect, pose, shot, life.time);
      this.rig.apply(ctx, shot, life.time, life.dt, 0.5, 4000);
      this.drawHole(ctx, r.p);
      ctx.stage.setScene(this.holeScene);
      this.fly(ctx, this.holeScene, pose);
      this.holeRig.key.position.set(pose.position.x, pose.position.y - 30, pose.position.z - 80);
      this.holeRig.key.target.position.copy(pose.position);
      this.holeRig.key.target.updateMatrixWorld();
      ctx.setHeaderTone("dark");
      ctx.stage.post.set({
        bloom: 0.18 + 0.32 * ease01(r.p, 0.02, 0.14),
        bloomThreshold: 0.64,
        bloomRadius: 0.42,
        vignette: 0.45,
        grain: 0.22,
        flash: Math.max(holeEntryFlash(r.p), throatFlash(r.p)),
        flashColor: 0xfff4dc,
      });
      this.hud.update(ctx, null, 0);
      this.placeHotspot(ctx, camera);
      return;
    }

    const world = this.worlds.at(r.index);
    if (!world) return;
    let surge = 0;
    let warp = 0;
    if (r.arrive) {
      // Arriving: the crossing's choreography, moved into this world by its entry.
      if (r.arrive.from === "hole") {
        holeChoreo(r.arrive.p, ctx.size.aspect, pose, shot, life.time);
        transformPose(pose, shot, world.entry);
        surge = throatFlash(r.arrive.p);
        warp = 1 - lin01(r.arrive.p, HOLE_CUT, 1);
      } else {
        const riftSpec = RIFTS.at(r.arrive.from);
        const prev = this.worlds.at(r.arrive.from);
        if (riftSpec && prev) {
          riftChoreo(r.arrive.p, riftSpec, pose, shot, life.time, prev.key, world.key);
          transformPose(pose, shot, world.entry);
          riftState(1, r.arrive.p, riftSpec, this.riftNow);
          surge = this.riftNow.surge;
          warp = 1 - lin01(r.arrive.p, RIFT_CUT, 1);
        }
      }
    } else if (r.leave) {
      const spec = RIFTS.at(r.leave.rift);
      const next = this.worlds.at(r.index + 1);
      if (spec && next && world.exit) {
        riftChoreo(r.leave.p, spec, pose, shot, life.time, world.key, next.key);
        transformPose(pose, shot, world.exit);
        riftState(1, r.leave.p, spec, this.riftNow);
        surge = this.riftNow.surge;
      }
    } else {
      world.course(r.T, pose, shot, life.time);
      if (r.T < ARRIVE_BLEND) this.blendArrival(ctx, world, r.index, r.T);
      if (world.exit && r.T > world.length - EXIT_BLEND) this.blendExit(world, r.index, r.T);
    }

    this.rig.apply(ctx, shot, life.time, life.dt);
    const T = r.T;
    world.frame(ctx, {
      T,
      time: life.time,
      flow: life.flow,
      freeze: state.freeze,
      view: "main",
      camera,
    });
    ctx.stage.setScene(world.scene);
    this.lastScene = world.scene;

    // The rift ahead: a seed of light first, then the star; the next world through it.
    const next = this.worlds.at(r.index + 1);
    const spec = RIFTS.at(r.index);
    rift.group.removeFromParent();
    // The rift's light spill belongs to the act in worlds that open one; the last world keeps its own.
    if (world.exit) world.rig.spill.intensity = 0;
    let herScene = world.scene;
    if (world.exit && next && spec && (r.leave || T > world.length * 0.82)) {
      const tail = r.leave ? 1 : lin01(T, world.length * 0.82, world.length);
      riftState(tail, r.leave ? r.leave.p : 0, spec, this.riftNow);
      let portal = null;
      if (r.leave && this.riftNow.portal) {
        portal = this.renderPortal(ctx, world, next, r.leave.p, spec);
        if (this.portalHer(r.leave.p)) herScene = next.scene;
      }
      rift.set(this.riftNow, spec, life.time, world.key, next.key, portal);
      rift.group.matrix.copy(world.exit);
      rift.group.matrixWorldNeedsUpdate = true;
      world.scene.add(rift.group);
      // Its light on her: the next world's key colour.
      world.rig.spill.color.setHex(next.key);
      world.rig.spill.position.copy(RIFT_LIGHT).applyMatrix4(world.exit);
      world.rig.spill.intensity = this.riftNow.light * 380;
    }
    rift.resolution.set(ctx.size.width * ctx.size.dpr, ctx.size.height * ctx.size.dpr);
    rift.setWarp(warp * 0.9, life.time, ctx.size.aspect, world.key);
    if (warp > 0.002) world.scene.add(rift.warp);
    else rift.warp.removeFromParent();

    if (herScene === world.scene) this.fly(ctx, world.scene, pose);

    ctx.setHeaderTone(world.headerTone?.(T) ?? "dark");
    const look = world.post();
    const bloom = look.bloom ?? 0.5;
    const threshold = look.bloomThreshold ?? 0.66;
    ctx.stage.post.set({
      ...look,
      bloom: bloom + surge * 1.6,
      bloomThreshold: threshold - surge * 0.25,
      flash: surge * 0.85,
      flashColor: 0xfff6e4,
    });
    const p = T / world.length;
    this.hud.update(ctx, r.arrive || r.leave ? null : r.index, p);
    this.placeHotspot(ctx, camera);
  }

  /** The wormhole into its half-resolution target, from the stage camera. */
  private drawHole(ctx: StoryContext, p: number) {
    const hole = this.hole;
    const target = this.holeTarget;
    if (!hole || !target) return;
    const size = scaledSize(ctx, backgroundScale(this.quality));
    if (target.width !== size.width || target.height !== size.height)
      target.setSize(size.width, size.height);
    hole.set(
      this.life.time,
      this.life.flow,
      ctx.director.freeze,
      holeStreak(p),
      this.quality === "low" ? 3 : 6,
    );
    this.paperEye.set(0, 0, 0).applyMatrix4(this.holeToPaper);
    hole.aim(ctx.stage.camera, this.holeToPaper, this.paperEye, target.height);
    hole.render(ctx.stage.renderer, target);
  }

  /** Is she through the rift's plane (rift-local z < 0) while the camera is not yet? */
  private portalHer(p: number) {
    return p > 0.5 && p < RIFT_CUT;
  }

  /** The next world as seen through the rift, from the camera moved through the rift's frames. */
  private renderPortal(
    ctx: StoryContext,
    world: World,
    next: World,
    p: number,
    spec: (typeof RIFTS)[number],
  ) {
    const target = this.portalTarget;
    const exit = world.exit;
    if (!target || !exit) return null;
    const size = scaledSize(ctx, portalScale(this.quality));
    if (target.width !== size.width || target.height !== size.height)
      target.setSize(size.width, size.height);
    const camera = ctx.stage.camera;
    this.inverse.copy(exit).invert();
    this.portalMatrix.multiplyMatrices(next.entry, this.inverse);
    const pc = this.portalCamera;
    pc.copy(camera);
    pc.position.applyMatrix4(this.portalMatrix);
    this.tmpQ.setFromRotationMatrix(this.portalMatrix);
    pc.quaternion.premultiply(this.tmpQ);
    pc.updateMatrixWorld(true);
    pc.updateProjectionMatrix();
    const arriveT = -(1 - RIFT_CUT) * (RIFT_BEATS.at(0)?.vh ?? 1);
    next.frame(ctx, {
      T: arriveT,
      time: this.life.time,
      flow: this.life.flow,
      freeze: ctx.director.freeze,
      view: "portal",
      camera: pc,
    });
    if (this.portalHer(p)) {
      // She is through: she flies on in the next world, seen through the star.
      riftChoreo(p, spec, this.poseB, this.shotB, this.life.time, world.key, next.key);
      transformPose(this.poseB, null, next.entry);
      this.fly(ctx, next.scene, this.poseB);
    }
    const renderer = ctx.stage.renderer;
    this.state.save(renderer);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(next.scene, pc);
    this.state.restore(renderer);
    return target.texture;
  }

  /** Her style turns from the crossing's into the world's own over the first moments. */
  private blendArrival(ctx: StoryContext, world: World, index: number, T: number) {
    const a = this.poseB;
    const s = this.shotB;
    if (index === 0) {
      holeChoreo(1, ctx.size.aspect, a, s, this.life.time);
    } else {
      const spec = RIFTS.at(index - 1);
      const prev = this.worlds.at(index - 1);
      if (!spec || !prev) return;
      riftChoreo(1, spec, a, s, this.life.time, prev.key, world.key);
    }
    transformPose(a, null, world.entry);
    const w = ease01(T, 0, ARRIVE_BLEND);
    const keep = copyPose(createPoseScratch(), this.pose);
    mixPose(this.pose, a, keep, w);
    this.pose.position.copy(keep.position);
    this.pose.heading.copy(keep.heading);
    this.pose.velocity.copy(keep.velocity);
  }

  /** She slows and rights herself into the punch pose; the camera settles on the rift shot. */
  private blendExit(world: World, index: number, T: number) {
    const spec = RIFTS.at(index);
    const next = this.worlds.at(index + 1);
    if (!spec || !next || !world.exit) return;
    riftChoreo(0, spec, this.poseB, this.shotB, this.life.time, world.key, next.key);
    transformPose(this.poseB, this.shotB, world.exit);
    const w = ease01(T, world.length - EXIT_BLEND, world.length);
    mixPose(this.pose, this.pose, this.poseB, w);
    mixShot(this.shot, this.shot, this.shotB, w);
  }

  /** Poses her in `scene`, with her trail. */
  private fly(ctx: StoryContext, scene: Scene, pose: FlightPose) {
    const flight = this.flight;
    const godette = this.godette;
    if (!flight || !godette) return;
    flight.apply(scene, pose, this.life.dt);
    if (this.trailScene !== scene) {
      flight.trail.clear();
      scene.add(flight.trail.mesh);
      this.trailScene = scene;
    }
    godette.socket("foot_L", this.footL);
    godette.socket("foot_R", this.footR);
    this.tmpV.copy(this.footL).add(this.footR).multiplyScalar(0.5);
    flight.trail.setColours(pose.glowColor, 0xffffff);
    flight.trail.setIntensity(Math.min(1, pose.glow) * 0.9);
    flight.trail.push(this.tmpV, this.life.time);
    flight.trail.update(this.life.time);
    // Hover: she smiles at the cursor (mouse only; a finger has no hover).
    const pointer = ctx.pointer;
    if (pointer.type === "mouse" && pointer.inside && this.life.time - this.hoverAt > 0.25) {
      if (pointer.raycast(godette.hitProxy).length > 0) {
        godette.react("hover");
        ctx.pointer.setCursor("pointer");
        this.hoverAt = this.life.time;
      }
    }
    if (this.burst) this.burst.update(this.life.time, ctx.size.height * ctx.size.dpr);
  }

  private placeHotspot(ctx: StoryContext, camera: PerspectiveCamera) {
    const godette = this.godette;
    if (!godette || !godette.root.visible) {
      this.hud.place(ctx, camera, null, 0);
      return;
    }
    godette.socket("chest", this.tmpV);
    this.hud.place(ctx, camera, this.tmpV, 0.9);
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent) {
    const godette = this.godette;
    if (event.type !== "tap") return false;
    if (godette && godette.root.visible && event.raycast(godette.hitProxy).length > 0) {
      this.cheer();
      return true;
    }
    const r = route(ctx.director.t);
    if (r.kind !== "world") return false;
    const world = this.worlds.at(r.index);
    return world?.pointer?.(ctx, event, this.life.time) ?? false;
  }

  resize(ctx: StoryContext) {
    const hole = this.holeTarget;
    if (hole) {
      const size = scaledSize(ctx, backgroundScale(this.quality));
      hole.setSize(size.width, size.height);
    }
  }

  tier(ctx: StoryContext) {
    this.quality = ctx.tier;
    for (const world of this.worlds) world.setTier(ctx.tier);
    this.rift?.setTier(ctx.tier);
  }

  sleep(ctx: StoryContext) {
    this.flight?.trail.setIntensity(0);
    this.flight?.trail.mesh.removeFromParent();
    this.trailScene = null;
    this.rift?.group.removeFromParent();
    this.rift?.warp.removeFromParent();
    this.burst?.points.removeFromParent();
    this.hud.place(ctx, ctx.stage.camera, null, 0);
  }

  dispose() {
    this.feed?.dispose();
    for (const world of this.worlds) world.dispose();
    this.rift?.dispose();
    this.flight?.dispose();
    this.burst?.dispose();
    this.holeTarget?.dispose();
    this.portalTarget?.dispose();
    this.holeLayer?.material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.hud.dispose();
    this.holeScene.clear();
  }
}

let poseScratch: FlightPose | null = null;

function createPoseScratch() {
  poseScratch ??= createPose();
  return poseScratch;
}

/** The flash of the throat crossing in `w-hole` (a white-out peaking at the cut). */
function throatFlash(p: number) {
  const up = ease01(p, HOLE_CUT - 0.1, HOLE_CUT);
  const down = 1 - ease01(p, HOLE_CUT, HOLE_CUT + 0.12);
  return p < HOLE_CUT ? up * 0.95 : down * 0.95;
}

/** Share of the canvas the view through a rift renders at. */
function portalScale(tier: StoryContext["tier"]) {
  return tier === "low" ? 0.34 : tier === "medium" ? 0.42 : 0.5;
}

/** Yields to the browser between pieces of `init`, so the build never blocks the page. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

export function createAct(): StoryAct {
  return new WorldsAct();
}
