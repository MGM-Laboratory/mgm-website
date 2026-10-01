import { MathUtils, Quaternion, Vector3 } from "three";

import {
  damp,
  saturate,
  smoothstep,
  type ActState,
  type StoryContext,
} from "@/components/story/engine/act";
import {
  GODETTE_CENTRE,
  GODETTE_STAND,
  GODETTE_TABLE_SCALE,
  type Godette,
  type GodetteBodyLayer,
} from "@/components/story/props/godette";
import type { StoryRoom } from "@/components/story/props/room";

import { createFlightPose, FlightPlan, type FlightPose } from "./flight";
import { at, beatClock, bump } from "./script";

/**
 * Godette's direction through the table act: where she stands or flies,
 * which baked clips play at which times, her face, her eyes, her nerves,
 * her glow. Every scrubbed value is a pure function of the story position;
 * her own runtime adds the clock life (blinks, darts, breath, tremble, hair).
 */

/** Her turn on the stand: three quarters to the landing shot and the close-up. */
export const TOY_YAW = MathUtils.degToRad(76);
const UP = new Vector3(0, 1, 0);

/**
 * r-break's acting, in beat progress. The camera lands on her close-up
 * first (`landed`); only then do her eyes lock on the lens (`lock` to
 * `glance`), dart left and right (`glance` to `clip`), and the baked break
 * plays (`clip` to `clipEnd`), so the toy realises it is watched on a
 * still frame.
 */
export const BREAK = {
  landed: 0.14,
  lock: 0.16,
  glance: 0.24,
  clip: 0.32,
  clipEnd: 0.97,
} as const;

/** `af_break` time at r-break progress `p`: it starts once her eyes have found the camera and darted. */
export function breakClipTime(p: number) {
  return 5.2 * saturate((p - BREAK.clip) / (BREAK.clipEnd - BREAK.clip));
}

/** `look_around` time: it starts as the break ends and runs into r-spark. */
function lookClipTime(t: number) {
  const from = at("r-break", 0.94);
  const to = at("r-spark", 0.3);
  return 2.3 * saturate((t - from) / (to - from));
}

/** Her head's look at the lens on the stand (and at the first frame of r-break, so the rest never pops). */
const STAND_LOOK = 0.14;
/** Her nerves while she holds the pose. */
const STAND_NERVES = 0.82;

/** `confused_reach` time at r-spark progress `p`. */
export function reachClipTime(p: number) {
  return 3.8 * saturate((p - 0.24) / 0.76);
}

export type ToyFrame = {
  /** The flight clock (beat seconds from the start of r-dragged), or -1 before it. */
  tau: number;
  flight: FlightPose;
  /** Where the spark is drawn to (her wrist or the plan), when it rides with her. */
  wrist: Vector3;
  chest: Vector3;
  head: Vector3;
  /** She is past the screen plane: nothing of her shows. */
  inside: boolean;
};

export class ToyDirector {
  plan: FlightPlan | null = null;
  readonly frame: ToyFrame = {
    tau: -1,
    flight: createFlightPose(),
    wrist: new Vector3(),
    chest: new Vector3(),
    head: new Vector3(),
    inside: false,
  };
  /** Where she stands once she has hopped off the stand. */
  readonly ground = new Vector3();
  private readonly q = new Quaternion();
  private readonly tvCentre: Vector3;
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly rockTip = new Vector3();
  private readonly rockPivot = new Vector3();
  private readonly rockQ = new Quaternion();
  /**
   * The pointer's answers, all clock life on top of the scripted acting. On
   * the table and while she hangs they never start a body clip (her
   * runtime's reactions run on its own clock and would outlive the beat):
   * a hover is a brief shy face, a blink and a glance at the cursor; a click
   * is a laugh and a little hop. Only the frozen toy and her free flight use
   * her runtime's own reactions, which move nothing but her face and sway.
   */
  private where: "stand" | "frozen" | "ground" | "hang" | "free" = "stand";
  private hoverIn = 0;
  private wasHovered = false;
  private shyUntil = 0;
  private hopAt = -1;
  /** The point under the cursor near her head (set by the act while the pointer is on her), or null. */
  readonly cursor = new Vector3();
  cursorOn = false;

  constructor(
    private readonly godette: Godette,
    private readonly room: StoryRoom,
  ) {
    this.tvCentre = new Vector3(...room.anchors.tv.centre);
  }

  /** The stand and her spot on it. */
  standTop() {
    const [x, , z] = this.room.anchors.figureSpot.position;
    return this.v.set(x, this.room.anchors.table.topY + GODETTE_STAND.height, z);
  }

