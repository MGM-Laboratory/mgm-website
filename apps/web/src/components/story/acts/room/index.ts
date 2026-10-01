import {
  DirectionalLight,
  Group,
  MathUtils,
  PointLight,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Mesh,
  type Object3D,
} from "three";

import { STORY_TABLE } from "@/data/story";
import {
  STORY_LAYERS,
  saturate,
  smoothstep,
  type ActState,
  type StoryAct,
  type StoryContext,
  type StoryHotspot,
  type StoryPointerEvent,
} from "@/components/story/engine/act";
import { actOf } from "@/components/story/engine/timeline";
import type { DeckBox } from "@/components/story/props/deck-box";
import { createMagicTrail, type MagicTrail } from "@/components/story/props/fx/magic-trail";
import { createSpark, type Spark } from "@/components/story/props/fx/spark";
import { createSparkleBurst, type SparkleBurst } from "@/components/story/props/fx/sparkle-burst";
import { GODETTE_STAND, type Godette } from "@/components/story/props/godette";
import type { StoryRoom } from "@/components/story/props/room";
import { ensureDeckBox, ensureGodette, ensureRoom } from "@/components/story/props/shared";

import { CameraPath, RoomCameraRig, createPose, shotPose, type CamPose } from "./camera";
import { ContactShadows, DustMotes, DustPuff, LightPool, setLayerDeep } from "./fx";
import { TableLetters, type LetterTiming } from "./letters";
import { at, beatSeconds, bump, ring } from "./script";
import { TOY_YAW, ToyDirector } from "./toy";

/**
 * Act 2, the table (SPEC section 1, `r-land` to `r-dive`). The box has just
 * landed on the coffee table of a living room at dusk. Godette stands on her
 * figure stand beside it, frozen in a toy's heroic pose she did not choose,
 * and the toy letters drop onto the table: "We tell stories through
 * interactive media." She breaks the pose, a spark slips out of the box and
 * drags her into the air, she learns to fly, the TV wakes up and she dives
 * into it.
 *
 * Everything scrubbed is a pure function of the story position; the life on
 * top (her blinks and nerves, the letters' wobbles, the dust, the camera's
 * parallax and handheld) runs on the clock. The act owns the room, the box
 * and Godette from `r-land` on; during the card act's `c-drop` it only
 * stands her on the table, and from `w-hole` on it lets go of her.
 */

const ROOM_RANGE = actOf("room");
const LETTER_COUNT_MAX = 64;
/** The lamps' warm-up: where `c-drop` hands them over, and they are full by mid r-land. */
export const LAMPS_AT_LAND = 0.7;
/** The spark's warm light. */
const SPARK_COLOUR = 0xffd27a;
const UP = new Vector3(0, 1, 0);
/** Her front and her left on the stand (model +Z and +X turned by her yaw). */
const TOY_FRONT = new Vector3(Math.sin(TOY_YAW), 0, Math.cos(TOY_YAW));
const TOY_LEFT = new Vector3(Math.cos(TOY_YAW), 0, -Math.sin(TOY_YAW));
/** Her head's height above her feet on the table, metres. */
const HEAD_HEIGHT = 0.148;

type Scratch = {
  pose: CamPose;
  v: Vector3;
  w: Vector3;
  u: Vector3;
  head: Vector3;
  loop: Vector3;
  q: Quaternion;
};

class RoomAct implements StoryAct {
  readonly id = "room" as const;
  private ready = false;
  private room: StoryRoom | null = null;
  private box: DeckBox | null = null;
  private godette: Godette | null = null;
  private toy: ToyDirector | null = null;
  private letters: TableLetters | null = null;
  private spark: Spark | null = null;
  private trail: MagicTrail | null = null;
  private burst: SparkleBurst | null = null;
  private cheer: SparkleBurst | null = null;
  private readonly group = new Group();
  private readonly shadows = new ContactShadows(2 + LETTER_COUNT_MAX);
  private motes: DustMotes | null = null;
  private readonly puff = new DustPuff(90);
  private readonly pool = new LightPool(SPARK_COLOUR);
  private readonly sparkLight = new PointLight(SPARK_COLOUR, 0, 0.6, 2);
  /** A soft light from the camera's side, so her face reads against the window. */
  private readonly fill = new DirectionalLight(0xfff1e0, 0);
  private readonly rig = new RoomCameraRig();
  private path: CameraPath | null = null;
  private follow: CameraPath | null = null;
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private hotspots: StoryHotspot[] = [];
  private proxies: Mesh[] = [];
  private ownsGodette = false;
  private letterTiming: LetterTiming = { from: 0, to: 0, each: 0.3 };
  private hoverLetter = -1;
  private hoverToy = false;
  private readonly sparkDodge = new Vector3();
  private readonly tmp: Scratch = {
    pose: createPose(),
    v: new Vector3(),
    w: new Vector3(),
    u: new Vector3(),
    head: new Vector3(),
    loop: new Vector3(),
    q: new Quaternion(),
  };
  private warmTarget: WebGLRenderTarget | null = null;

