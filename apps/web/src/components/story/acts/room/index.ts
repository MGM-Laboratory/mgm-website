import {
  Box3,
  Color,
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
  type PerspectiveCamera,
} from "three";

import { STORY_TABLE } from "@/data/story";
import {
  STORY_LAYERS,
  damp,
  saturate,
  smoothstep,
  type ActState,
  type StoryAct,
  type StoryContext,
  type StoryHotspot,
  type StoryPointerEvent,
  Latch,
  expoOut,
} from "@/components/story/engine/act";
import { actOf } from "@/components/story/engine/timeline";
import type { DeckBox } from "@/components/story/props/deck-box";
import { createMagicTrail, type MagicTrail } from "@/components/story/props/fx/magic-trail";
import { createSpark, type Spark } from "@/components/story/props/fx/spark";
import { createSparkleBurst, type SparkleBurst } from "@/components/story/props/fx/sparkle-burst";
import { GODETTE_STAND, type Godette } from "@/components/story/props/godette";
import {
  screenFillDistance,
  screenFillFov,
  type RoomPhase,
  type StoryRoom,
} from "@/components/story/props/room";
import { ensureDeckBox, ensureGodette, ensureRoom, tvFeed } from "@/components/story/props/shared";

import { CameraPath, RoomCameraRig, createPose, shotPose, type CamPose } from "./camera";
import { RoomDof } from "./dof";
import { ContactShadows, DustMotes, DustPuff, LightPool, setLayerDeep } from "./fx";
import { RoomProps, Wobble, projectBox, projectPoint } from "./interact";
import { TableLetters, type LetterTiming } from "./letters";
import { at, beatSeconds, bump, ring } from "./script";
import { TOY_YAW, ToyDirector } from "./toy";
import { TvScreen } from "./tv";

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
/** The vertical FOV the dive ends on, at the screen's full cover (degrees). */
const DIVE_FILL_FOV = 48;
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

type Spots = Readonly<{
  toy: StoryHotspot;
  letters: StoryHotspot;
  box: StoryHotspot;
  spark: StoryHotspot;
  tv: StoryHotspot;
}>;

/** What the pointer is over. */
type Pick =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "toy" }>
  | Readonly<{ kind: "letter"; index: number }>
  | Readonly<{ kind: "box" }>
  | Readonly<{ kind: "prop"; mesh: Mesh }>
  | Readonly<{ kind: "tv"; uv: Vector2 | null }>;