  /** Measures the poses the flight starts from, then lays out the flight. Call once, after loading. */
  prepare(times: { drag: number; learn: number; tv: number; dive: number }) {
    const g = this.godette;
    const top = this.standTop().clone();
    this.placeOnStand();
    // The hop off the stand's end offset, where she stands for the spark.
    const motion = g.rootMotion("af_break", 5.2, this.w);
    motion.applyAxisAngle(UP, TOY_YAW).multiplyScalar(GODETTE_TABLE_SCALE);
    this.ground.copy(top).add(motion);
    g.root.position.copy(this.ground);
    g.setBody([{ clip: "confused_reach", weight: 1, time: 3.8 }]);
    g.update(0);
    g.root.updateMatrixWorld(true);
    const hand = g.socket("hand_L", new Vector3());
    // The dangling pose's hand to centre axis, in her root frame.
    g.setBody([{ clip: "dragged_dangle", weight: 1, time: 0.5 }]);
    g.update(0);
    g.root.updateMatrixWorld(true);
    const dangleHand = g.socket("hand_L", new Vector3());
    const centre = g.pivot.getWorldPosition(new Vector3());
    const axis = centre.clone().sub(dangleHand);
    const length = axis.length();
    this.q.copy(g.root.quaternion).invert();
    axis.applyQuaternion(this.q).normalize();
    const tv = this.room.anchors.tv;
    this.plan = new FlightPlan({
      hand,
      yaw: TOY_YAW,
      hangAxis: axis,
      hangLength: length,
      screen: new Vector3(...tv.centre),
      screenNormal: new Vector3(...tv.normal).normalize(),
      times,
    });
  }

  placeOnStand() {
    const g = this.godette;
    const top = this.standTop();
    g.stand.position.copy(top);
    g.stand.rotation.set(0, TOY_YAW, 0);
    g.scale = GODETTE_TABLE_SCALE;
    g.root.position.copy(top);
    g.root.quaternion.setFromAxisAngle(UP, TOY_YAW);
    g.pivot.rotation.set(0, 0, 0);
  }

  /** The look every frame she is ours (the worlds act may have changed it). */
  private baseLook(toy: number) {
    this.godette.setLook({
      toy,
      rim: 0.16,
      rimColor: 0xffd9b0,
      lift: 0.035,
      envMapIntensity: 0.6,
    });
  }

  /**
   * Rocks her and the stand together on the stand's rim (a toy knocked on its
   * round base), by `angle` about the horizontal `axis`. Call after placing her.
   */
  private rock(angle: number, axis: Vector3) {
    if (angle === 0) return;
    const g = this.godette;
    const [x, , z] = this.room.anchors.figureSpot.position;
    const tip = this.rockTip.crossVectors(axis, UP).normalize();
    tip.multiplyScalar(Math.sign(angle) * GODETTE_STAND.radius);
    const pivot = this.rockPivot.set(x, this.room.anchors.table.topY, z).add(tip);
    this.rockQ.setFromAxisAngle(axis, angle);
    for (const object of [g.root, g.stand]) {
      object.position.sub(pivot).applyQuaternion(this.rockQ).add(pivot);
      object.quaternion.premultiply(this.rockQ);
    }
  }

  /** r-land and r-figure (and the card act's drop): the forced pose, nerves and all. */
  onStand(
    ctx: StoryContext,
    nervous: number,
    hovered: boolean,
    rock: Readonly<{ angle: number; axis: Vector3 }> | null = null,
  ) {
    const g = this.godette;
    this.placeOnStand();
    if (rock) this.rock(rock.angle, rock.axis);
    this.frame.tau = -1;
    this.frame.inside = false;
    this.where = "stand";
    g.setContext("toy");
    g.setBody([{ clip: "af_pose", weight: 1 }]);
    g.setFace("auto");
    g.setNervous(Math.min(1, (hovered ? 1 : STAND_NERVES) * nervous));
    g.setBreath(1);
    g.setFlight(null);
    g.setGlow(0);
    this.baseLook(1);
    g.setBlinkRate(hovered ? 1.6 : 1);
    g.setAutoIdle(null);
    g.lookAt(ctx.stage.camera.position, STAND_LOOK);
    g.setGaze(0, 0);
    g.setShadow({ y: this.standTop().y, opacity: 0.45, size: 0.55 });
    // A frozen toy only flinches inside the pose (her runtime's toy reaction moves no bone of a clip).
    if (hovered) g.react("hover");
    this.hoverIn = 0;
    this.wasHovered = hovered;
    g.update(ctx.clock.storyDt);
    this.sockets();
  }