  async init(ctx: StoryContext) {
    const [room, box, godette] = await Promise.all([
      ensureRoom(ctx),
      ensureDeckBox(ctx),
      ensureGodette(ctx),
    ]);
    this.room = room;
    this.box = box;
    this.godette = godette;
    this.proxies = [...godette.hitProxy];
    const scene = ctx.stage.rootScene;
    room.setLayer(STORY_LAYERS.behind);
    if (room.root.parent !== scene) scene.add(room.root);
    if (!room.envMap) await room.prepare(ctx.stage.renderer);

    const anchors = room.anchors;
    this.letters = await TableLetters.create(ctx, anchors.letters);
    this.letters.toy.setEnvironment(room.envMap, 0.85);
    this.letterTiming = { from: at("r-land", 0.42), to: at("r-figure", 0.38), each: 0.3 };

    // The objects of the act, in the room frame, behind the page backdrop (the card act's drop
    // dissolves into them with the room).
    this.group.name = "story-room-act";
    this.group.add(this.letters.toy.group, this.shadows.mesh, this.puff.points, this.pool.mesh);
    const top = anchors.table.topY;
    const motes = new DustMotes(
      ctx.tier === "low" ? 80 : 180,
      new Vector3(anchors.table.centre[0] + 0.3, top + 0.6, anchors.table.centre[2] + 0.25),
      new Vector3(0.5, 0.55, 0.5),
      new Vector3(...anchors.lamps.pendant.bulb),
    );
    this.motes = motes;
    this.group.add(motes.points);
    this.spark = createSpark({ size: 0.011, colour: 0xf7bf33 });
    this.trail = createMagicTrail({
      points: 40,
      width: 0.0045,
      life: 0.5,
      head: 0xfff4d4,
      tail: 0x3a6dc5,
    });
    this.burst = createSparkleBurst({
      count: 40,
      slots: 4,
      size: 0.004,
      speed: 0.22,
      gravity: 0.05,
      life: 1.1,
    });
    this.cheer = createSparkleBurst({
      count: 24,
      slots: 6,
      size: 0.0035,
      speed: 0.16,
      gravity: 0.08,
      life: 0.9,
    });
    this.group.add(this.spark.object, this.trail.mesh, this.burst.points, this.cheer.points);
    this.sparkLight.name = "story-room-spark-light";
    this.fill.name = "story-room-camera-fill";
    this.group.add(this.sparkLight, this.fill, this.fill.target);
    setLayerDeep(this.group, STORY_LAYERS.behind);
    this.sparkLight.layers.enableAll();
    this.fill.layers.enableAll();
    scene.add(this.group);

    if (box.root.parent !== scene) scene.add(box.root);
    this.toy = new ToyDirector(godette, room);
    this.toy.prepare({
      drag: beatSeconds("r-dragged"),
      learn: beatSeconds("r-learn"),
      tv: beatSeconds("r-tv"),
      dive: beatSeconds("r-dive"),
    });
    this.toy.placeOnStand();
    scene.add(godette.root, godette.stand, godette.shadow);
    this.setGodetteLayer(STORY_LAYERS.behind);

    this.buildPath(ctx);
    this.hotspots = [
      ctx.overlay.hotspot({
        id: "room-toy",
        label: STORY_TABLE.hotspots.toy,
        onActivate: () => {
          this.godette?.react("click");
        },
      }),
      ctx.overlay.hotspot({
        id: "room-letters",
        label: STORY_TABLE.hotspots.letters,
        onActivate: () => {
          this.letters?.wave(ctx.clock.time);
        },
      }),
    ];

    // Compile with everything showing: hidden objects compile nothing.
    this.group.visible = true;
    motes.points.visible = true;
    this.puff.points.visible = true;
    this.pool.mesh.visible = true;
    this.spark.warm(true);
    this.trail.warm(true);
    for (const letter of this.letters.toy.letters) letter.scale = 1;
    this.letters.toy.commit();
    this.warmTarget = stageLikeTarget(ctx.tier === "low" ? 0 : 4);
    box.warm(true);
    await godette.compile(ctx.stage.renderer, ctx.stage.camera, scene, [null, this.warmTarget]);
    await ctx.stage.compile(scene);
    box.warm(false);
    this.spark.warm(false);
    this.trail.warm(false);
    room.setPhase("hidden");
    this.sleepObjects();
    this.ready = true;
  }

