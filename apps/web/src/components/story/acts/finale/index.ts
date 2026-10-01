import {
  DirectionalLight,
  HemisphereLight,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  type Object3D,
} from "three";

import {
  Latch,
  STORY_LAYERS,
  damp,
  saturate,
  type ActState,
  type StoryAct,
  type StoryContext,
  type StoryHotspot,
  type StoryPointerEvent,
  type StoryRect,
} from "@/components/story/engine/act";
import { beatOf } from "@/components/story/engine/timeline";
import { finaleSignal } from "@/components/story/finale-signal";
import { ensureGodette } from "@/components/story/props/shared";
import type { Godette, GodetteBodyLayer, GodetteFace } from "@/components/story/props/godette";
import { STORY_FINALE } from "@/data/story";
import { random, randomBetween } from "@/lib/random";

import {
  PHASE,
  WAVE_LIFE_T,
  actingTime,
  bodyYaw,
  cameraJolt,
  cameraLook,
  dizzyAmount,
  fallHeight,
  fallSpeed,
  framingAt,
  headShake,
  squash,
  storyLayers,
} from "./acting";
import { SpriteBatch, StrokeBatch } from "./batches";
import { placeCamera, sideFor, solveShot, type Shot } from "./framing";
import {
  AmbientStars,
  StarBursts,
  drawBrushPuffs,
  drawDizzy,
  drawImpact,
  drawSpeedLines,
  finaleColors,
  type FinaleColors,
} from "./fx";

/**
 * Act 4, "Your turn" (SPEC section 1, Act 4). A hard cut from the last
 * world to the plain page: Godette falls into frame, lands on her bottom,
 * sees stars, shakes them off, stands, dusts herself off, finds us and
 * waves. "Let's work together." docks under her feet as the block scrolls
 * in, and then she lives there: she follows the cursor, gets shy when
 * hovered, giggles, hops or strikes her hero pose when clicked, yawns and
 * stretches when left alone, and waves goodbye as the footer comes.
 *
 * - Her own scene, lit with a soft key, a fill and a rim, over the exact
 *   page colour (the backdrop paints it, `toneMapped: false`), so she sits
 *   on the page itself in both schemes. She is life size here (1.848 m);
 *   the camera is what makes her big or small.
 * - The story (falling, landing, standing, the start of the wave) is a pure
 *   function of the scroll position (`acting.ts`); the wave, the idle life
 *   and every reaction run on the clock.
 * - Her feet stand on the screen height where the title's letters sit at
 *   the terminal rest (`framing.ts`), measured from the DOM every frame.
 * - During `f-out` the stage layer rides on the finale block, so she leaves
 *   with the words.
 *
 * Hand-off: at `f-cut` she comes from the worlds act (`ensureGodette`); the
 * active act alone poses her and calls `update()`, so this act takes her
 * into its scene on every frame it owns and sets every one of her settings.
 */

const WAVE = beatOf("f-wave");
const OUT = beatOf("f-out");

/** Vertical field of view, degrees: a gentle lens, flattering at any aspect. */
const FOV = 30;
/** The title shows once the block is on its way in during the wave. */
const TITLE_T = WAVE.start + WAVE.vh * 0.42;
/** Two strokes a loop: she waves this long before she settles. */
const WAVE_SECONDS = 1.333 * 2 + 0.2;
/** Quick clicks in a row that make her spin until she is dizzy. */
const SPIN_CLICKS = 5;
/** How long her last pose of the terminal life takes to melt into the story's, scrolling back. */
const LIFE_FADE_SECONDS = 0.35;

type Special = { kind: "hero" | "spin"; t: number };
type Glance = { point: Vector3; until: number; face: GodetteFace | null; faceUntil: number };
type Part = "head" | "body" | "legs" | "arms" | "hands" | null;

function smooth(a: number, b: number, x: number) {
  const k = saturate((x - a) / (b - a));
  return k * k * (3 - 2 * k);
}