  /**
   * A click on her: the frozen toy flinches; on the table she laughs and
   * hops (clock life only); hanging from the spark she blinks; in free
   * flight she spins. Returns true when she answered.
   */
  tap(time: number) {
    const g = this.godette;
    switch (this.where) {
      case "stand":
      case "frozen":
        return g.react("click");
      case "ground":
        if (this.hopAt < 0 || time - this.hopAt > 0.5) this.hopAt = time;
        g.blink(true);
        return true;
      case "hang":
        g.blink(true);
        return true;
      case "free": {
        // A whole spin is one second: not when she is about to reach the screen.
        const plan = this.plan;
        if (plan && this.frame.tau > plan.times.enter - 1) {
          g.blink(true);
          return true;
        }
        return g.react("click");
      }
    }
  }

  /**
   * The table's hover and click answers (see `where`): a shy face for a
   * moment and a low weight look at the cursor while it stays, a laugh and a
   * hop after a click. `look` is the scripted look (point and weight).
   */
  private tableLife(
    time: number,
    dt: number,
    hovered: boolean,
    look: Readonly<{ point: Vector3; weight: number }>,
  ) {
    const g = this.godette;
    if (hovered && !this.wasHovered) {
      this.shyUntil = time + 1.1;
      g.blink(false);
    }
    this.wasHovered = hovered;
    this.hoverIn = damp(this.hoverIn, hovered && this.cursorOn ? 1 : 0, 6, dt);
    const hop = this.hopAt >= 0 ? time - this.hopAt : -1;
    if (hop > 0.9) this.hopAt = -1;
    if (hop >= 0 && hop < 0.8) g.setFace("laugh", 0.9);
    else if (hovered && time < this.shyUntil) g.setFace("shy", 0.85);
    // Her eyes and head drift a little toward the cursor while it stays on her.
    const k = this.hoverIn * 0.55;
    if (k > 0.001) {
      this.v.copy(look.point).lerp(this.cursor, k);
      g.lookAt(this.v, MathUtils.lerp(look.weight, 0.28, k));
    } else {
      g.lookAt(look.point, look.weight);
    }
    return hop;
  }

  /** The click's hop on the table, applied after her update: up and down in 0.34 s, a squash on each end. */
  private tableHop(hop: number) {
    if (hop < 0 || hop > 0.62) return;
    const g = this.godette;
    const air = hop < 0.34 ? Math.sin((hop / 0.34) * Math.PI) : 0;
    const land = hop >= 0.34 ? Math.sin(saturate((hop - 0.34) / 0.28) * Math.PI) : 0;
    const takeOff = hop < 0.05 ? Math.sin((hop / 0.05) * Math.PI) : 0;
    const squash = 1 + 0.05 * air - 0.07 * land - 0.04 * takeOff;
    const s = GODETTE_TABLE_SCALE;
    g.root.position.y += air * 0.007;
    g.root.scale.set(s / Math.sqrt(squash), s * squash, s / Math.sqrt(squash));
    g.root.updateMatrixWorld(true);
  }