  /** The camera's keyed moves through the table beats. */
  private buildPath(ctx: StoryContext) {
    const room = this.room;
    if (!room) return;
    const aspect = ctx.size.aspect;
    const shots = room.anchors.shots;
    const land = shotPose(shots.a_land, aspect);
    const push = shotPose(shots.a_land, aspect);
    push.position.lerp(push.target, 0.025);
    push.position.y += 0.01;
    const letters = shotPose(shots.b_letters, aspect);
    const read = shotPose(shots.b_letters, aspect);
    read.position.z -= 0.025;
    read.position.lerp(read.target, 0.02);
    read.target.z -= 0.012;
    const close = shotPose(shots.b_mcu, aspect);
    // While she looks around: a slow orbit that keeps the TV behind her, a little lower.
    const pivot = new Vector3(0.575, 0.52, -0.592);
    const orbit = shotPose(shots.b_mcu, aspect);
    orbit.position
      .sub(pivot)
      .applyAxisAngle(UP, MathUtils.degToRad(9))
      .multiplyScalar(1.12)
      .add(pivot);
    orbit.position.y -= 0.015;
    orbit.target.set(0.548, 0.522, -0.565);
    // The two-shot with the box for the spark, a push in for its loops round her head, then her reach.
    const spark = createPose();
    spark.position.set(0.97, 0.53, -0.5);
    spark.target.set(0.52, 0.535, -0.535);
    spark.fov = orbit.fov * 1.08;
    const sparkClose = createPose();
    sparkClose.position.set(0.86, 0.565, -0.53);
    sparkClose.target.set(0.575, 0.555, -0.585);
    sparkClose.fov = orbit.fov * 0.95;
    const reach = createPose();
    reach.position.set(0.95, 0.56, -0.52);
    reach.target.set(0.575, 0.585, -0.585);
    reach.fov = orbit.fov * 1.05;
    this.path = new CameraPath([
      { t: at("r-land", 0), pose: land },
      { t: at("r-land", 0.42), pose: push },
      { t: at("r-figure", 0.3), pose: letters },
      { t: at("r-figure", 1), pose: read, stop: true },
      { t: at("r-break", 0.2), pose: close },
      { t: at("r-break", 0.92), pose: orbit },
      { t: at("r-spark", 0.3), pose: spark },
      { t: at("r-spark", 0.55), pose: sparkClose },
      { t: at("r-spark", 0.8), pose: sparkClose },
      { t: at("r-spark", 1), pose: reach },
    ]);
    this.buildFollow(reach);
  }

  /**
   * From r-dragged on the camera is an operator following her: each key is
   * an offset from her smoothed centre (where it sits, where it aims), so
   * the frame keeps her whatever the path does. The first key is exactly
   * where the keyed path leaves off.
   */
  private buildFollow(from: CamPose) {
    const plan = this.toy?.plan;
    if (!plan) return;
    const c0 = plan.centre(0, new Vector3());
    const rel = (
      x: number,
      y: number,
      z: number,
      ax: number,
      ay: number,
      az: number,
      fov: number,
      roll = 0,
    ) => {
      const pose = createPose();
      pose.position.set(x, y, z);
      pose.target.set(ax, ay, az);
      pose.fov = fov;
      pose.roll = MathUtils.degToRad(roll);
      return pose;
    };
    const first = createPose();
    first.position.copy(from.position).sub(c0);
    first.target.copy(from.target).sub(c0);
    first.fov = from.fov;
    const f = from.fov;
    this.follow = new CameraPath([
      { t: at("r-dragged", 0), pose: first },
      // The yank: from below, tilting up with her, a Dutch tilt.
      { t: at("r-dragged", 0.2), pose: rel(0.4, -0.07, 0.1, 0, 0.01, 0, f * 1.08, -6) },
      // The swoop over the cup and the pots: from her side, the tilt the other way.
      { t: at("r-dragged", 0.45), pose: rel(0.36, 0.0, 0.24, 0, 0, 0, f * 1.1, 8) },
      { t: at("r-dragged", 0.62), pose: rel(0.3, -0.02, 0.33, 0, 0, -0.02, f * 1.1, 6) },
      // The whip pan as she swings back.
      { t: at("r-dragged", 0.74), pose: rel(0.36, -0.06, -0.12, 0, 0, 0.02, f * 1.12, -8) },
      // The climb: low, looking up at her.
      { t: at("r-dragged", 1), pose: rel(0.3, -0.2, 0.13, 0, 0.02, 0, f * 1.18, -4) },
      // Learning: beside her, steadier and level.
      { t: at("r-learn", 0.3), pose: rel(0.4, -0.06, 0.09, 0, 0, 0, f * 1.12, 0) },
      // The loop: back far enough to see all of it.
      { t: at("r-learn", 0.5), pose: rel(0.55, -0.02, 0.1, -0.04, 0.03, 0, f * 1.12, 0) },
      { t: at("r-learn", 0.78), pose: rel(0.5, -0.01, 0.07, -0.02, 0.02, 0, f * 1.08, 0) },
      // Proud: a medium shot from a touch below, the TV dark behind her.
      { t: at("r-learn", 1), pose: rel(0.42, -0.035, 0.05, 0, 0.012, 0, f * 0.9, 0) },
      { t: at("r-tv", 0.18), pose: rel(0.42, -0.03, 0.05, 0, 0.012, 0, f * 0.92, 0) },
      // Over her shoulder, looking past her at the TV.
      { t: at("r-tv", 0.7), pose: rel(0.27, 0.06, 0.07, -0.3, 0.0, 0, f * 1.05, 0) },
      { t: at("r-tv", 1), pose: rel(0.3, 0.055, 0.045, -0.4, 0.0, 0, f * 1.08, 0), stop: true },
    ]);
  }