class FinaleAct implements StoryAct {
  readonly id = "finale" as const;
  private readonly scene = new Scene();
  private readonly key = new DirectionalLight(0xffffff, 2.4);
  private readonly rim = new DirectionalLight(0xffffff, 1.6);
  private readonly fill = new HemisphereLight(0xffffff, 0xe8e2d8, 1.2);
  private godette: Godette | null = null;
  private sprites: SpriteBatch | null = null;
  private strokes: StrokeBatch | null = null;
  private ambient = new AmbientStars(AmbientStars.countFor("high"));
  private readonly bursts = new StarBursts();
  private colors: FinaleColors | null = null;
  private scheme: "light" | "dark" | null = null;
  private hotspot: StoryHotspot | null = null;
  private ctx: StoryContext | null = null;
  private still = false;

  // camera
  private readonly shot: Shot = { distance: 8, eye: 1 };
  private yaw = 0;
  private floorY = 0.62;
  private topY = 0.1;
  /** Where she stands across the frame: centred over the words, or beside them on a short landscape screen. */
  private xFrac = 0.5;
  private splitX = 0.5;
  private titleEl: HTMLElement | null = null;
  private actionEl: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private metricsKey = "";
  private capOffset = 0;
  private measureCanvas: HTMLCanvasElement | null = null;

  // life
  private life = 0;
  private waveClock = -1;
  private byeClock = 0;
  private readonly bye = new Latch();
  private readonly ambientIn = new Latch();
  private titleOn = false;
  private special: Special | null = null;
  private lastSpecial: Special["kind"] | null = null;
  private glance: Glance | null = null;
  private nextAutoGlance = 6;
  private clicks: number[] = [];
  private lastClickAt = -10;
  private pokedAt = -10;
  private hoverPart: Part = null;
  private hoverGrace = 0;
  private pointerSeenAt = -10;
  private lastPointer = { x: 9, y: 9 };
  private interactive = false;
  /** Her last pose in the terminal life, melted into the story's when the visitor scrolls back. */
  private lastLife: { layers: GodetteBodyLayer[]; spin: number; roll: number } | null = null;
  private lifeFade = 0;
  /** The auto idle last given to her (undefined: not yet this run). */
  private autoIdle: number | null | undefined = undefined;

  // scratch
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly plane = new Plane(new Vector3(0, 0, 1), -0.35);
  private readonly look = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly head = new Vector3();
  private readonly contact = new Vector3();