  /**
   * r-break: her eyes find the camera and dart left and right, then the
   * baked break (`af_break`): the arm drops, the stiff shoulder rolls, a
   * stretch, a hop off the stand. Then she looks around the room.
   * r-spark: she looks around, the spark finds her, `confused_reach`.
   */
  onTable(
    ctx: StoryContext,
    state: ActState,
    spark: Vector3 | null,
    hovered: boolean,
    rock: Readonly<{ angle: number; axis: Vector3 }> | null = null,
  ) {
    const g = this.godette;
    const t = state.t;
    const p = state.beat("r-break");
    const clip = breakClipTime(p);
    this.placeOnStand();
    // A knock from the last beat still rocking her fades before she moves.
    if (rock) this.rock(rock.angle * (1 - smoothstep(BREAK.glance, BREAK.clip, p)), rock.axis);
    const motion = g.rootMotion("af_break", clip, this.w);
    motion.applyAxisAngle(UP, TOY_YAW).multiplyScalar(GODETTE_TABLE_SCALE);
    g.root.position.add(motion);
    this.frame.tau = -1;
    this.frame.inside = false;
    const alive = smoothstep(0.9, 3.4, clip);
    const frozen = clip < 1.9;
    this.where = frozen ? "frozen" : "ground";
    g.setContext(frozen ? "toy" : "ground");
    const sparkP = state.beat("r-spark");
    const reach = reachClipTime(sparkP);
    const looking = smoothstep(0.93, 0.99, p);
    const reaching = smoothstep(0.22, 0.32, sparkP);
    const layers: GodetteBodyLayer[] = [
      { clip: "af_break", weight: 1 - looking, time: clip },
      { clip: "look_around", weight: looking * (1 - reaching), time: lookClipTime(t) },
      { clip: "confused_reach", weight: reaching, time: reach },
    ];
    g.setBody(layers);
    g.setFace("auto");
    // From the stand's nerves at the rest (no pop on the most viewed frame) down to nearly calm.
    g.setNervous(STAND_NERVES - 0.74 * smoothstep(0.3, 2.6, clip));
    g.setBreath(1);
    g.setFlight(null);
    g.setGlow(0);
    this.baseLook(1 - alive);
    g.setBlinkRate(hovered && frozen ? 1.6 : 1);
    g.setAutoIdle(null);
    // The eyes, once the close-up has landed: they lock on the lens (the head turns a hair to us), dart
    // left and right, then the clip's own head with a soft look at us, then the spark.
    const lock = smoothstep(BREAK.landed, BREAK.glance, p);
    const darting = saturate((p - BREAK.glance) / (BREAK.clip - BREAK.glance));
    const glance = darting > 0 && darting < 1 ? Math.sin(darting * Math.PI * 2) * 0.3 : 0;
    g.setGaze(glance, 0);
    // The toy's painted smile gives way: her eyes open wide on the lens, stay wide while they dart, and
    // the break's own nervous face takes over as the clip starts.
    const wide = bump(p, BREAK.landed, BREAK.lock + 0.02, BREAK.clip - 0.01, BREAK.clip + 0.05);
    if (wide > 0.02) g.setFace("surprised", 0.92 * wide);
    let lookPoint = ctx.stage.camera.position;
    let lookWeight = MathUtils.lerp(STAND_LOOK, 0.32, lock) - 0.14 * smoothstep(BREAK.clip, 0.5, p);
    if (spark && sparkP > 0.12 && sparkP < 0.99) {
      lookPoint = spark;
      lookWeight = MathUtils.lerp(0.25, 0.6, smoothstep(0.15, 0.35, sparkP));
    }
    const topY = this.room.anchors.table.topY;
    const onStand = g.root.position.y - topY > GODETTE_STAND.height * 0.5;
    g.setShadow({ y: onStand ? topY + GODETTE_STAND.height : topY, opacity: 0.45, size: 0.55 });
    let hop = -1;
    if (frozen) {
      // Still a toy: the pointer only makes her flinch inside the pose.
      g.lookAt(lookPoint, lookWeight);
      if (hovered) g.react("hover");
      this.wasHovered = hovered;
    } else {
      hop = this.tableLife(ctx.clock.time, ctx.clock.storyDt, hovered, {
        point: lookPoint,
        weight: lookWeight,
      });
    }
    g.update(ctx.clock.storyDt);
    this.tableHop(hop);
    this.sockets();
  }