  resize(ctx: StoryContext) {
    this.buildPath(ctx);
  }

  update(ctx: StoryContext, state: ActState) {
    const room = this.room;
    const box = this.box;
    const godette = this.godette;
    const toy = this.toy;
    const letters = this.letters;
    if (!this.ready || !room || !box || !godette || !toy || !letters) return;
    const t = state.t;
    const scene = ctx.stage.rootScene;

    // From w-hole on, the worlds act owns her: hand her back on the default layer and step aside.
    if (t >= ROOM_RANGE.end) {
      this.releaseGodette();
      this.group.visible = false;
      for (const spot of this.hotspots) spot.place(null);
      return;
    }
    this.group.visible = true;
    this.takeGodette(scene);

    if (!state.active) {
      this.whileDropping(ctx, state, room, toy, letters);
      return;
    }

    ctx.stage.backdrop.set({ reveal: 1, paint: 1 });
    ctx.setHeaderTone("dark");
    this.rig.tick(ctx);
    const still = Math.abs(state.velocity) < 0.05;

    // --- the room
    room.setGrade(ctx.palette.scheme);
    room.setPresence(1);
    room.lamps(LAMPS_AT_LAND + (1 - LAMPS_AT_LAND) * smoothstep(0, 0.65, state.beat("r-land")));
    room.tvGlow(0x000000, 0);
    room.screenMaterial(null);
    room.setPhase(this.phaseAt(t));

    // --- the box: the drop's end pose, rocked once as it settles; the lid pops for the spark
    this.directBox(ctx, state, box, room);

    // --- Godette, then the spark that leads her
    const sparkAt = this.tmp.u;
    const sparkOn = this.sparkBeforeFlight(state, box, toy, sparkAt);
    const hovered = this.hoverToy && still;
    if (t < at("r-break", 0)) {
      toy.onStand(ctx, 1, hovered);
    } else if (t < at("r-dragged", 0)) {
      toy.onTable(ctx, state, sparkOn > 0 ? sparkAt : null, hovered);
      // The spark's last rise: just above the hand she reaches with.
      const sp = state.beat("r-spark");
      if (sp > 0.8) {
        this.tmp.w.copy(toy.frame.wrist).addScaledVector(UP, 0.006);
        sparkAt.lerp(this.tmp.w, smoothstep(0.8, 1, sp));
      }
    } else {
      toy.inFlight(ctx, state, hovered);
    }
    this.directSpark(ctx, state, toy, box, sparkAt, sparkOn);

    // --- the letters
    const shown = letters.pose(t, this.letterTiming, this.shadows, 2);
    letters.toy.group.visible = shown > 0;
    const settled = t >= this.letterTiming.to;
    letters.life(ctx, still ? this.hoverLetter : -1, settled, still && ctx.director.idle > 2.5);
    this.writeBoxShadow(room, 1);
    this.writeStandShadow(room, 1);
    this.shadows.commit();

    // --- the camera
    const pose = this.cameraAt(state, toy);
    this.rig.apply(ctx.stage.camera, pose, this.lifeAt(state), ctx.clock.time);
    this.aimFill(ctx, state);
    this.grade(ctx, state);

    // --- the pointer (hover is ignored while the page scrolls, gotcha #20)
    this.hover(ctx, state, still);

    // --- life
    this.motes?.update(ctx.clock.time, ctx.size.height, ctx.stage.camera.fov, 0.75);
    this.cheer?.update(ctx.clock.time, ctx.size.height * ctx.size.dpr);

    // --- overlay
    if (state.current === "r-figure" && state.local > 0.985 && ctx.director.idle > 1.6) {
      ctx.overlay.setHint(STORY_TABLE.hint);
    }
    this.placeHotspots(ctx, state);
  }