/** The parts of the act's state a hotspot lights up. */
type Lit = { toy: boolean; letters: boolean; box: boolean; spark: boolean; tv: boolean };

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
  private spots: Spots | null = null;
  private proxies: Mesh[] = [];
  private dof: RoomDof | null = null;
  private props: RoomProps | null = null;
  /** Clock life of the pointer's answers: her stand's rock, the box's hover lift and hop, the TV. */
  private readonly toyRock = new Wobble(2.3, 0.11);
  private readonly rockAxis = new Vector3(1, 0, 0);
  private boxLift = 0;
  private boxHop = -1;
  private boxAir = 0;
  private tvHover = 0;
  private tvBlip = -1;
  private tvTap: { x: number; y: number; seconds: number } | null = null;
  private hoverBox = false;
  private hoverTv = false;
  /** Where the pointer is on the screen (its UV), while `hoverTv`. */
  private readonly tvUv = new Vector2(0.5, 0.5);
  private hoverSpark = false;
  /** How much of the spark shows this frame (its hotspot and its dodge need it out). */
  private sparkShown = 0;
  /** The clock time the last tap's sparkles are gone by. */
  private cheerUntil = 0;
  private hoverProp: Mesh | null = null;
  private letterPoke = 0;
  private readonly letterBox = new Box3();
  private readonly hitBox = new Box3();
  private readonly partBox = new Box3();
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
  private tv: TvScreen | null = null;
  private readonly power = new Latch();
  private lastT = -1;
  /** The last story position this act saw (near or active). */
  private seenT = 0;
  private readonly glowColour = new Color();
  private readonly start = createPose();
  /** The operator stands further off on a narrow frame (portrait), so her swings stay in it. */
  private followScale = 1;
  private tvCentre = new Vector3();
  private tvNormal = new Vector3(1, 0, 0);

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
      ctx.tier === "low" ? 70 : 180,
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

    // The TV: the picture's program, and its standby LED under the screen.
    const tvAnchors = anchors.tv;
    this.tvCentre.set(...tvAnchors.centre);
    this.tvNormal.set(...tvAnchors.normal).normalize();
    const ledAt = new Vector3(
      (tvAnchors.corners.bl[0] + tvAnchors.corners.br[0]) / 2,
      tvAnchors.corners.bl[1] - 0.013,
      (tvAnchors.corners.bl[2] + tvAnchors.corners.br[2]) / 2,
    ).addScaledVector(this.tvNormal, 0.012);
    this.tv = new TvScreen(
      tvAnchors.size[0] / tvAnchors.size[1],
      this.tvCentre,
      this.tvNormal,
      ledAt,
    );
    this.group.add(this.tv.led);
    setLayerDeep(this.tv.led, STORY_LAYERS.behind);

    this.buildPath(ctx);
    this.props = new RoomProps(room);
    const labels = STORY_TABLE.hotspots;
    // Created back to front: a later hotspot sits above an earlier one where they overlap (her over the
    // TV behind her, the spark over her), and that is also the order Tab walks them in.
    const tvSpot = ctx.overlay.hotspot({
      id: "room-tv",
      label: labels.tv,
      onActivate: () => {
        // A click lands where the pointer is on the glass; Enter at the middle.
        this.tapTv(ctx, this.hoverTv ? this.tvUv : null);
      },
    });
    const boxSpot = ctx.overlay.hotspot({
      id: "room-box",
      label: labels.box,
      onActivate: () => {
        this.tapBox();
      },
    });
    const letterSpot = ctx.overlay.hotspot({
      id: "room-letters",
      label: labels.letters,
      onActivate: () => {
        // A click on a letter hops that letter; Enter (or a click between them) sends a wave along the rows.
        if (this.hoverLetter >= 0) this.letters?.hop(this.hoverLetter);
        else this.letters?.wave(ctx.clock.time);
      },
    });
    const toySpot = ctx.overlay.hotspot({
      id: "room-toy",
      label: labels.toy,
      onActivate: () => {
        this.tapToy(ctx);
      },
    });
    const sparkSpot = ctx.overlay.hotspot({
      id: "room-spark",
      label: labels.spark,
      onActivate: () => {
        this.tapSpark(ctx);
      },
    });
    this.spots = { toy: toySpot, letters: letterSpot, box: boxSpot, spark: sparkSpot, tv: tvSpot };

    // Compile with everything showing: hidden objects compile nothing.
    this.group.visible = true;
    motes.points.visible = true;
    this.puff.points.visible = true;
    this.pool.mesh.visible = true;
    this.spark.warm(true);
    this.trail.warm(true);
    for (const letter of this.letters.toy.letters) letter.scale = 1;
    this.letters.toy.commit();
    // Where the phrase stands once every letter has landed (its hotspot): each glyph's box at home.
    const group = this.letters.toy.group;
    group.updateMatrixWorld(true);
    this.letterBox.makeEmpty();
    for (const letter of this.letters.toy.letters) {
      const half = this.tmp.v.copy(letter.size).multiplyScalar(0.5);
      this.partBox.min.set(letter.home.x - half.x, letter.home.y, letter.home.z - half.z);
      this.partBox.max.set(
        letter.home.x + half.x,
        letter.home.y + letter.size.y,
        letter.home.z + half.z,
      );
      this.letterBox.union(this.partBox.applyMatrix4(group.matrixWorld));
    }
    this.warmTarget = stageLikeTarget(ctx.tier === "low" ? 0 : 4);
    box.warm(true);
    room.screenMaterial(this.tv.material);
    this.tv.led.visible = true;
    await godette.compile(ctx.stage.renderer, ctx.stage.camera, scene, [null, this.warmTarget]);
    await ctx.stage.compile(scene);
    // The lens: its three passes compile now; its targets come with the first frame through it.
    this.dof = new RoomDof(ctx.tier === "high" ? 32 : 20, ctx.tier === "high" ? 4 : 2);
    await this.dof.compile(ctx.stage.renderer);
    room.screenMaterial(null);
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
    // The slow push while people read: on a wide frame only (the shot is fitted for every aspect as it is).
    const wide = saturate((aspect - 1) / (16 / 9 - 1));
    read.position.z -= 0.025 * wide;
    read.position.lerp(read.target, 0.02 * wide);
    read.target.z -= 0.012 * wide;
    this.followScale = 1 + 0.32 * (1 - saturate(aspect));
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
      { t: at("r-tv", 0.7), pose: rel(0.27, 0.04, 0.07, -0.3, -0.012, 0, f * 1.05, 0) },
      { t: at("r-tv", 1), pose: rel(0.3, 0.036, 0.045, -0.4, -0.014, 0, f * 1.08, 0), stop: true },
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
    this.seenT = t;
    const scene = ctx.stage.rootScene;

    // From w-hole on, the worlds act owns her: hand her back on the default layer and step aside.
    if (t >= ROOM_RANGE.end) {
      this.releaseGodette();
      this.group.visible = false;
      this.placeNoSpots();
      this.dof?.release();
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
    const dt = ctx.clock.storyDt;
    const lit = this.litBySpots(still);

    // --- the room
    room.setGrade(ctx.palette.scheme);
    room.setPresence(1);
    // The lamps finish warming as the box settles, and dim a little around the screen once it is on.
    const warm = LAMPS_AT_LAND + (1 - LAMPS_AT_LAND) * smoothstep(0, 0.65, state.beat("r-land"));
    const dim =
      0.26 * smoothstep(0.1, 0.8, state.beat("r-tv")) +
      0.2 * smoothstep(0.2, 1, state.beat("r-dive"));
    // A breath of flicker in the bulbs (clock life, under 2%).
    const time = ctx.clock.time;
    const flicker = 1 + 0.012 * Math.sin(time * 7.3) * Math.sin(time * 2.9 + 1.3);
    room.lamps((warm - dim) * flicker);

    // --- the box: the drop's end pose, rocked once as it settles; the lid pops for the spark
    this.directBox(ctx, state, box, room, lit.box);

    // --- Godette, then the spark that leads her
    const sparkAt = this.tmp.u;
    const sparkOn = this.sparkBeforeFlight(state, box, toy, sparkAt);
    const hovered = (this.hoverToy && still) || lit.toy;
    const rock = { angle: this.toyRock.step(dt), axis: this.rockAxis };
    if (t < at("r-break", 0)) {
      toy.onStand(ctx, 1, hovered, rock);
    } else if (t < at("r-dragged", 0)) {
      toy.onTable(ctx, state, sparkOn > 0 ? sparkAt : null, hovered, rock);
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
    letters.life(
      ctx,
      still ? this.focusLetter(lit.letters, dt) : -1,
      settled,
      still && ctx.director.idle > 2.5,
    );
    this.writeBoxShadow(room, 1);
    this.writeStandShadow(room, 1);
    this.shadows.commit();

    // --- the camera
    const pose = this.cameraAt(ctx, state, toy);
    this.rig.apply(ctx.stage.camera, pose, this.lifeAt(state), ctx.clock.time);
    ctx.stage.camera.updateProjectionMatrix();
    this.aimFill(ctx, state);
    this.grade(ctx, state);
    this.props?.update(dt, smoothstep(0.6, 1, state.beat("r-tv")));

    // --- the TV, and what the room shows for this camera
    const phase = this.phaseFor(ctx, state);
    room.setPhase(phase);
    this.directTv(ctx, state, room, toy, phase, lit.tv);

    // --- the pointer (hover is ignored while the page scrolls, gotcha #20)
    this.hover(ctx, state, still);

    // --- life
    this.motes?.update(ctx.clock.time, ctx.size.height, ctx.stage.camera.fov, 0.75);
    const cheer = this.cheer;
    if (cheer) {
      cheer.update(ctx.clock.time, ctx.size.height * ctx.size.dpr);
      // An idle burst draws nothing: keep it off the draw list until the next one.
      cheer.points.visible = ctx.clock.time < this.cheerUntil;
    }

    // --- overlay
    if (state.current === "r-figure" && state.local > 0.985 && ctx.director.idle > 1.6) {
      ctx.overlay.setHint(STORY_TABLE.hint);
    }
    this.placeHotspots(ctx, state);

    // --- the lens, last: everything above is in place for this frame
    this.lens(ctx, state, toy);
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
    this.sparkShown = 0;
    this.trail?.setIntensity(0);
    this.burst?.clear();
    this.motes?.update(ctx.clock.time, ctx.size.height, ctx.stage.camera.fov, 0);
    this.placeNoSpots();
    this.tv?.setLed(ctx.clock.time, 0);
    // Defaults the card act may override (it updates after us).
    const drop = state.beat("c-drop");
    room.setPhase("crane");
    room.setGrade(ctx.palette.scheme);
    room.setPresence(smoothstep(0.2, 0.9, drop));
    room.lamps(LAMPS_AT_LAND * smoothstep(0.25, 1, drop));
    room.tvGlow(0x000000, 0);
    room.screenMaterial(null);
  }

  // ------------------------------------------------------------------ the box

  private directBox(
    ctx: StoryContext,
    state: ActState,
    box: DeckBox,
    room: StoryRoom,
    focused: boolean,
  ) {
    const scene = ctx.stage.rootScene;
    const dt = ctx.clock.storyDt;
    box.root.visible = true;
    if (box.root.parent !== scene) scene.add(box.root);
    box.dropPose(1);
    // A small rock about the edge it landed on, dying out over the first half of r-land.
    const rock = ring(state.beat("r-land") * 1.43, 2.6, 5.5) * MathUtils.degToRad(2.2);
    if (rock !== 0) {
      box.root.quaternion.premultiply(this.tmp.q.setFromAxisAngle(this.tmp.v.set(0, 0, 1), rock));
    }
    // Life: a hover lifts the lid a hair; a tap makes the box hop and one card pop up and back.
    this.boxLift = damp(this.boxLift, this.hoverBox || focused ? 1 : 0, 9, dt);
    let hop = 0;
    let squash = 1;
    let pop = 0;
    if (this.boxHop >= 0) {
      this.boxHop += dt;
      const h = this.boxHop;
      hop = h < 0.36 ? Math.sin((h / 0.36) * Math.PI) : 0;
      // Squash on the take off and the landing, a stretch in the air.
      squash = 1 + 0.06 * hop - 0.07 * ring(h - 0.36, 3.2, 9);
      squash -= h < 0.06 ? 0.05 * Math.sin((h / 0.06) * Math.PI) : 0;
      pop = h < 0.95 ? Math.sin(saturate(h / 0.95) * Math.PI) : 0;
      if (h > 1.4) this.boxHop = -1;
    }
    box.root.position.y += hop * 0.016;
    this.boxAir = hop;
    box.root.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    // The lid pops for the spark (a drawbridge toward the table) and stays ajar.
    const sp = state.beat("r-spark");
    const lidPop = smoothstep(0, 0.07, sp);
    const settle = smoothstep(0.07, 0.16, sp);
    box.setLid(
      lidPop * (0.24 - 0.06 * settle) + 0.012 * ring(sp * 2.33 - 0.1, 3.5, 7) + 0.03 * this.boxLift,
    );
    box.setFlap(0);
    box.peek(0.42 * pop);
    box.setStack(1);
    // The warm glow inside as the spark leaves; it dies away once she is off the table.
    const after = 1 - smoothstep(0, 0.45, state.beat("r-dragged"));
    box.setGlow(0.5 * bump(sp, 0.02, 0.12, 0.3, 0.6) + 0.12 * smoothstep(0.1, 0.3, sp) * after);
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
      burst.points.visible = tau > tt.releaseEnd - 0.1 && tau < tt.releaseEnd + 1.3;
    } else {
      position.copy(before);
      // A puff of stars as it slips out of the box, scrubbed on r-spark seconds.
      burst.place(0, this.boxMouth(box, this.tmp.v), 0.15, 0.7);
      const seconds = state.beat("r-spark") * beatSeconds("r-spark");
      burst.update(seconds, drawing);
      burst.points.visible = seconds > 0.13 && seconds < 1.4;
    }
    // Hover dodge: the spark slips away from the cursor (clock life).
    position.add(this.sparkDodge);
    this.sparkShown = on;
    spark.setIntensity(on * (this.hoverSpark ? 1.25 : 1));
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
    godette.shadow.visible = true;
    if (!this.ownsGodette) {
      this.ownsGodette = true;
      this.setGodetteLayer(STORY_LAYERS.behind);
    }
  }

  /**
   * Back on the default layer, so the next act finds her as the prop module
   * made her; her stand, her table shadow and the box go out of sight (they
   * would draw over the page backdrop on the front layer otherwise). The
   * act that owns the next beat shows what it needs.
   */
  private releaseGodette() {
    if (!this.ownsGodette) return;
    this.ownsGodette = false;
    this.setGodetteLayer(STORY_LAYERS.front);
    const godette = this.godette;
    if (godette) {
      godette.root.visible = true;
      godette.stand.visible = false;
      godette.setShadow(null);
      godette.shadow.visible = false;
    }
    if (this.box) this.box.root.visible = false;
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
    slot.opacity = 0.62 * opacity * (1 - 0.55 * this.boxAir);
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

  private cameraAt(ctx: StoryContext, state: ActState, toy: ToyDirector): CamPose {
    const out = this.tmp.pose;
    const dive = at("r-dive", 0);
    if (state.t < dive) return this.followAt(state.t, toy, out);
    // The dive starts where the follow leaves off.
    this.followAt(dive, toy, this.start);
    return this.diveAt(ctx, state.beat("r-dive"), this.start, out);
  }

  /** The keyed path before the flight, the operator after it. */
  private followAt(t: number, toy: ToyDirector, out: CamPose) {
    const plan = toy.plan;
    const tau = t - at("r-dragged", 0);
    if (!plan || tau < 0 || !this.follow) {
      this.path?.evaluate(t, out);
      return out;
    }
    const flightTau = this.flightClock(t);
    // The operator: offsets from her centre, smoothed over a lag that shortens as she flies better.
    // The body of the camera lags more than its aim, so she leads the move but never leaves the frame.
    this.follow.evaluate(t, out);
    const lag = MathUtils.lerp(0.32, 0.16, plan.learned(flightTau));
    const backOff = smoothstep(at("r-dragged", 0), at("r-dragged", 0.15), t);
    out.position.multiplyScalar(1 + (this.followScale - 1) * backOff);
    const her = plan.smoothedCentre(flightTau, lag, this.tmp.v);
    out.position.add(her);
    const aim = plan.smoothedCentre(flightTau, lag * 0.35, this.tmp.w);
    out.target.add(aim);
    // In r-tv the aim moves past her to the screen.
    const tvBeat = saturate((t - at("r-tv", 0)) / (at("r-dive", 0) - at("r-tv", 0)));
    out.target.lerp(this.tvCentre, 0.55 * smoothstep(0.3, 0.85, tvBeat));
    return out;
  }

  private flightClock(t: number) {
    const toy = this.toy;
    const plan = toy?.plan;
    if (!plan) return 0;
    // The same clock the toy uses: beat seconds from the start of r-dragged.
    let seconds = 0;
    for (const id of ["r-dragged", "r-learn", "r-tv", "r-dive"] as const) {
      const p = saturate((t - at(id, 0)) / (at(id, 1) - at(id, 0)));
      seconds += p * beatSeconds(id);
      if (p < 1) break;
    }
    return seconds;
  }

  /**
   * r-dive, lusion's window trick: a crash zoom onto the screen, then the
   * camera flies at it with the FOV keyed to how much of the frame the
   * screen should cover, so the picture in it holds still while its frame
   * grows to the edges. It ends on the screen's axis, at the distance where
   * the screen covers the whole frame (`screenFillDistance`).
   */
  private diveAt(ctx: StoryContext, p: number, from: CamPose, out: CamPose) {
    const room = this.room;
    if (!room) return out;
    const tv = room.anchors.tv;
    const aspect = ctx.size.aspect;
    const n = this.tvNormal;
    const c = this.tvCentre;
    const offset = this.tmp.w.copy(from.position).sub(c);
    const d0 = Math.max(0.2, offset.dot(n));
    const lateral = offset.addScaledVector(n, -d0);
    const span = Math.min(tv.size[1], tv.size[0] / Math.max(aspect, 1e-3));
    const end = screenFillDistance(tv, aspect, DIVE_FILL_FOV, 0);
    const tanHalf = (fov: number) => Math.tan(MathUtils.degToRad(fov) / 2);
    const c0 = span / (2 * d0 * tanHalf(from.fov));
    const c1 = Math.max(c0 * 1.75, 0.58);
    const cover =
      p < 0.22 ? c0 + (c1 - c0) * expoOut(p / 0.22) : c1 + (1 - c1) * smoothstep(0.22, 1, p);
    const k = Math.pow(smoothstep(0.08, 1, p), 1.6);
    const d = d0 + (end - d0) * k;
    out.position
      .copy(c)
      .addScaledVector(n, d)
      .addScaledVector(lateral, 1 - smoothstep(0, 0.82, p));
    out.target.lerpVectors(from.target, c, smoothstep(0, 0.55, p));
    let fov = MathUtils.radToDeg(2 * Math.atan(span / (2 * d * Math.max(0.05, cover))));
    // Exactly the fill at the end, so nothing but the screen is in frame.
    fov = MathUtils.lerp(fov, screenFillFov(tv, aspect, d, 0), smoothstep(0.9, 1, p));
    out.fov = fov;
    out.roll = from.roll * (1 - smoothstep(0, 0.4, p));
    return out;
  }

  /**
   * How much of the act's own look is on: none at the first frame of r-land
   * (the card act's crane hands over a bare frame on SHOT_LAND) and none at
   * the end of r-dive (the full cover is the bare picture the worlds act cuts
   * on), all of it in between.
   */
  private seam(state: ActState) {
    const k =
      smoothstep(0, 0.15, state.beat("r-land")) *
      (1 - smoothstep(0.72, 0.97, state.beat("r-dive")));
    // A hair of an effect would still switch the stage to its post path: below that it is exactly off.
    return k < 0.003 ? 0 : k;
  }

  private lifeAt(state: ActState) {
    const drag = state.beat("r-dragged");
    const learn = state.beat("r-learn");
    const handheld = 0.0012 + 0.0075 * smoothstep(0, 0.1, drag) * (1 - smoothstep(0.2, 0.9, learn));
    const settle = (1 - smoothstep(0, 0.6, state.beat("r-dive"))) * this.seam(state);
    const parallax = (state.current === "r-figure" ? 0.022 : 0.03) * settle;
    return { parallax, handheld: handheld * settle, handheldRate: 1 + 1.4 * (1 - learn) * drag };
  }

  /** The lens: a soft bloom that the spark, her glow and the screen push harder, a vignette, a little grain. */
  private grade(ctx: StoryContext, state: ActState) {
    const magic = state.span("r-spark", "r-learn");
    const sparkle = smoothstep(0.02, 0.12, magic);
    const screen = state.span("r-tv", "r-dive");
    const on = this.seam(state);
    // The low tier skips the bloom chain (eight passes): the spark, the glow and the screen carry their own halos.
    const bloom = ctx.tier === "low" ? 0 : 1;
    ctx.stage.post.set({
      bloom: (0.16 + 0.3 * sparkle + 0.2 * smoothstep(0, 0.2, screen)) * on * bloom,
      bloomThreshold: MathUtils.lerp(0.82, 0.68, sparkle),
      bloomRadius: 0.55,
      vignette: 0.3 * on,
      grain: 0.035 * on,
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

  /** Which of the room's visibility sets this camera needs (research/room.md section 5). */
  private phaseFor(ctx: StoryContext, state: ActState): RoomPhase {
    const t = state.t;
    if (t < at("r-break", 0.22)) return "land";
    if (t < at("r-learn", 0.45)) return "table";
    if (t < at("r-tv", 0.4)) return "takeoff";
    const room = this.room;
    const camera = ctx.stage.camera;
    if (!room || t < at("r-dive", 0)) return "chase";
    const offset = this.tmp.v.copy(camera.position).sub(this.tvCentre);
    const along = offset.dot(this.tvNormal);
    const lateral = offset.addScaledVector(this.tvNormal, -along).length();
    const fill = screenFillDistance(room.anchors.tv, ctx.size.aspect, camera.fov, 0.012 + lateral);
    if (along <= fill) return "fill";
    return camera.position.x < -0.17 ? "screen" : "chase";
  }

  /**
   * The TV: it wakes on the first forward crossing of r-tv (a latched
   * power-on, played on the clock; a jump or a fling lands on the end
   * state), shows the worlds act's feed or our own portal, lights the room
   * in its colour, and takes her in with ripples as she dives through.
   */
  private directTv(
    ctx: StoryContext,
    state: ActState,
    room: StoryRoom,
    toy: ToyDirector,
    phase: RoomPhase,
    focused: boolean,
  ) {
    const tv = this.tv;
    if (!tv) return;
    const t = state.t;
    const on = t >= at("r-tv", 0.06);
    const jumped = this.lastT < 0 || Math.abs(t - this.lastT) > 0.4 || state.arrived;
    this.lastT = t;
    if (jumped || Math.abs(state.velocity) > 4) this.power.value = on ? 1 : 0;
    else this.power.update(on, ctx.clock.dt, 1 / 0.95, 2.6);
    // A tap while it sleeps: a blip (the line opens into static and collapses), clock life only.
    const dt = ctx.clock.storyDt;
    let blip = 0;
    if (this.tvBlip >= 0) {
      this.tvBlip += dt;
      const b = this.tvBlip;
      blip = b < 0.14 ? 0.34 * smoothstep(0, 0.14, b) : 0.34 * (1 - smoothstep(0.45, 0.62, b));
      if (b > 0.7) this.tvBlip = -1;
    }
    const power = Math.max(this.power.value, blip);
    this.tvHover = damp(this.tvHover, this.hoverTv || focused ? 1 : 0, 8, ctx.clock.dt);
    let tap: { x: number; y: number; strength: number; seconds: number } | null = null;
    if (this.tvTap) {
      this.tvTap.seconds += dt;
      if (this.tvTap.seconds > 2.5) this.tvTap = null;
      else tap = { ...this.tvTap, strength: 1 - smoothstep(0.6, 1, state.beat("r-dive")) };
    }
    const tvBeat = state.beat("r-tv");
    const diveBeat = state.beat("r-dive");
    // The room's light from the screen: a flash, the static's flicker, then the portal's cool glow.
    const flicker = 0.75 + 0.25 * Math.sin(ctx.clock.time * 43) * Math.sin(ctx.clock.time * 17.3);
    const staticAmt = smoothstep(0.12, 0.3, power) * (1 - smoothstep(0.42, 0.68, power));
    const flash = smoothstep(0, 0.05, power) * (1 - smoothstep(0.1, 0.36, power));
    // About 0.55 with the lamps still on (a picture, not a floodlight), near 1 as the room dims for the dive.
    const level =
      power <= 0.001
        ? 0
        : 0.32 * smoothstep(0.4, 0.9, power) +
          0.55 * flash +
          0.3 * staticAmt * flicker +
          0.22 * smoothstep(0.1, 0.8, tvBeat) +
          0.45 * smoothstep(0.2, 1, diveBeat);
    room.tvGlow(tv.averageColour(power, this.glowColour), level);
    room.screenMaterial(power > 0.001 ? tv.material : null);
    tv.setLed(ctx.clock.time, power, this.tvHover);
    // The feed: the worlds act's wormhole, drawn while the screen is on.
    const feed = tvFeed(ctx);
    if (feed && power > 0.001) feed.update(ctx, ctx.clock.dt);
    // Her entry: where her centre crossed the screen, and how long ago (beat seconds).
    const plan = toy.plan;
    let entry: { x: number; y: number; strength: number; seconds: number } | null = null;
    if (plan && toy.frame.tau > plan.times.enter - 0.05) {
      const corners = room.anchors.tv.corners;
      const bl = this.tmp.v.set(...corners.bl);
      const across = this.tmp.w.set(...corners.br).sub(bl);
      const up = this.tmp.u.set(...corners.tl).sub(bl);
      const hit = plan.centre(plan.times.enter, new Vector3()).sub(bl);
      entry = {
        x: hit.dot(across) / across.lengthSq(),
        y: hit.dot(up) / up.lengthSq(),
        // Gone by the end of the dive, so the full cover shows the bare picture the worlds act opens on.
        strength: 1 - smoothstep(0.82, 0.95, diveBeat),
        seconds: toy.frame.tau - plan.times.enter,
      };
    }
    tv.set({
      time: ctx.clock.time,
      power,
      dive: smoothstep(0.35, 0.95, diveBeat),
      warp: 0.15 * smoothstep(0.2, 1, tvBeat) + 0.85 * smoothstep(0.1, 1, diveBeat),
      eye: ctx.stage.camera.position,
      feed: feed ? feed.texture : null,
      entry,
      tap,
      hover: this.tvHover * (1 - smoothstep(0, 0.4, diveBeat)),
    });
    // Close to the screen nothing but the TV wall shows: the table's things stand down.
    const near = phase === "screen" || phase === "fill";
    if (this.box) this.box.root.visible = !near;
    if (this.letters) this.letters.toy.group.visible &&= !near;
    this.shadows.mesh.visible = !near;
    if (this.motes) this.motes.points.visible &&= !near;
    if (this.godette) this.godette.stand.visible = !near;
  }

  // ------------------------------------------------------------------ the pointer

  private hover(ctx: StoryContext, state: ActState, still: boolean) {
    const pointer = ctx.pointer;
    this.hoverLetter = -1;
    this.hoverToy = false;
    this.hoverBox = false;
    this.hoverTv = false;
    this.hoverSpark = false;
    let prop: Mesh | null = null;
    // The spark's dodge springs back when nobody chases it.
    this.sparkDodge.multiplyScalar(Math.exp(-4 * ctx.clock.dt));
    const eye = ctx.stage.camera.position;
    if (!still || !pointer.inside || pointer.type === "none") {
      this.props?.hover(null, eye);
      pointer.setCursor(null);
      return;
    }
    this.ndc.set(pointer.ndc.x, pointer.ndc.y);
    this.raycaster.setFromCamera(this.ndc, ctx.stage.camera);
    this.raycaster.layers.enableAll();
    const hit = this.pick(state.t);
    if (hit.kind === "toy") this.hoverToy = true;
    else if (hit.kind === "letter") this.hoverLetter = hit.index;
    else if (hit.kind === "box") this.hoverBox = true;
    else if (hit.kind === "prop") prop = hit.mesh;
    else if (hit.kind === "tv") {
      this.hoverTv = true;
      if (hit.uv) this.tvUv.copy(hit.uv);
    }
    this.props?.hover(prop, eye);
    // The spark dodges a cursor that comes within a few centimetres of it.
    const spark = this.spark;
    if (spark && this.sparkShown > 0.5) {
      const closest = this.raycaster.ray.closestPointToPoint(spark.position, this.tmp.w);
      const away = this.tmp.v.copy(spark.position).sub(closest);
      const d = away.length();
      if (d < 0.05 && d > 1e-5) {
        this.sparkDodge.addScaledVector(away.normalize(), (0.05 - d) * 0.5);
        this.hoverSpark = true;
      }
    }
    const interactive = hit.kind !== "none" || this.hoverSpark;
    pointer.setCursor(interactive ? "pointer" : null);
  }

  /**
   * What the ray from the pointer touches first, by priority: her, the
   * letters, the box, a prop on the table, the TV. `this.raycaster` is set.
   */
  private pick(t: number): Pick {
    const godette = this.godette;
    const flying = t >= at("r-dragged", 0);
    if (godette?.root.visible && this.raycaster.intersectObjects(this.proxies, false).length > 0) {
      return { kind: "toy" };
    }
    const letters = this.letters;
    if (letters && !flying && t > this.letterTiming.from) {
      const index = letters.hit(this.raycaster);
      if (index >= 0) return { kind: "letter", index };
    }
    const box = this.box;
    if (box?.root.visible && !flying && this.raycaster.intersectObject(box.root, true).length > 0) {
      return { kind: "box" };
    }
    const props = this.props;
    if (props && !flying) {
      const first = this.raycaster.intersectObjects(props.meshes, false).at(0);
      if (first) return { kind: "prop", mesh: first.object as Mesh };
    }
    const room = this.room;
    if (room && t < at("r-dive", 0.3)) {
      const first = this.raycaster.intersectObject(room.screen, false).at(0);
      if (first) return { kind: "tv", uv: first.uv ? new Vector2(first.uv.x, first.uv.y) : null };
    }
    return { kind: "none" };
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent) {
    if (event.type !== "tap") return false;
    this.ndc.set(event.ndc.x, event.ndc.y);
    this.raycaster.setFromCamera(this.ndc, ctx.stage.camera);
    this.raycaster.layers.enableAll();
    // The spark first: it is small and quick, a tap near it counts.
    const spark = this.spark;
    if (spark && this.sparkShown > 0.5) {
      const d = this.raycaster.ray.distanceToPoint(spark.position);
      if (d < 0.025) {
        this.tapSpark(ctx);
        return true;
      }
    }
    const hit = this.pick(this.lastT);
    switch (hit.kind) {
      case "toy":
        this.tapToy(ctx);
        return true;
      case "letter":
        this.letters?.hop(hit.index);
        return true;
      case "box":
        this.tapBox();
        return true;
      case "prop":
        return this.props?.tap(hit.mesh, ctx.stage.camera.position) ?? false;
      case "tv":
        this.tapTv(ctx, hit.uv);
        return true;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------ the answers to a tap (clock life)

  private tapToy(ctx: StoryContext) {
    const godette = this.godette;
    if (!godette || !this.toy) return;
    godette.react("click");
    this.fireCheer(this.toy.frame.head, ctx.clock.time, 0.6);
    // On her stand she rocks on its rim like a knocked toy, side to side as the camera sees it.
    if (this.lastT < at("r-break", 0.15)) {
      const camera = ctx.stage.camera;
      this.rockAxis.copy(this.toy.standTop()).sub(camera.position).setY(0).normalize();
      if (this.rockAxis.lengthSq() < 0.5) this.rockAxis.set(1, 0, 0);
      const side = this.toyRock.velocity >= 0 ? 1 : -1;
      this.toyRock.kick(MathUtils.degToRad(85) * side);
    }
  }

  private fireCheer(origin: Vector3, time: number, power: number) {
    if (!this.cheer) return;
    this.cheer.fire(origin, time, power);
    this.cheerUntil = time + 1.2;
  }

  private tapBox() {
    if (this.boxHop < 0 || this.boxHop > 0.5) this.boxHop = 0;
  }

  private tapSpark(ctx: StoryContext) {
    const spark = this.spark;
    if (!spark) return;
    this.fireCheer(spark.position, ctx.clock.time, 0.8);
    // It darts away and comes back: a kick up and to the side.
    this.sparkDodge.add(this.tmp.v.set(0.012, 0.03, -0.015));
  }

  /** A tap on the TV: asleep it blips and rocks (a smack on an old set); awake a ring runs from the finger. */
  private tapTv(ctx: StoryContext, uv: Vector2 | null) {
    void ctx;
    const awake = this.power.value > 0.85;
    if (!awake) {
      if (this.tvBlip < 0 || this.tvBlip > 0.7) this.tvBlip = 0;
      this.props?.knockTv(1);
      return;
    }
    this.tvTap = { x: uv ? uv.x : 0.5, y: uv ? 1 - uv.y : 0.5, seconds: 0 };
    this.props?.knockTv(0.3);
  }

  /**
   * Hotspots that are hovered or focused light their object up as a pointer
   * would. A hover counts only while the page is still (gotcha #20: a hotspot
   * sliding under a resting pointer during a scroll is not a hover).
   */
  private litBySpots(still: boolean): Lit {
    const spots = this.spots;
    const on = (spot: StoryHotspot | undefined) =>
      !!spot && ((still && spot.hovered) || spot.focused);
    return {
      toy: on(spots?.toy),
      // The letters answer the pointer one by one (the ray finds the letter); focus walks the phrase.
      letters: !!spots?.letters.focused,
      box: on(spots?.box),
      spark: on(spots?.spark),
      tv: on(spots?.tv),
    };
  }

  /** The letter to wobble: the one under the pointer, or a slow walk along the phrase while it has focus. */
  private focusLetter(focused: boolean, dt: number) {
    if (this.hoverLetter >= 0 || !focused || !this.letters) return this.hoverLetter;
    this.letterPoke += dt * 3.2;
    const count = this.letters.toy.letters.length;
    return count > 0 ? Math.floor(this.letterPoke) % count : -1;
  }

  /**
   * The hotspots over what can be touched this frame (canvas px), each a
   * real button for the keyboard and screen readers. A focused hotspot keeps
   * its last place when its object leaves the frame, so focus never drops.
   */
  private placeHotspots(ctx: StoryContext, state: ActState) {
    const spots = this.spots;
    const camera = ctx.stage.camera;
    if (!spots) return;
    const t = state.t;
    const size = ctx.size;
    const flying = t >= at("r-dragged", 0);
    // In its window and on screen: placed. In its window but off the frame while it has focus: kept where
    // it was, so a keyboard visitor does not lose their place. Out of its window: gone.
    const keep = (spot: StoryHotspot, rect: ReturnType<typeof projectBox>, inPlay: boolean) => {
      if (!inPlay) spot.place(null);
      else if (rect || !spot.focused) spot.place(rect);
    };
    // Her: the boxes of her hit capsules.
    let toyRect = null;
    const godette = this.godette;
    const toyInPlay = !!godette?.root.visible && t < at("r-dive", 0.2);
    if (toyInPlay) {
      this.hitBox.makeEmpty();
      for (const proxy of this.proxies) this.hitBox.union(this.partBox.setFromObject(proxy));
      toyRect = projectBox(this.hitBox, camera, size);
    }
    keep(spots.toy, toyRect, toyInPlay);
    const lettersShown = !flying && t >= this.letterTiming.to;
    keep(
      spots.letters,
      lettersShown ? projectBox(this.letterBox, camera, size) : null,
      lettersShown,
    );
    let boxRect = null;
    const box = this.box;
    const boxInPlay = !!box?.root.visible && !flying;
    if (box && boxInPlay) {
      const d = box.dims;
      const half = Math.max(d.W, d.D) / 2;
      this.hitBox.min.set(-half, -d.H / 2, -half);
      this.hitBox.max.set(half, d.H / 2, half);
      this.hitBox.applyMatrix4(box.root.matrixWorld);
      boxRect = projectBox(this.hitBox, camera, size);
    }
    keep(spots.box, boxRect, boxInPlay);
    const spark = this.spark;
    const sparkInPlay = !!spark && this.sparkShown > 0.5;
    const sparkRect = spark && sparkInPlay ? projectPoint(spark.position, camera, size, 48) : null;
    keep(spots.spark, sparkRect, sparkInPlay);
    let tvRect = null;
    const tvInPlay = !!this.props && t < at("r-dive", 0.3);
    if (this.props && tvInPlay) {
      tvRect = projectBox(this.props.screenBox(this.hitBox), camera, size);
    }
    keep(spots.tv, tvRect, tvInPlay);
  }

  private placeNoSpots() {
    const spots = this.spots;
    if (!spots) return;
    for (const spot of Object.values(spots)) spot.place(null);
  }

  // ------------------------------------------------------------------ the lens

  /**
   * The toy photographer's depth of field (high and medium tiers): focus on
   * the box as it settles, rack to her, keep the phrase readable at the
   * letters' hold, shallow on her close-ups, easing off as she flies, and
   * gone before the TV wakes, so the dive and the cut to the worlds act run
   * on the stage's own path.
   */
  private lens(ctx: StoryContext, state: ActState, toy: ToyDirector) {
    const dof = this.dof;
    const t = state.t;
    if (!dof || ctx.tier === "low" || t >= at("r-tv", 0.32)) {
      dof?.release();
      return;
    }
    const camera = ctx.stage.camera;
    const forward = camera.getWorldDirection(this.tmp.v);
    const depth = (point: Vector3) =>
      Math.max(0.05, this.tmp.w.copy(point).sub(camera.position).dot(forward));
    // Focus: the box, then her (the letters and her share the long lens's plane), then her face.
    const land = state.beat("r-land");
    const box = this.box;
    const her = toy.frame.head;
    let focus = depth(her);
    if (box && t < at("r-figure", 0)) {
      const onBox = depth(box.root.position);
      focus = MathUtils.lerp(onBox, focus, smoothstep(0.35, 0.85, land));
    } else if (t < at("r-break", 0.25)) {
      this.tmp.u.copy(her).lerp(this.letterBox.getCenter(this.tmp.head), 0.5);
      const both = depth(this.tmp.u);
      const k = smoothstep(0.12, 0.25, state.beat("r-break"));
      focus = MathUtils.lerp(both, focus, k);
    }
    // Aperture by beat, then scaled by the lens: a longer lens blurs more at the same stop.
    const a =
      0.22 * (1 - smoothstep(0, 0.3, state.beat("r-figure"))) +
      0.12 *
        smoothstep(0, 0.3, state.beat("r-figure")) *
        (1 - smoothstep(0, 0.2, state.beat("r-break"))) +
      0.75 *
        smoothstep(0, 0.2, state.beat("r-break")) *
        (1 - smoothstep(0, 0.4, state.beat("r-dragged"))) +
      0.38 *
        smoothstep(0, 0.4, state.beat("r-dragged")) *
        (1 - smoothstep(0, 0.3, state.beat("r-tv")));
    const lensK = Math.tan(MathUtils.degToRad(16)) / Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const aperture = a * MathUtils.clamp(lensK, 0.5, 2.4);
    if (aperture < 0.01) {
      dof.release();
      return;
    }
    const renderer = ctx.stage.renderer;
    const w = Math.max(1, Math.round(ctx.size.width * ctx.size.dpr));
    const h = Math.max(1, Math.round(ctx.size.height * ctx.size.dpr));
    const scene = ctx.stage.rootScene;
    const background = scene.background instanceof Color ? scene.background : null;
    const lensScene = dof.render(
      renderer,
      scene,
      camera as PerspectiveCamera,
      w,
      h,
      { focus, aperture },
      ctx.stage.post.params.exposure,
      background,
    );
    ctx.stage.setScene(lensScene);
  }

  tier(ctx: StoryContext) {
    if (ctx.tier === "low") this.dof?.release();
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
    this.sparkShown = 0;
    this.trail?.setIntensity(0);
    this.placeNoSpots();
  }

  sleep() {
    // Left backward (into the card act's beats): she waits out of sight until the drop shows her again.
    const backward = this.seenT < ROOM_RANGE.start + 0.5;
    this.sleepObjects();
    const room = this.room;
    if (room) {
      room.setPhase("hidden");
      room.tvGlow(0x000000, 0);
      room.screenMaterial(null);
    }
    this.releaseGodette();
    if (backward && this.godette) this.godette.root.visible = false;
    this.letters?.reset();
    this.dof?.release();
    this.props?.reset();
    this.toyRock.reset();
    this.boxLift = 0;
    this.boxHop = -1;
    this.boxAir = 0;
    this.tvBlip = -1;
    this.tvTap = null;
    this.tvHover = 0;
    this.sparkDodge.set(0, 0, 0);
    this.power.value = 0;
    this.lastT = -1;
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
    this.tv?.dispose();
    this.sparkLight.dispose();
    this.fill.dispose();
    this.warmTarget?.dispose();
    this.dof?.dispose();
    this.dof = null;
    this.props?.reset();
    const spots = this.spots;
    if (spots) for (const spot of Object.values(spots)) spot.dispose();
    this.spots = null;
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