  /** r-dragged to r-dive: the hang, the tow, the learning, the loop, the proud hover, the dive. */
  inFlight(ctx: StoryContext, state: ActState, hovered: boolean, glowScale = 1) {
    const g = this.godette;
    const plan = this.plan;
    if (!plan) return;
    const tau = beatClock(state.t, "r-dragged", "r-dive");
    this.frame.tau = tau;
    const fp = plan.pose(tau, this.frame.flight);
    const times = plan.times;
    g.scale = GODETTE_TABLE_SCALE;
    // Orientation: the whole of it on the root while she hangs, yaw plus pivot in free flight.
    if (fp.hang > 0.001) {
      // Out of the standing reach into the hang as the yank lifts her.
      const lift = smoothstep(0.08, 0.55, tau);
      this.q.setFromAxisAngle(UP, TOY_YAW);
      g.root.quaternion.copy(this.q).slerp(fp.quaternion, lift);
      g.pivot.rotation.set(0, 0, 0);
    } else {
      g.root.quaternion.setFromAxisAngle(UP, fp.heading);
      g.pivot.rotation.copy(fp.pivot);
    }
    // Place by the centre first; the hang then pins her wrist to the spark.
    this.v.set(0, GODETTE_CENTRE * GODETTE_TABLE_SCALE, 0).applyQuaternion(g.root.quaternion);
    g.root.position.copy(fp.centre).sub(this.v);
    g.setContext("flight");
    g.setBody(this.flightLayers(tau, plan));
    g.setFace(tau > times.loopStart && tau < times.loopEnd + 0.2 ? "big_smile" : "auto");
    g.setNervous(0.5 * (1 - fp.learned) * smoothstep(0.6, 1.2, tau));
    g.setBreath(1);
    g.setFlight({
      velocity: plan
        .centre(tau + 0.05, this.w)
        .sub(plan.centre(tau - 0.05, this.v))
        .multiplyScalar(10),
      bank: fp.hang > 0.5 ? 0 : fp.bank,
      amount: MathUtils.lerp(0.35, 1, fp.learned),
    });
    const glow = smoothstep(times.release + 0.1, times.releaseEnd, tau);
    g.setGlow(0.78 * glow * glowScale);
    this.baseLook(0);
    g.setLook({ glowColor: 0xf7bf33, lift: 0.035 + 0.05 * glow });
    g.setBlinkRate(1);
    g.setAutoIdle(null);
    g.setGaze(0, 0);
    // Eyes: up at the spark while it drags her, ahead while she learns, at us when she is proud, the TV after.
    if (tau < times.hangEnd) {
      plan.spark(tau, this.w);
      g.lookAt(this.w, 0.35);
    } else if (tau > times.loopEnd && tau < times.turn) {
      g.lookAt(ctx.stage.camera.position, 0.7);
    } else if (tau >= times.turn) {
      g.lookAt(this.tvCentre, 0.6);
    } else {
      g.lookAt(null);
    }
    g.setShadow({
      y: this.room.anchors.table.topY,
      opacity: 0.4 * (1 - smoothstep(0.3, 1.2, tau)),
      size: 0.6,
    });
    // While she hangs from the spark her face is the scripted "oh no" and her wrist is pinned: no reaction.
    this.where = fp.hang > 0.001 ? "hang" : "free";
    if (hovered && this.where === "free" && tau < times.enter - 0.4) g.react("hover");
    this.hopAt = -1;
    g.update(ctx.clock.storyDt);
    // The pin: her wrist on the spark while she hangs.
    if (fp.hang > 0.001) {
      g.root.updateMatrixWorld(true);
      const wrist = g.socket("hand_L", this.w);
      const target = plan.spark(Math.min(tau, times.hangEnd), this.v);
      g.root.position.addScaledVector(target.sub(wrist), fp.hang);
    }
    g.root.updateMatrixWorld(true);
    this.frame.inside = tau > times.enter + 0.06;
    g.root.visible = !this.frame.inside;
    this.sockets();
  }

  /** Which clips play in flight, by the flight clock. */
  private flightLayers(tau: number, plan: FlightPlan): GodetteBodyLayer[] {
    const t = plan.times;
    const learned = plan.learned(tau);
    const yank = 1 - smoothstep(0.55, 0.75, tau);
    const dangle = (1 - yank) * (1 - smoothstep(t.hangEnd - 0.25, t.hangEnd + 0.25, tau));
    const freeShare = 1 - yank - dangle;
    // Learning: the struggle, the balance, the glide (weights, not cuts).
    const struggle = (1 - learned) * (1 - learned);
    const balance = 2 * learned * (1 - learned);
    const glide = learned * learned;
    // The proud hover (superhero_pose, a rhyme with the toy pose), then the prone superhero dive.
    const proud =
      smoothstep(t.loopEnd, t.proud, tau) * (1 - smoothstep(t.turnEnd - 0.2, t.turnEnd + 0.3, tau));
    const dive = smoothstep(t.turnEnd - 0.2, t.turnEnd + 0.3, tau);
    const flying = 1 - proud - dive;
    return [
      { clip: "dragged_yank", weight: yank, time: Math.min(0.9, tau * 1.25) },
      { clip: "dragged_dangle", weight: dangle, time: Math.max(0, tau - 0.55) },
      { clip: "struggle_fly", weight: freeShare * struggle * flying, time: tau * 1.1 },
      { clip: "balance_glide", weight: freeShare * balance * flying, time: tau },
      { clip: "fly_glide", weight: freeShare * glide * flying, time: tau },
      { clip: "superhero_pose", weight: freeShare * proud, time: Math.max(0, tau - t.loopEnd) },
      { clip: "fly_superhero", weight: freeShare * dive, time: Math.max(0, tau - t.turnEnd) },
    ];
  }

  /** Her wrist, chest and head this frame (after the update). */
  private sockets() {
    const g = this.godette;
    g.socket("hand_L", this.frame.wrist);
    g.socket("chest", this.frame.chest);
    g.socket("head", this.frame.head);
  }
}