  /** The card act's drop (we are near): she waits on her stand in the room it reveals. */
  private whileDropping(
    ctx: StoryContext,
    state: ActState,
    room: StoryRoom,
    toy: ToyDirector,
    letters: TableLetters,
  ) {
    toy.onStand(ctx, 1, false);
    letters.pose(-1, this.letterTiming, this.shadows, 2);
    letters.toy.group.visible = false;
    this.writeBoxShadow(room, smoothstep(0.85, 1, state.beat("c-drop")));
    this.writeStandShadow(room, 1);
    this.shadows.commit();
    this.puff.points.visible = false;
    this.pool.mesh.visible = false;
    this.sparkLight.intensity = 0;
    this.fill.intensity = 0;
    this.spark?.setIntensity(0);
    this.trail?.setIntensity(0);
    this.burst?.clear();
    this.motes?.update(ctx.clock.time, ctx.size.height, ctx.stage.camera.fov, 0);
    // Defaults the card act may override (it updates after us).
    const drop = state.beat("c-drop");
    room.setPhase("crane");
    room.setGrade(ctx.palette.scheme);
    room.setPresence(smoothstep(0.2, 0.9, drop));
    room.lamps(LAMPS_AT_LAND * smoothstep(0.25, 1, drop));
    room.tvGlow(0x000000, 0);
    room.screenMaterial(null);
    for (const spot of this.hotspots) spot.place(null);
  }

  // ------------------------------------------------------------------ the box

  private directBox(ctx: StoryContext, state: ActState, box: DeckBox, room: StoryRoom) {
    const scene = ctx.stage.rootScene;
    box.root.visible = true;
    if (box.root.parent !== scene) scene.add(box.root);
    box.dropPose(1);
    // A small rock about the edge it landed on, dying out over the first half of r-land.
    const rock = ring(state.beat("r-land") * 1.43, 2.6, 5.5) * MathUtils.degToRad(2.2);
    if (rock !== 0) {
      box.root.quaternion.premultiply(this.tmp.q.setFromAxisAngle(this.tmp.v.set(0, 0, 1), rock));
    }
    // The lid pops for the spark (a drawbridge toward the table) and stays ajar.
    const sp = state.beat("r-spark");
    const pop = smoothstep(0, 0.07, sp);
    const settle = smoothstep(0.07, 0.16, sp);
    box.setLid(pop * (0.24 - 0.06 * settle) + 0.012 * ring(sp * 2.33 - 0.1, 3.5, 7));
    box.setFlap(0);
    box.peek(0);
    box.setStack(1);
    box.setGlow(0.5 * bump(sp, 0.02, 0.12, 0.3, 0.6) + 0.12 * smoothstep(0.1, 0.3, sp));
    box.setGlowPage("dark");
    box.setGlint(0, 0);
    box.update(ctx.clock.time);
    box.root.updateMatrixWorld(true);
    const puffP = saturate(state.beat("r-land") / 0.55);
    this.puff.set(
      this.tmp.v.copy(box.root.position).setY(room.anchors.table.topY),
      0.035,
      0.047,
      MathUtils.degToRad(room.anchors.boxSpot.yawDeg),
      puffP,
      ctx.size.height,
      ctx.stage.camera.fov,
      0.55,
    );
  }

  /** The box's mouth (the lid end, just under the lid's free edge), in the room. */
  private boxMouth(box: DeckBox, out: Vector3) {
    const d = box.dims;
    return out.set(d.D * 0.18, d.H / 2 - 0.004, 0).applyMatrix4(box.root.matrixWorld);
  }

  // ------------------------------------------------------------------ the spark