  async init(ctx: StoryContext) {
    this.ctx = ctx;
    // Development only: `?storystill` renders her as a cut-out for the storybook's stills
    // (transparent backdrop, the wave held, eyes on us).
    this.still =
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).has("storystill");
    const godette = await ensureGodette(ctx);
    this.godette = godette;
    this.scene.name = "finale";
    this.key.position.set(-3.2, 5.2, 6.5);
    this.rim.position.set(3.6, 3.8, -5.2);
    this.fill.position.set(0, 4, 0);
    this.scene.add(this.key, this.key.target, this.rim, this.rim.target, this.fill);
    this.ambient = new AmbientStars(AmbientStars.countFor(ctx.tier));
    const sprites = new SpriteBatch(260);
    const strokes = new StrokeBatch(64);
    this.sprites = sprites;
    this.strokes = strokes;
    this.scene.add(sprites.mesh, strokes.mesh);
    this.applyPalette(ctx);
    sprites.warm();
    strokes.warm(new Vector3(0, -100, 0));
    await ctx.stage.compile(this.scene);
    await godette.compile(ctx.stage.renderer, ctx.stage.camera, this.scene);
    sprites.begin();
    sprites.end();
    strokes.begin();
    strokes.end();
  }

  // ------------------------------------------------------------------ palette

  private applyPalette(ctx: StoryContext) {
    const scheme = ctx.palette.scheme;
    if (scheme === this.scheme && this.colors) return;
    this.scheme = scheme;
    this.colors = finaleColors(ctx.palette);
    const light = scheme === "light";
    this.key.color.setHex(light ? 0xfff6ec : 0xffead6);
    this.key.intensity = light ? 2.5 : 2.2;
    this.rim.color.setHex(light ? 0xffffff : 0xbcd2ff);
    this.rim.intensity = light ? 1.4 : 3.2;
    this.fill.color.setHex(light ? 0xf3f5ff : 0x8ea4d4);
    this.fill.groundColor.setHex(light ? 0xe6ddd2 : 0x2a2521);
    this.fill.intensity = light ? 1.25 : 0.95;
  }

  palette(ctx: StoryContext) {
    this.applyPalette(ctx);
  }

  tier(ctx: StoryContext) {
    this.ambient = new AmbientStars(AmbientStars.countFor(ctx.tier));
  }

  // ------------------------------------------------------------------ frame

  update(ctx: StoryContext, state: ActState) {
    this.ctx = ctx;
    const godette = this.godette;
    const sprites = this.sprites;
    const strokes = this.strokes;
    if (!state.active || !godette || !sprites || !strokes) {
      if (!state.active) this.idleOut();
      return;
    }
    if (state.arrived) this.resetLife();
    this.applyPalette(ctx);
    const colors = this.colors ?? finaleColors(ctx.palette);
    const { stage } = ctx;
    stage.setScene(this.scene);
    stage.backdrop.set({ paint: this.still ? 0 : 1, reveal: 0 });
    ctx.setHeaderTone(null);

    const dt = ctx.clock.storyDt;
    this.life += dt;
    const t = state.t;
    const A = actingTime(t);

    // She is ours now: into this scene, every setting this act's.
    // Whatever the act before left on her (the table's behind layer, hidden at the end of a
    // fall, a toy scale) goes: this scene draws her on the front layer, visible, life size.
    // The stand stays where the table act keeps it (this scene never draws it).
    if (
      godette.root.parent !== this.scene ||
      godette.shadow.parent !== this.scene ||
      state.arrived
    ) {
      this.scene.add(godette.root, godette.shadow);
      godette.root.traverse((object) => object.layers.set(STORY_LAYERS.front));
      godette.shadow.layers.set(STORY_LAYERS.front);
      this.autoIdle = undefined;
    }
    godette.root.visible = true;

    // ---------------------------------------------------------------- camera
    this.measureLayout(ctx);
    // beside the words, she steps aside only as they arrive (centred until then)
    this.xFrac = 0.5 + (this.splitX - 0.5) * smooth(WAVE.start, TITLE_T + 0.12, t);
    const framing = framingAt(A);
    const life = A >= PHASE.waveInEnd || t >= WAVE_LIFE_T;
    const landscape = ctx.size.aspect >= 1;
    const height = framing.height * (landscape ? 1 : 0.9);
    solveShot(
      {
        floorY: this.floorY,
        topY: this.topY,
        height,
        halfWidth: framing.halfWidth,
        fovDeg: FOV,
        // beside the words she has her own part of the frame, not all of it
        aspect: ctx.size.aspect * Math.min(1, 2 * Math.min(this.xFrac, 1 - this.xFrac)),
      },
      this.shot,
    );
    const side = sideFor(this.shot, this.xFrac, FOV, ctx.size.aspect);
    const pointer = ctx.pointer;
    const mouse = pointer.inside && pointer.type !== "touch";
    let movedPointer = false;
    if (
      pointer.inside &&
      (pointer.ndc.x !== this.lastPointer.x || pointer.ndc.y !== this.lastPointer.y)
    ) {
      this.lastPointer = { x: pointer.ndc.x, y: pointer.ndc.y };
      this.pointerSeenAt = this.life;
      movedPointer = true;
    }
    // The view swings a little toward the cursor, about her feet (the floor stays put).
    const yawGoal = this.still
      ? 0
      : (mouse ? -pointer.ndc.x * 0.055 : 0) + Math.sin(this.life * 0.23) * 0.012;
    this.yaw = damp(this.yaw, yawGoal, 3.2, dt);
    const jolt = cameraJolt(A) * height;
    placeCamera(stage.camera, this.shot, framing.centreX, 0, this.yaw, FOV, jolt, side);
    if (stage.camera.view?.enabled) stage.camera.clearViewOffset();

    // ---------------------------------------------------------------- body
    const rootY = fallHeight(A);
    const sy = squash(A);
    const sxz = 1 / Math.sqrt(sy);
    godette.root.position.set(0, rootY, 0);
    godette.root.rotation.set(0, bodyYaw(A), 0);
    godette.root.scale.set(sxz, sy, sxz);
    godette.setContext("ground");
    godette.setNervous(A < PHASE.landEnd ? 0.35 : 0);
    godette.setBreath(1);
    godette.setBlinkRate(this.still ? 0 : 1);
    godette.setGaze(0, 0);
    const falling = A < PHASE.fallEnd;
    godette.setFlight(
      falling ? { velocity: { x: 0, y: -fallSpeed(A), z: 0 }, amount: 0.35 } : null,
    );
    const light = colors.light;
    godette.setLook({
      rim: light ? 0.14 : 0.42,
      rimColor: light ? 0xffffff : 0xcddcff,
      rimPower: light ? 3 : 2.6,
      toy: 0,
      lift: light ? 0.05 : 0.08,
      glowColor: ctx.palette.yellow,
    });
    godette.setShadow({
      y: 0,
      opacity: (light ? 0.34 : 0.62) * smooth(3.4, 0.3, rootY),
      size: 0.85,
    });

    const plan = this.planLife(ctx, state, A, godette, life);
    godette.pivot.rotation.set(0, plan.spin, plan.roll);
    godette.setBody(plan.layers);
    godette.setFace(plan.face);
    godette.lookAt(plan.lookPoint, plan.lookWeight);
    godette.setGlow(plan.glow);
    // The yawn and stretch count time alone: set (which restarts her count) only when the
    // setting changes or the visitor moves the pointer.
    if (plan.autoIdle !== this.autoIdle || (plan.autoIdle !== null && movedPointer)) {
      this.autoIdle = plan.autoIdle;
      godette.setAutoIdle(plan.autoIdle);
    }
    if (plan.hover) godette.react("hover");
    godette.update(dt);

    // ---------------------------------------------------------------- the title
    const titleOn = t >= TITLE_T;
    if (titleOn && !this.titleOn && state.direction > 0 && life) {
      // the letters rise under her feet: she glances down at them
      this.setGlance(new Vector3(0, 0.05, 1.1), 1.0, "surprised", 0.35);
    }
    this.titleOn = titleOn;
    finaleSignal.setTitle(titleOn);

    // ---------------------------------------------------------------- fx
    sprites.begin();
    strokes.begin();
    drawSpeedLines(strokes, A, rootY, colors);
    godette.socket("hips", this.contact);
    drawBrushPuffs(sprites, A, this.contact, colors);
    this.contact.y = 0;
    drawImpact(sprites, strokes, A, this.contact, stage.camera, colors);
    godette.socket("head", this.head);
    const scatter = smooth(PHASE.dizzyEnd - 0.45, PHASE.dizzyEnd + 0.35, A);
    const lifeDizzy = plan.dizzy;
    drawDizzy(
      sprites,
      strokes,
      this.head,
      Math.max(dizzyAmount(A), lifeDizzy),
      lifeDizzy > dizzyAmount(A) ? 0 : scatter,
      this.life,
      colors,
      Math.sin(this.life * 1.7) * 0.6,
    );
    const ambient = this.ambientIn.update(titleOn && life && !this.still, ctx.clock.dt, 0.7, 1.4);
    this.ambient.draw(
      sprites,
      stage.camera,
      this.shot.distance,
      ambient,
      this.life,
      dt,
      mouse ? pointer.ndc : null,
      colors,
    );
    this.bursts.draw(sprites, this.life, colors);
    sprites.end();
    strokes.end();

    // ---------------------------------------------------------------- hotspot
    this.placeHotspot(ctx, godette);
  }

  // ------------------------------------------------------------------ life

  private planLife(ctx: StoryContext, state: ActState, A: number, godette: Godette, life: boolean) {
    const dt = ctx.clock.storyDt;
    const camera = ctx.stage.camera;
    let layers: GodetteBodyLayer[] = storyLayers(A);
    let face: GodetteFace | "auto" = "auto";
    let lookPoint: Vector3 | null = this.look.copy(camera.position);
    let lookWeight = cameraLook(A);
    let glow = 0;
    let spin = 0;
    let roll = 0;
    let dizzy = 0;
    let autoIdle: number | null = null;
    let hover = false;

    // the head shake that throws the stars off
    const shake = headShake(A);
    if (shake !== 0) {
      this.tmp.set(Math.sin(shake) * 2.2, 1.55, Math.cos(shake) * 2.2);
      lookPoint = this.look.copy(this.tmp);
      lookWeight = 1;
    }

    if (!life) {
      this.waveClock = -1;
      this.interactive = false;
      this.special = null;
      this.hoverPart = null;
      // Down but not out: from the landing on, her eyes find the cursor (the clips own her head),
      // a tap on her jolts her, a tap on the page throws stars she glances at.
      const awake = A > PHASE.bottomHit + 0.3 && shake === 0;
      const pointer = ctx.pointer;
      const pointerActive = pointer.inside && this.life - this.pointerSeenAt < 3.5;
      if (awake && this.glance && this.life < this.glance.until) {
        lookPoint = this.look.copy(this.glance.point);
        lookWeight = Math.max(lookWeight, 0.35);
      } else if (awake && pointerActive && this.pointerPoint(ctx, this.tmp)) {
        lookPoint = this.look.copy(this.tmp);
        lookWeight = Math.max(lookWeight * 0.6, 0.25);
      }
      const poked = this.life - this.pokedAt;
      if (poked < 0.6) {
        const jolt = Math.sin(poked * 26) * Math.exp(-poked * 7);
        roll += jolt * 0.07;
      }
      // Scrolled back out of her life: her last pose there melts into the story's (no snap).
      const from = this.lastLife;
      if (from && this.lifeFade > 0) {
        this.lifeFade = Math.max(0, this.lifeFade - dt / LIFE_FADE_SECONDS);
        const k = smooth(0, 1, this.lifeFade);
        layers = [
          ...layers.map((layer) => ({ ...layer, weight: layer.weight * (1 - k) })),
          ...from.layers.map((layer) => ({ ...layer, weight: layer.weight * k })),
        ];
        spin = from.spin * k;
        roll += from.roll * k;
        if (this.lifeFade <= 0) this.lastLife = null;
      }
      return { layers, face, lookPoint, lookWeight, glow, spin, roll, dizzy, autoIdle, hover };
    }

    // ---- the wave (life from here), then the idle loop
    if (this.waveClock < 0) this.waveClock = 0;
    else this.waveClock += dt;
    const w = this.waveClock;
    const intoWave = smooth(0, 0.14, w);
    const intoIdle = this.still ? 0 : smooth(WAVE_SECONDS, WAVE_SECONDS + 0.55, w);
    const waveTime = this.still ? 0.42 : w;
    layers = [];
    if (intoWave < 1) layers.push({ clip: "wave_in", weight: 1 - intoWave, time: 0.6 - 1e-3 });
    if (intoIdle < 1)
      layers.push({ clip: "wave_loop", weight: intoWave * (1 - intoIdle), time: waveTime });
    if (intoIdle > 0) {
      layers.push({ clip: "idle_loop", weight: intoIdle, time: Math.max(0, w - WAVE_SECONDS) });
    }
    lookWeight = 0.85;
    this.interactive = w > 0.4 && !this.still;

    // ---- goodbye as the footer comes
    const byeOn = state.t > OUT.start + OUT.vh * 0.08 && intoIdle >= 1;
    const bye = this.bye.update(byeOn, dt, 2.4, 2);
    if (bye > 0) {
      this.byeClock = byeOn ? this.byeClock + dt : this.byeClock;
      const b = bye * bye * (3 - 2 * bye);
      layers = layers.map((layer) => ({ ...layer, weight: layer.weight * (1 - b) }));
      layers.push({ clip: "wave_loop", weight: b, time: this.byeClock });
    } else {
      this.byeClock = 0;
    }

    // ---- specials: the hero pose, the dizzy spin
    const special = this.special;
    if (special) {
      special.t += dt;
      if (special.kind === "hero") {
        const e = smooth(0, 0.4, special.t) * (1 - smooth(2.2, 2.6, special.t));
        layers = layers.map((layer) => ({ ...layer, weight: layer.weight * (1 - e) }));
        layers.push({ clip: "superhero_pose", weight: e, time: special.t });
        glow = 1.15 * smooth(0.25, 0.6, special.t) * (1 - smooth(1.9, 2.5, special.t));
        glow *= 0.85 + 0.15 * Math.sin(special.t * 21);
        if (special.t > 0.5 && special.t - dt <= 0.5) {
          this.bursts.fire(godette.socket("hand_R", this.tmp2), this.life, 1.1);
        }
        if (e > 0.5) face = "big_smile";
        if (special.t > 2.6) this.special = null;
      } else {
        const turn = smooth(0, 1.05, special.t);
        spin = turn * Math.PI * 4;
        const wob = smooth(0.9, 1.2, special.t) * (1 - smooth(2.4, 3, special.t));
        roll = Math.sin(special.t * 5.5) * 0.07 * wob;
        dizzy = smooth(0.85, 1.15, special.t) * (1 - smooth(2.5, 3.1, special.t));
        if (special.t > 0.8 && special.t < 2.7) face = "dizzy";
        if (special.t > 3.1) this.special = null;
      }
    }

    // ---- where she looks: the cursor, what was clicked, the action, or us
    const pointer = ctx.pointer;
    const pointerActive = pointer.inside && this.life - this.pointerSeenAt < 3.5 && !this.still;
    const hovered = finaleSignal.hovered;
    if (hovered === "action" && this.actionPoint(ctx, this.tmp)) {
      lookPoint = this.look.copy(this.tmp);
      lookWeight = 0.75;
      if (!this.special) face = "big_smile";
      glow = Math.max(glow, 0.32 + 0.06 * Math.sin(this.life * 6));
    } else if (this.glance && this.life < this.glance.until) {
      lookPoint = this.look.copy(this.glance.point);
      lookWeight = 0.85;
      if (this.glance.face && this.life < this.glance.faceUntil && !this.special) {
        face = this.glance.face;
      }
    } else if (pointerActive && this.pointerPoint(ctx, this.tmp)) {
      lookPoint = this.look.copy(this.tmp);
      lookWeight = 0.6;
    } else if (intoIdle >= 1 && !this.still) {
      // left alone: now and then she looks around on her own
      this.nextAutoGlance -= dt;
      if (this.nextAutoGlance <= 0) {
        this.nextAutoGlance = randomBetween(4.5, 8.5);
        const pick = random();
        if (pick < 0.3) this.setGlance(new Vector3(0, 0.1, 1.6), randomBetween(1, 1.6), null, 0);
        else if (pick < 0.6) {
          const side = random() < 0.5 ? -1 : 1;
          this.setGlance(new Vector3(side * 2.4, 2.4, -0.5), randomBetween(1.1, 1.8), null, 0);
        } else if (this.actionPoint(ctx, this.tmp)) {
          this.setGlance(this.tmp.clone(), 1.2, "smile", 1.2);
        }
      }
      lookWeight = 0.55;
    }
    if (bye > 0.5 || this.still) {
      lookPoint = this.look.copy(camera.position);
      lookWeight = 0.9;
    }
    if (this.still) face = "big_smile";

    // ---- hover: shy or curious while the pointer stays on her
    if (this.interactive && !this.special) {
      const over = this.hoverPart !== null || this.hotspot?.focused === true;
      if (over) this.hoverGrace = 0.15;
      else this.hoverGrace = Math.max(0, this.hoverGrace - dt);
      hover = this.hoverGrace > 0;
      autoIdle = 8;
    }
    // a pressed action: a happy hop on the way out
    if (finaleSignal.pressedSince() < 0.05) godette.react("click");

    this.lastLife = { layers, spin, roll };
    this.lifeFade = 1;
    return { layers, face, lookPoint, lookWeight, glow, spin, roll, dizzy, autoIdle, hover };
  }

  private setGlance(
    point: Vector3,
    seconds: number,
    face: GodetteFace | null,
    faceSeconds: number,
  ) {
    this.glance = {
      point,
      until: this.life + seconds,
      face,
      faceUntil: this.life + faceSeconds,
    };
  }

  private resetLife() {
    this.waveClock = -1;
    this.lastLife = null;
    this.lifeFade = 0;
    this.byeClock = 0;
    this.special = null;
    this.glance = null;
    this.clicks = [];
    this.bursts.clear();
    this.titleOn = false;
  }

  /** Not on screen: nothing of hers to show, the title waits, the hotspot hides. */
  private idleOut() {
    this.hotspot?.place(null);
    this.hoverPart = null;
    if (this.ctx) {
      const t = this.ctx.director.t;
      if (t < TITLE_T) finaleSignal.setTitle(false);
    }
  }

  // ------------------------------------------------------------------ input

  /** A press on her (the hotspot or a tap that hit her). */
  private clickHer(part: Part) {
    const godette = this.godette;
    if (!godette || !this.interactive) return;
    const now = this.life;
    this.clicks = this.clicks.filter((at) => now - at < 2.4);
    this.clicks.push(now);
    const quick = now - this.lastClickAt < 0.42;
    this.lastClickAt = now;
    if (this.special) return;
    if (this.clicks.length >= SPIN_CLICKS) {
      this.clicks = [];
      this.special = { kind: "spin", t: 0 };
      this.lastSpecial = "spin";
      this.bursts.fire(godette.socket("head", this.tmp2), now, 0.8);
      return;
    }
    if (quick || part === "head") {
      godette.react("poke");
      return;
    }
    if (this.lastSpecial !== "hero" && random() < 0.34) {
      this.special = { kind: "hero", t: 0 };
      this.lastSpecial = "hero";
      return;
    }
    this.lastSpecial = null;
    if (godette.react("click")) {
      this.bursts.fire(godette.socket("chest", this.tmp2), now, 0.6);
    }
  }

  /** A tap on the page around her: a burst of little stars, and she looks. */
  private clickPage(ctx: StoryContext, ndc: Readonly<{ x: number; y: number }>) {
    this.ndc.set(ndc.x, ndc.y);
    this.ray.setFromCamera(this.ndc, ctx.stage.camera);
    const point = new Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, point)) return;
    this.bursts.fire(point, this.life, 1);
    this.setGlance(point, 1.4, "surprised", 0.45);
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent) {
    const godette = this.godette;
    if (!godette || event.type !== "tap") return false;
    const part = this.partUnder(event.raycast(godette.hitProxy));
    if (this.interactive) {
      if (part) this.clickHer(part);
      else this.clickPage(ctx, event.ndc);
      return true;
    }
    // Before the wave: she is busy getting up, but she notices
    const A = actingTime(ctx.director.t);
    if (A < PHASE.bottomHit + 0.3) return false;
    if (part) {
      this.pokedAt = this.life;
      this.bursts.fire(godette.socket("head", this.tmp2), this.life, 0.7);
      godette.blink(true);
    } else {
      this.clickPage(ctx, event.ndc);
    }
    return true;
  }

  private partUnder(hits: readonly { object: Object3D }[]): Part {
    const hit = hits.at(0);
    if (!hit) return null;
    const part = (hit.object.userData as { part?: string }).part;
    if (
      part === "head" ||
      part === "body" ||
      part === "legs" ||
      part === "arms" ||
      part === "hands"
    ) {
      return part;
    }
    return "body";
  }

  /** The world point under the cursor, at her face's depth. */
  private pointerPoint(ctx: StoryContext, out: Vector3) {
    const p = ctx.pointer;
    this.ndc.set(p.ndc.x, p.ndc.y);
    this.ray.setFromCamera(this.ndc, ctx.stage.camera);
    return this.ray.ray.intersectPlane(this.plane, out) !== null;
  }

  /** The world point in front of the action button (where she looks when it is hovered). */
  private actionPoint(ctx: StoryContext, out: Vector3) {
    const el = this.actionEl;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const canvas = ctx.dom.canvasRect;
    const x = r.left + r.width / 2 - canvas.x;
    const y = r.top + r.height / 2 - canvas.y;
    this.ndc.set((x / ctx.size.width) * 2 - 1, 1 - (y / ctx.size.height) * 2);
    this.ray.setFromCamera(this.ndc, ctx.stage.camera);
    return this.ray.ray.intersectPlane(this.plane, out) !== null;
  }

  // ------------------------------------------------------------------ layout

  /**
   * Where her feet go: the top of the title's capitals at the terminal
   * rest (the finale screen at the viewport top), a hair above them, and how
   * high her head may reach (under the header).
   */
  private measureLayout(ctx: StoryContext) {
    const finale = ctx.dom.element("finale");
    if (!finale) return;
    if (!this.titleEl || !this.titleEl.isConnected) {
      this.titleEl = finale.querySelector<HTMLElement>("[data-finale-title]");
      this.actionEl = finale.querySelector<HTMLElement>("[data-finale-action]");
    }
    const title = this.titleEl;
    const height = ctx.size.height;
    if (!title || height <= 0) return;
    const finaleRect = finale.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const offset = titleRect.top - finaleRect.top;
    const style = getComputedStyle(title);
    const size = Number.parseFloat(style.fontSize) || 64;
    const key = `${style.fontFamily}|${style.fontWeight}|${size}|${style.lineHeight}`;
    if (key !== this.metricsKey) {
      this.metricsKey = key;
      this.capOffset = this.capTop(style, size);
    }
    // the site header (fixed, 64 px today), measured: her raised hand stays clear of it
    if (!this.headerEl?.isConnected) this.headerEl = document.querySelector(".site-header");
    const header = Math.min(120, this.headerEl?.offsetHeight ?? 64);
    // A short landscape screen puts the words beside her (story.css): she stands on the screen's
    // floor in the left part, the words keep the right.
    const split = titleRect.left - finaleRect.left > ctx.size.width * 0.38;
    if (split) {
      this.splitX = 0.27;
      this.floorY = 0.86;
    } else {
      const floor = offset + this.capOffset - size * 0.07;
      this.splitX = 0.5;
      this.floorY = Math.min(0.9, Math.max(0.3, floor / height));
    }
    this.topY = Math.min(this.floorY - 0.25, (header + Math.max(12, height * 0.024)) / height);
  }

  /** The cap height line's distance from the top of the title's first line box, px. */
  private capTop(style: CSSStyleDeclaration, size: number) {
    this.measureCanvas ??= document.createElement("canvas");
    const g = this.measureCanvas.getContext("2d");
    const lineHeight = Number.parseFloat(style.lineHeight) || size * 1.0;
    if (!g) return (lineHeight - size) / 2 + size * 0.2;
    g.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    const m = g.measureText("H");
    const ascent = m.fontBoundingBoxAscent || size * 0.95;
    const descent = m.fontBoundingBoxDescent || size * 0.25;
    const baseline = (lineHeight - (ascent + descent)) / 2 + ascent;
    return baseline - (m.actualBoundingBoxAscent || size * 0.7);
  }

  // ------------------------------------------------------------------ hotspot

  private placeHotspot(ctx: StoryContext, godette: Godette) {
    if (!this.interactive) {
      this.hotspot?.place(null);
      this.hoverPart = null;
      ctx.pointer.setCursor(null);
      return;
    }
    this.hotspot ??= ctx.overlay.hotspot({
      id: "finale-godette",
      label: STORY_FINALE.hello,
      onActivate: () => {
        const p = this.ctx?.pointer;
        const part = p?.inside ? this.partUnder(p.raycast(godette.hitProxy)) : null;
        this.clickHer(part ?? "body");
      },
    });
    const rect = this.projectBounds(ctx, godette);
    this.hotspot.place(rect);
    const hits = ctx.pointer.raycast(godette.hitProxy);
    this.hoverPart = this.partUnder(hits);
    ctx.pointer.setCursor(this.hoverPart ? "pointer" : null);
  }

  /** Her box on screen (canvas px), from her sockets, with a little room. */
  private projectBounds(ctx: StoryContext, godette: Godette): StoryRect | null {
    const camera = ctx.stage.camera;
    const { width, height } = ctx.size;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const sockets = ["head", "hand_L", "hand_R", "foot_L", "foot_R", "hips", "chest"] as const;
    for (const name of sockets) {
      godette.socket(name, this.tmp);
      if (name === "head") this.tmp.y += 0.22;
      this.tmp.project(camera);
      const x = (this.tmp.x * 0.5 + 0.5) * width;
      const y = (0.5 - this.tmp.y * 0.5) * height;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (!Number.isFinite(x0)) return null;
    const pad = Math.max(8, (x1 - x0) * 0.12);
    const w = Math.max(48, x1 - x0 + pad * 2);
    const cx = (x0 + x1) / 2;
    return { x: cx - w / 2, y: y0 - pad, width: w, height: y1 - y0 + pad * 1.5 };
  }

  // ------------------------------------------------------------------ lifetime

  sleep() {
    this.hotspot?.place(null);
    this.hoverPart = null;
    finaleSignal.setTitle(false);
    finaleSignal.setHover(null);
    this.resetLife();
  }

  dispose() {
    this.hotspot?.dispose();
    this.hotspot = null;
    finaleSignal.setTitle(false);
    const godette = this.godette;
    if (godette?.root.parent === this.scene) godette.root.removeFromParent();
    if (godette?.shadow.parent === this.scene) godette.shadow.removeFromParent();
    this.sprites?.dispose();
    this.strokes?.dispose();
    this.key.dispose();
    this.rim.dispose();
    this.fill.dispose();
    this.scene.clear();
    this.godette = null;
    this.ctx = null;
  }
}

export function createAct(): StoryAct {
  return new FinaleAct();
}