  /**
   * Where the spark is before the flight (r-spark): out of the box's mouth,
   * up, over to her, two loops round her head in a figure eight, a stop in
   * front of her face, then just out of reach above her hand (the caller
   * finishes that rise once her pose is known). Returns its intensity.
   */
  private sparkBeforeFlight(state: ActState, box: DeckBox, toy: ToyDirector, out: Vector3) {
    const p = state.beat("r-spark");
    if (state.t >= at("r-dragged", 0) || p <= 0.05) {
      out.set(0, 0, 0);
      return 0;
    }
    const mouth = this.boxMouth(box, this.tmp.v);
    const head = this.tmp.head.copy(toy.ground).addScaledVector(UP, HEAD_HEIGHT);
    out.copy(mouth).addScaledVector(UP, 0.04 * smoothstep(0.05, 0.2, p));
    this.tmp.w.copy(head).addScaledVector(TOY_FRONT, 0.085).addScaledVector(UP, 0.012);
    out.lerp(this.tmp.w, smoothstep(0.18, 0.32, p));
    // Two loops round her head, bobbing in a figure eight.
    const loopW = smoothstep(0.28, 0.36, p) * (1 - smoothstep(0.66, 0.74, p));
    if (loopW > 0) {
      const phase = ((p - 0.3) / 0.4) * Math.PI * 4;
      this.tmp.loop
        .copy(head)
        .addScaledVector(TOY_FRONT, Math.cos(phase) * 0.075)
        .addScaledVector(TOY_LEFT, Math.sin(phase) * 0.075)
        .addScaledVector(UP, 0.012 + 0.022 * Math.sin(phase * 2));
      out.lerp(this.tmp.loop, loopW);
    }
    // A stop in front of her face, close: she leans back.
    const stop = smoothstep(0.7, 0.76, p) * (1 - smoothstep(0.82, 0.9, p));
    if (stop > 0) out.lerp(this.tmp.w.copy(head).addScaledVector(TOY_FRONT, 0.05), stop);
    return smoothstep(0.05, 0.1, p);
  }

  /** Places the spark, its light, the pool under it and the trail behind her, for every beat. */
  private directSpark(
    ctx: StoryContext,
    state: ActState,
    toy: ToyDirector,
    box: DeckBox,
    before: Vector3,
    beforeOn: number,
  ) {
    const spark = this.spark;
    const trail = this.trail;
    const burst = this.burst;
    const room = this.room;
    if (!spark || !trail || !burst || !room) return;
    const plan = toy.plan;
    const tau = toy.frame.tau;
    const drawing = ctx.size.height * ctx.size.dpr;
    let on = beforeOn;
    const position = spark.position;
    let glow = 0;
    if (tau >= 0 && plan) {
      const tt = plan.times;
      if (tau < tt.hangEnd) plan.spark(tau, position);
      else position.copy(toy.frame.wrist);
      // The release: from her wrist into her chest, where it becomes her glow.
      const merge = smoothstep(tt.release, tt.releaseEnd, tau);
      if (merge > 0) position.lerp(toy.frame.chest, merge);
      on = 1 - smoothstep(tt.releaseEnd - 0.15, tt.releaseEnd, tau);
      glow = smoothstep(tt.release + 0.1, tt.releaseEnd, tau);
      // The merge's burst, scrubbed on the flight clock.
      burst.place(0, toy.frame.chest, tt.releaseEnd - 0.08, 1.1);
      burst.update(tau, drawing);
    } else {
      position.copy(before);
      // A puff of stars as it slips out of the box, scrubbed on r-spark seconds.
      burst.place(0, this.boxMouth(box, this.tmp.v), 0.15, 0.7);
      burst.update(state.beat("r-spark") * beatSeconds("r-spark"), drawing);
    }
    // Hover dodge: the spark slips away from the cursor (clock life).
    position.add(this.sparkDodge);
    spark.setIntensity(on);
    spark.update(ctx.clock.time);
    // Its light on her face, then her glow's light once it is in her.
    this.sparkLight.position.copy(position);
    if (glow > 0) this.sparkLight.position.lerp(toy.frame.chest, glow);
    this.sparkLight.intensity = Math.max(on * 0.0045, glow * 0.006);
    this.pool.set(this.sparkLight.position, room.anchors.table.topY, Math.max(on, glow) * 0.55);
    // Her trail: the path behind her, a pure function of the flight clock.
    if (tau >= 0 && plan) {
      const tt = plan.times;
      const light = smoothstep(tt.release, tt.releaseEnd, tau);
      const fade = 1 - smoothstep(tt.enter - 0.05, tt.enter + 0.1, tau);
      trail.setIntensity(light * fade * 0.9);
      if (light > 0) {
        trail.follow(
          (u, out) => {
            plan.centre(u, out);
            out.y -= 0.045;
          },
          tau,
          Math.min(0.55, tau - tt.release),
        );
      }
    } else {
      trail.setIntensity(0);
    }
  }

  // ------------------------------------------------------------------ Godette's ownership

  private takeGodette(scene: Object3D) {
    const godette = this.godette;
    if (!godette) return;
    if (godette.root.parent !== scene) scene.add(godette.root);
    if (godette.stand.parent !== scene) scene.add(godette.stand);
    if (godette.shadow.parent !== scene) scene.add(godette.shadow);
    godette.stand.visible = true;
    godette.root.visible = true;
    if (!this.ownsGodette) {
      this.ownsGodette = true;
      this.setGodetteLayer(STORY_LAYERS.behind);
    }
  }

  /** Back on the default layer, so the next act finds her as the prop module made her. */
  private releaseGodette() {
    if (!this.ownsGodette) return;
    this.ownsGodette = false;
    this.setGodetteLayer(STORY_LAYERS.front);
    const godette = this.godette;
    if (godette) godette.root.visible = true;
  }

  private setGodetteLayer(layer: number) {
    const godette = this.godette;
    if (!godette) return;
    setLayerDeep(godette.root, layer);
    setLayerDeep(godette.stand, layer);
    setLayerDeep(godette.shadow, layer);
  }

  // ------------------------------------------------------------------ shadows

  private writeBoxShadow(room: StoryRoom, opacity: number) {
    const slot = this.shadows.slots.at(0);
    if (!slot) return;
    const [x, y, z] = room.anchors.boxSpot.position;
    slot.position.set(x, y + 0.0002, z);
    slot.width = 0.078;
    slot.depth = 0.104;
    slot.yaw = MathUtils.degToRad(room.anchors.boxSpot.yawDeg);
    slot.opacity = 0.62 * opacity;
    slot.round = 0;
  }

  private writeStandShadow(room: StoryRoom, opacity: number) {
    const slot = this.shadows.slots.at(1);
    if (!slot) return;
    const [x, y, z] = room.anchors.figureSpot.position;
    slot.position.set(x, y + 0.0002, z);
    slot.width = GODETTE_STAND.radius * 2.6;
    slot.depth = GODETTE_STAND.radius * 2.6;
    slot.yaw = 0;
    slot.opacity = 0.55 * opacity;
    slot.round = 1;
  }

  // ------------------------------------------------------------------ the camera

  private cameraAt(state: ActState, toy: ToyDirector): CamPose {
    const out = this.tmp.pose;
    const plan = toy.plan;
    const tau = toy.frame.tau;
    if (!plan || tau < 0 || !this.follow) {
      this.path?.evaluate(state.t, out);
      return out;
    }
    // The operator: offsets from her centre, smoothed over a lag that shortens as she flies better.
    this.follow.evaluate(state.t, out);
    const lag = MathUtils.lerp(0.32, 0.16, plan.learned(tau));
    const her = plan.smoothedCentre(tau, lag, this.tmp.v);
    out.position.add(her);
    out.target.add(her);
    // In r-tv the aim moves past her to the screen.
    const tv = this.tmp.w.set(...(this.room?.anchors.tv.centre ?? [0, 0, 0]));
    out.target.lerp(tv, 0.55 * smoothstep(0.3, 0.85, state.beat("r-tv")));
    return out;
  }

  private lifeAt(state: ActState) {
    const drag = state.beat("r-dragged");
    const learn = state.beat("r-learn");
    const handheld = 0.0012 + 0.0075 * smoothstep(0, 0.1, drag) * (1 - smoothstep(0.2, 0.9, learn));
    const parallax = state.current === "r-figure" ? 0.022 : 0.03;
    return { parallax, handheld, handheldRate: 1 + 1.4 * (1 - learn) * drag };
  }

  /** The lens: a soft bloom that the spark, her glow and the screen push harder, a vignette, a little grain. */
  private grade(ctx: StoryContext, state: ActState) {
    const magic = state.span("r-spark", "r-learn");
    const sparkle = smoothstep(0.02, 0.12, magic);
    const screen = state.span("r-tv", "r-dive");
    ctx.stage.post.set({
      bloom: 0.16 + 0.3 * sparkle + 0.2 * smoothstep(0, 0.2, screen),
      bloomThreshold: MathUtils.lerp(0.82, 0.68, sparkle),
      bloomRadius: 0.55,
      vignette: 0.3,
      grain: 0.035,
    });
  }

  /** The camera-side fill light: soft, from just above the lens toward what it looks at. */
  private aimFill(ctx: StoryContext, state: ActState) {
    const camera = ctx.stage.camera;
    this.fill.position.copy(camera.position).addScaledVector(UP, 0.25);
    this.fill.target.position.copy(this.tmp.pose.target);
    this.fill.target.updateMatrixWorld();
    const light = ctx.palette.scheme === "light" ? 0.5 : 0.28;
    this.fill.intensity = light * (1 - 0.4 * state.beat("r-tv"));
  }

  private phaseAt(t: number) {
    if (t < at("r-break", 0.22)) return "land" as const;
    if (t < at("r-learn", 0.45)) return "table" as const;
    return "takeoff" as const;
  }

  // ------------------------------------------------------------------ the pointer

  private hover(ctx: StoryContext, state: ActState, still: boolean) {
    const pointer = ctx.pointer;
    this.hoverLetter = -1;
    this.hoverToy = false;
    const spark = this.spark;
    // The spark's dodge springs back when nobody chases it.
    this.sparkDodge.multiplyScalar(Math.exp(-4 * ctx.clock.dt));
    if (!still || !pointer.inside || pointer.type === "none") {
      pointer.setCursor(null);
      return;
    }
    this.ndc.set(pointer.ndc.x, pointer.ndc.y);
    this.raycaster.setFromCamera(this.ndc, ctx.stage.camera);
    this.raycaster.layers.enableAll();
    const godette = this.godette;
    let toyHit = false;
    if (godette?.root.visible) {
      toyHit = this.raycaster.intersectObjects(this.proxies, false).length > 0;
    }
    const letters = this.letters;
    let letter = -1;
    if (letters && state.t > this.letterTiming.from) letter = letters.hit(this.raycaster);
    if (toyHit) this.hoverToy = true;
    else this.hoverLetter = letter;
    // The spark dodges a cursor that comes within a few centimetres of it.
    if (spark && spark.position.lengthSq() > 0) {
      const closest = this.raycaster.ray.closestPointToPoint(spark.position, this.tmp.w);
      const away = this.tmp.v.copy(spark.position).sub(closest);
      const d = away.length();
      if (d < 0.05 && d > 1e-5) {
        this.sparkDodge.addScaledVector(away.normalize(), (0.05 - d) * 0.5);
      }
    }
    pointer.setCursor(this.hoverToy || this.hoverLetter >= 0 ? "pointer" : null);
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent) {
    if (event.type !== "tap") return false;
    this.ndc.set(event.ndc.x, event.ndc.y);
    this.raycaster.setFromCamera(this.ndc, ctx.stage.camera);
    this.raycaster.layers.enableAll();
    const godette = this.godette;
    if (godette?.root.visible && this.raycaster.intersectObjects(this.proxies, false).length > 0) {
      godette.react("click");
      if (this.toy) this.cheer?.fire(this.toy.frame.head, ctx.clock.time, 0.6);
      return true;
    }
    const letters = this.letters;
    if (letters) {
      const index = letters.hit(this.raycaster);
      if (index >= 0) {
        letters.hop(index);
        return true;
      }
    }
    return false;
  }

  private placeHotspots(ctx: StoryContext, state: ActState) {
    void ctx;
    void state;
    for (const spot of this.hotspots) spot.place(null);
  }

  // ------------------------------------------------------------------ lifecycle

  private sleepObjects() {
    this.group.visible = false;
    if (this.letters) this.letters.toy.group.visible = false;
    this.puff.points.visible = false;
    this.pool.mesh.visible = false;
    this.sparkLight.intensity = 0;
    this.fill.intensity = 0;
    this.spark?.setIntensity(0);
    this.trail?.setIntensity(0);
    for (const spot of this.hotspots) spot.place(null);
  }

  sleep() {
    this.sleepObjects();
    const room = this.room;
    if (room) {
      room.setPhase("hidden");
      room.tvGlow(0x000000, 0);
      room.screenMaterial(null);
    }
    this.releaseGodette();
    this.letters?.reset();
    this.sparkDodge.set(0, 0, 0);
  }

  dispose() {
    this.ready = false;
    this.group.removeFromParent();
    this.letters?.dispose();
    this.shadows.dispose();
    this.motes?.dispose();
    this.puff.dispose();
    this.pool.dispose();
    this.spark?.dispose();
    this.trail?.dispose();
    this.burst?.dispose();
    this.cheer?.dispose();
    this.sparkLight.dispose();
    this.fill.dispose();
    this.warmTarget?.dispose();
    for (const spot of this.hotspots) spot.dispose();
    this.hotspots = [];
  }
}

/** One pixel shaped like the stage's post target (RGBA8 display bytes, three's XR flag), for warm-up draws. */
function stageLikeTarget(samples: number) {
  const target = new WebGLRenderTarget(1, 1, {
    type: UnsignedByteType,
    samples,
    depthBuffer: true,
  });
  target.texture.colorSpace = SRGBColorSpace;
  target.texture.internalFormat = "RGBA8";
  Object.assign(target, { isXRRenderTarget: true });
  return target;
}

export function createAct(): StoryAct {
  return new RoomAct();
}
