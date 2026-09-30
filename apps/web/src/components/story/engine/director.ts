import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import type { StoryTier } from "@/components/story/assets/types";
import {
  damp,
  mix,
  saturate,
  type ActState,
  type BeatId,
  type DirectorReadout,
  type StoryAct,
  type StoryActId,
  type StoryAssets,
  type StoryBeatId,
  type StoryContext,
  type StoryDom,
  type StoryPalette,
  type StoryPointerEvent,
  type StoryProps,
  type StoryRect,
} from "@/components/story/engine/act";
import { StoryDomImpl, measure } from "@/components/story/engine/dom-glue";
import { StoryFlowYield } from "@/components/story/engine/flow-yield";
import { StoryHeaderTone } from "@/components/story/engine/header-tone";
import type { OverlaySkip, StoryOverlayStore } from "@/components/story/engine/overlay-store";
import { readStoryPalette, samePalette } from "@/components/story/engine/palette";
import { StoryPointerImpl } from "@/components/story/engine/pointer";
import { HopelessWatch, createStoryGovernor, levelOf } from "@/components/story/engine/quality";
import { ScrollIntent } from "@/components/story/engine/scroll-intent";
import type { StoryStage } from "@/components/story/engine/stage";
import {
  ACT_ORDER,
  ENTRANCE_VH,
  TIMELINE,
  actAt,
  actOf,
  beatAt,
  beatOf,
  beatProgress,
  nextRest,
  speedAt,
} from "@/components/story/engine/timeline";
import { isReelPlayerOpen } from "@/lib/reel-player";
import { isScrollLocked } from "@/lib/scroll-lock";
import { acquireThemeLock, releaseThemeLock } from "@/lib/theme-lock";

/**
 * The director turns the page's scroll position into the story's state and
 * runs every frame (docs/homepage-story.md, "The director").
 *
 * - Position: `t = -sectionTop / storyVh`, read once a frame from the
 *   section's rect on `gsap.ticker`, after ScrollSmoother has moved the page
 *   (GSAP renders its root timeline, where the smoother lives, before any
 *   ticker listener). What is on screen, not the scroll target.
 * - Acts: each act has a window (its beats plus its neighbours' edge beats).
 *   Near acts update; the act owning `t` is active and alone sets the camera.
 * - Auto-advance (SPEC 1.1, 2.3): armed only by real input
 *   (`scroll-intent.ts`). Once the input stops and the smoother's glide has
 *   settled (within 2 px, or 120 ms without native scroll events on touch),
 *   it waits 0.35 s and then carries the page to the next rest in the last
 *   input direction, ramping to the beat's speed over 0.8 s and landing
 *   softly exactly on the rest. It moves the rendered position itself
 *   (`smoother.scrollTo(y, false)`, or `window.scrollTo` on native scroll),
 *   so a press stops it dead. Any input cancels it; a held pointer or
 *   finger freezes it; the scroll lock, the reel player and reduced motion
 *   stand it down.
 * - Freeze: holding a pointer or finger down eases `freeze` to 1; acts run
 *   their clocks at `mix(1, 0.3, freeze)`.
 * - Integrations: the theme lock from `c-rise` to the end of `f-wave`, the
 *   cursor flow's yield while the section covers the top of the viewport,
 *   the header's tone, the overlay's hint, HUD and skip control.
 */

export type StoryFallbackReason = "context-lost" | "slow" | "failed";

export type DirectorHooks = {
  onFallback(reason: StoryFallbackReason): void;
};

const THEME_OWNER = "homepage-story";
const THEME_REASON = "The story is playing.";
const SETTLE_SECONDS = 0.35;
const RAMP_SECONDS = 0.8;
const REST_TOLERANCE = 0.01;
/** Visible fraction of the viewport around the section where the stage keeps drawing. */
const NEAR_MARGIN = 0.5;

class ActStateImpl implements ActState {
  t = -ENTRANCE_VH;
  progress = 0;
  current: StoryBeatId | null = null;
  local = 0;
  entrance = 0;
  direction: 1 | -1 = 1;
  velocity = 0;
  freeze = 0;
  active = false;
  near = false;
  arrived = false;
  readonly range;
  readonly beats: Readonly<Record<BeatId, number>>;
  readonly window: readonly [number, number];

  constructor(readonly act: StoryActId) {
    this.range = actOf(act);
    const index = ACT_ORDER.indexOf(act);
    const previous = index > 0 ? actOf(ACT_ORDER.at(index - 1) ?? act) : null;
    const next = index < ACT_ORDER.length - 1 ? actOf(ACT_ORDER.at(index + 1) ?? act) : null;
    const lo = previous ? this.range.start - previous.last.vh : -ENTRANCE_VH - NEAR_MARGIN;
    const hi = next ? this.range.end + next.first.vh : this.range.end + NEAR_MARGIN;
    this.window = [lo, hi];
    const record = {};
    for (const beat of TIMELINE.beats) {
      Object.defineProperty(record, beat.id, {
        enumerable: true,
        get: () => beatProgress(beat, this.t),
      });
    }
    this.beats = record as Readonly<Record<BeatId, number>>;
  }

  beat(id: BeatId) {
    return beatProgress(beatOf(id), this.t);
  }

  span(from: BeatId, to: BeatId) {
    const a = beatOf(from).start;
    const b = beatOf(to).end;
    return b > a ? saturate((this.t - a) / (b - a)) : this.t >= b ? 1 : 0;
  }

  /** Recomputes everything from `t`. */
  set(t: number, active: StoryActId, direction: 1 | -1, velocity: number, freeze: number) {
    this.t = t;
    const range = this.range;
    this.progress =
      range.end > range.start ? saturate((t - range.start) / (range.end - range.start)) : 0;
    this.direction = direction;
    this.velocity = velocity;
    this.freeze = freeze;
    this.active = active === this.act;
    const near = this.active || (t >= this.window[0] && t <= this.window[1]);
    this.arrived = near && !this.near;
    this.near = near;
    this.entrance = this.act === "cards" ? saturate(t + ENTRANCE_VH) : 0;
    const beat = beatAt(t);
    if (this.act === "cards" && t < 0) {
      this.current = "c-enter";
      this.local = saturate(t + ENTRANCE_VH);
    } else if (beat && beat.act === this.act && t < range.end) {
      this.current = beat.id;
      this.local = beatProgress(beat, t);
    } else {
      this.current = null;
      this.local = 0;
    }
  }
}

/** Whether ScrollSmoother moves the page with a transform (desktop) rather than native scroll (touch). */
function detectSmoothed() {
  const wrapper = document.getElementById("smooth-wrapper");
  return (
    ScrollSmoother.get() !== undefined &&
    wrapper !== null &&
    getComputedStyle(wrapper).position === "fixed"
  );
}

/** A stable story viewport height: phones' URL bar showing and hiding never rescales 61 screens. */
function nextStoryVh(previous: number, width: number, previousWidth: number, height: number) {
  if (previous <= 0) return height;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse && width === previousWidth && Math.abs(height - previous) / previous < 0.25) {
    return previous;
  }
  return height;
}

let idleDom: StoryDom | null = null;

/** What `ctx.dom` reads before the section is attached (the warm-up): no anchors. */
function detachedDom(): StoryDom {
  idleDom ??= {
    section: document.body,
    element: () => null,
    rect: () => null,
    canvasRect: { x: 0, y: 0, width: 1, height: 1 },
  };
  return idleDom;
}

export class StoryDirector {
  readonly ctx: StoryContext;
  t = -ENTRANCE_VH - 1;
  velocity = 0;
  freeze = 0;
  autoAdvancing = false;
  idle = 0;
  private palette: StoryPalette;
  private paletteDirty = false;
  private readonly clock = { time: 0, dt: 0, storyDt: 0 };
  private readonly states = new Map<StoryActId, ActStateImpl>();
  private readonly intent = new ScrollIntent();
  private readonly pointer: StoryPointerImpl;
  private readonly tone = new StoryHeaderTone();
  private readonly flow = new StoryFlowYield();
  private dom: StoryDomImpl | null = null;
  private section: HTMLElement | null = null;
  private vh = 0;
  private vw = 0;
  private smoothed = false;
  private awake = false;
  private attached = false;
  private themeHeld = false;
  private ramp = 0;
  private settledFor = 0;
  private lastRenderAt = 0;
  private fpsFrames = 0;
  private fpsSince = 0;
  private fps = 0;
  private failed = false;
  private jumpOnStart: { beat: BeatId; p: number } | null = null;
  private debugEvery = 0;
  private readonly offs: Array<() => void> = [];
  private readonly governor;
  private readonly hopeless: HopelessWatch;

  constructor(
    private readonly stage: StoryStage,
    private readonly acts: readonly StoryAct[],
    assets: StoryAssets,
    props: StoryProps,
    private readonly overlay: StoryOverlayStore,
    private readonly hooks: DirectorHooks,
  ) {
    for (const act of ACT_ORDER) this.states.set(act, new ActStateImpl(act));
    this.palette = readStoryPalette();
    stage.setPage(this.palette.page);
    this.pointer = new StoryPointerImpl(
      stage.camera,
      () => stage.canvasRect,
      (event) => {
        this.onPointer(event);
      },
    );
    const ctx = {
      stage,
      assets,
      props,
      pointer: this.pointer,
      overlay,
      setHeaderTone: (tone: "light" | "dark" | null) => {
        this.tone.set(tone);
      },
    };
    Object.defineProperties(ctx, {
      size: { get: () => stage.size, enumerable: true },
      tier: { get: (): StoryTier => stage.level.tier, enumerable: true },
      palette: { get: () => this.palette, enumerable: true },
      clock: { get: () => this.clock, enumerable: true },
      director: { get: () => this.readout, enumerable: true },
      dom: { get: () => this.dom ?? detachedDom(), enumerable: true },
    });
    this.ctx = ctx as unknown as StoryContext;
    this.governor = createStoryGovernor(stage.level.tier, (level) => {
      const before = stage.level.tier;
      stage.setLevel(level);
      if (level.tier !== before)
        this.forEachAct((act) => {
          act.tier?.(this.ctx);
        });
    });
    this.hopeless = new HopelessWatch(() => {
      this.fail("slow");
    });
    overlay.onSkip = (mode) => {
      if (mode === "skip") this.scrollToT(TIMELINE.finaleStart, 1);
      else this.scrollToT(0, 1);
    };
  }

  get readout(): DirectorReadout {
    return {
      t: this.t,
      direction: this.intent.direction,
      velocity: this.velocity,
      freeze: this.freeze,
      held: this.intent.held || this.pointer.down,
      autoAdvancing: this.autoAdvancing,
      idle: this.idle,
    };
  }

  /** The story section is on the page: measure, listen, and draw from the next tick. */
  attach(section: HTMLElement, host: HTMLElement) {
    if (this.attached) this.detach();
    this.attached = true;
    this.section = section;
    this.dom = new StoryDomImpl(section);
    this.stage.attach(host);
    this.intent.attach();
    this.pointer.attach(section);
    this.tone.attach();
    this.vh = 0;
    this.measureViewport(false);
    const onResize = () => {
      this.measureViewport(true);
    };
    window.addEventListener("resize", onResize);
    const observer = new MutationObserver(() => {
      this.paletteDirty = true;
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const onRefresh = () => {
      this.restore();
    };
    ScrollTrigger.addEventListener("refresh", onRefresh);
    this.offs.push(
      () => {
        window.removeEventListener("resize", onResize);
      },
      () => {
        observer.disconnect();
      },
      () => {
        ScrollTrigger.removeEventListener("refresh", onRefresh);
      },
    );
    this.setupDev();
    gsap.ticker.add(this.tick);
  }

  /** The section left the page (a route change): let go of everything, keep what is built. */
  detach() {
    if (!this.attached) return;
    this.attached = false;
    gsap.ticker.remove(this.tick);
    for (const off of this.offs.splice(0)) off();
    this.sleep();
    this.intent.detach();
    this.pointer.detach();
    this.tone.detach();
    this.stage.park();
    this.section = null;
    this.dom = null;
    if (process.env.NODE_ENV !== "production") {
      Reflect.deleteProperty(window, "__story");
    }
  }

  /** Scrolls to beat `beat` at progress `p` (dev tools and specs). */
  jump(beat: BeatId, p: number) {
    const laid = beatOf(beat);
    this.scrollToT(laid.start + saturate(p) * laid.vh);
  }

  /**
   * Renders one frame of position `t` without the page (the loading screen's
   * warm-up: every program compiles, and the frame is timed). The DOM rects
   * read as absent.
   */
  renderAt(t: number) {
    this.stage.beginFrame();
    this.overlay.beginFrame(0, 0);
    this.tone.beginFrame();
    this.updateActs(t, 1, 0, 0, 1 / 60);
    this.stage.render(this.clock.time);
  }

  /** After the warm-up: every act asleep, so the first real frame is a fresh arrival. */
  resetStates() {
    for (const act of this.acts) {
      const state = this.states.get(act.id);
      if (!state?.near) continue;
      state.near = false;
      this.safely(() => {
        act.sleep?.(this.ctx);
      });
    }
    this.overlay.clear();
    this.clock.time = 0;
  }

  // ------------------------------------------------------------------ frame

  private readonly tick = (_time: number, deltaMs: number) => {
    const section = this.section;
    const dom = this.dom;
    if (!section || !dom || this.failed || this.stage.lost) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    const begin = performance.now();
    if (this.vh <= 0) this.measureViewport(false);
    this.advance(dt);
    const rect = measure(section);
    const vh = this.vh;
    const height = window.innerHeight;
    const t = -rect.y / vh;
    const velocity = dt > 0 ? (t - this.t) / dt : 0;
    this.velocity = Number.isFinite(velocity) ? damp(this.velocity, velocity, 18, dt) : 0;
    this.t = t;
    const near =
      rect.y < height * (1 + NEAR_MARGIN) && rect.y + rect.height > -height * NEAR_MARGIN;
    if (!near) {
      this.sleep();
      return;
    }
    this.awake = true;
    if (this.jumpOnStart) {
      const { beat, p } = this.jumpOnStart;
      this.jumpOnStart = null;
      this.jump(beat, p);
    }

    const held = this.intent.held || this.pointer.down;
    this.freeze = damp(this.freeze, held ? 1 : 0, 10, dt);

    // Locks: the theme holds from c-rise to the end of f-wave; the flow steps aside while covered.
    this.holdTheme(t >= 0 && t <= TIMELINE.advance.end);
    this.flow.update(rect.y <= 0.5 && rect.y + rect.height > 1);

    // The canvas follows the page during the entrance and the outro.
    let placement: "viewport" | StoryRect = "viewport";
    if (t < 0) placement = dom.viewportRect("intro") ?? "viewport";
    else if (t > TIMELINE.advance.end) placement = dom.viewportRect("finale") ?? "viewport";
    this.stage.show();
    this.stage.place(placement, rect);
    dom.setCanvasRect(this.stage.canvasRect);

    if (this.paletteDirty) {
      this.paletteDirty = false;
      const next = readStoryPalette();
      if (!samePalette(next, this.palette)) {
        this.palette = next;
        this.stage.setPage(next.page);
        this.forEachAct((act) => {
          act.palette?.(this.ctx);
        });
      }
    }

    this.stage.beginFrame();
    const canvas = this.stage.canvasRect;
    this.overlay.beginFrame(canvas.x, canvas.y);
    this.tone.beginFrame();
    this.pointer.tick(dt);
    this.updateActs(t, this.intent.direction, this.velocity, this.freeze, dt);
    this.stage.render(this.clock.time);
    this.overlay.endFrame(this.skipMode(t), this.tone.current === "dark" ? "dark" : "light");
    this.tone.commit({
      x: rect.x,
      y: Math.max(0, rect.y),
      width: rect.width,
      height: Math.min(height, rect.y + rect.height) - Math.max(0, rect.y),
    });
    dom.beginFrame();

    const now = performance.now();
    const interval = this.lastRenderAt ? now - this.lastRenderAt : 0;
    this.lastRenderAt = now;
    if (interval > 0) {
      this.governor.sample(interval);
      this.hopeless.sample(interval);
    }
    this.fpsFrames += 1;
    if (now - this.fpsSince >= 1000) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsSince);
      this.fpsFrames = 0;
      this.fpsSince = now;
    }
    this.stage.setTiming(performance.now() - begin, this.fps);
    this.writeDebug();
  };

  private updateActs(t: number, direction: 1 | -1, velocity: number, freeze: number, dt: number) {
    this.clock.dt = dt;
    this.clock.storyDt = dt * mix(1, 0.3, freeze);
    this.clock.time += dt;
    const owner = actAt(t);
    let active: StoryAct | null = null;
    for (const act of this.acts) {
      const state = this.states.get(act.id);
      if (!state) continue;
      const wasNear = state.near;
      state.set(t, owner, direction, velocity, freeze);
      if (!state.near) {
        if (wasNear) {
          this.safely(() => {
            act.sleep?.(this.ctx);
          });
        }
        continue;
      }
      if (state.active) {
        active = act;
        continue;
      }
      this.safely(() => {
        act.update(this.ctx, state);
      });
    }
    const current = active;
    const state = current ? this.states.get(current.id) : undefined;
    if (current && state) {
      this.safely(() => {
        current.update(this.ctx, state);
      });
    }
  }

  private safely(run: () => void) {
    try {
      run();
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.error("[story] act failed", error);
      this.fail("failed");
    }
  }

  private forEachAct(run: (act: StoryAct) => void) {
    for (const act of this.acts) {
      this.safely(() => {
        run(act);
      });
    }
  }

  private onPointer(event: StoryPointerEvent) {
    if (!this.awake) return;
    const owner = actAt(this.t);
    const act = this.acts.find((one) => one.id === owner);
    if (act?.pointer) {
      this.safely(() => {
        act.pointer?.(this.ctx, event);
      });
    }
  }

  private skipMode(t: number): OverlaySkip {
    if (t >= 0 && t < TIMELINE.finaleStart) return "skip";
    if (t >= TIMELINE.finaleStart && t <= TIMELINE.advance.end + 0.25) return "replay";
    return null;
  }

  private holdTheme(on: boolean) {
    if (on === this.themeHeld) return;
    this.themeHeld = on;
    if (on) acquireThemeLock(THEME_OWNER, THEME_REASON);
    else releaseThemeLock(THEME_OWNER);
  }

  /** Off screen: no frames, no locks, nothing in the overlay. */
  private sleep() {
    if (!this.awake) return;
    this.awake = false;
    this.stopAdvance();
    this.stage.hide();
    this.overlay.clear();
    this.tone.beginFrame();
    this.tone.commit({ x: 0, y: 0, width: 0, height: 0 });
    this.flow.release();
    this.holdTheme(false);
    this.lastRenderAt = 0;
    this.governor.rest();
    for (const act of this.acts) {
      const state = this.states.get(act.id);
      if (state?.near) {
        state.near = false;
        this.safely(() => {
          act.sleep?.(this.ctx);
        });
      }
    }
  }

  private fail(reason: StoryFallbackReason) {
    if (this.failed) return;
    this.failed = true;
    this.hooks.onFallback(reason);
  }

  // ------------------------------------------------------------------ scroll

  /** The section's document offset and the rendered scroll position, now. */
  private smoother() {
    return this.smoothed ? ScrollSmoother.get() : undefined;
  }

  private scrollState() {
    const smoother = this.smoother();
    const rendered = smoother ? smoother.scrollTop() : window.scrollY;
    const section = this.section;
    const top = section ? section.getBoundingClientRect().top : 0;
    return { smoother, rendered, docTop: top + rendered };
  }

  private write(y: number) {
    const smoother = this.smoother();
    const top = Math.max(0, y);
    if (smoother) smoother.scrollTo(top, false);
    else window.scrollTo({ top, behavior: "instant" });
    this.intent.wrote(window.scrollY);
  }

  /** Puts the story at `t` now; `arm` lets auto-advance carry on in that direction. */
  scrollToT(t: number, arm?: 1 | -1) {
    if (!this.section) return;
    const { docTop } = this.scrollState();
    this.write(docTop + t * this.vh);
    this.stopAdvance();
    if (arm) this.intent.arm(arm);
    else this.intent.disarm();
  }

  private stopAdvance() {
    this.autoAdvancing = false;
    this.ramp = 0;
    this.settledFor = 0;
  }

  private advance(dt: number) {
    const intent = this.intent;
    const input = intent.consume();
    this.idle = input ? 0 : this.idle + dt;
    const range = TIMELINE.advance;
    const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const enabled =
      intent.armed &&
      !intent.held &&
      !this.pointer.down &&
      !reduced &&
      !isScrollLocked() &&
      !isReelPlayerOpen() &&
      this.vh > 0;
    if (!enabled || input) {
      this.stopAdvance();
      return;
    }
    const { smoother, rendered, docTop } = this.scrollState();
    const vh = this.vh;
    const t = (rendered - docTop) / vh;
    if (t < range.start - REST_TOLERANCE || t > range.end + REST_TOLERANCE) {
      this.stopAdvance();
      return;
    }
    if (!this.autoAdvancing) {
      const settled = smoother
        ? Math.abs(rendered - window.scrollY) < 2
        : intent.sinceScroll() > 120 && intent.sinceTouchEnd() > 120;
      if (!settled) {
        this.settledFor = 0;
        return;
      }
      this.settledFor += dt;
      if (this.settledFor < SETTLE_SECONDS) return;
      // Parked on a rest already: nothing to finish.
      if (TIMELINE.rests.some((rest) => Math.abs(rest.t - t) < REST_TOLERANCE)) {
        intent.disarm();
        this.stopAdvance();
        return;
      }
    }
    const direction = intent.direction;
    const rest = nextRest(t, direction);
    if (!rest || rest.t < range.start || rest.t > range.end) {
      intent.disarm();
      this.stopAdvance();
      return;
    }
    this.autoAdvancing = true;
    this.ramp = Math.min(1, this.ramp + dt / RAMP_SECONDS);
    const remaining = Math.abs(rest.t - t);
    const landing = Math.min(1, 0.12 + remaining / 0.3);
    const step = direction * speedAt(t) * vh * this.ramp * landing * dt;
    const restY = docTop + rest.t * vh;
    let y = rendered + step;
    const arrived = direction > 0 ? y >= restY - 0.5 : y <= restY + 0.5;
    if (arrived) y = restY;
    this.write(y);
    if (arrived) {
      intent.disarm();
      this.stopAdvance();
    }
  }

  // ------------------------------------------------------------------ layout

  private measureViewport(restore: boolean) {
    const section = this.section;
    if (!section) return;
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const t = this.t;
    this.smoothed = detectSmoothed();
    const vh = nextStoryVh(this.vh, width, this.vw, height);
    this.vw = width;
    this.stage.resize(width, height);
    this.governor.rest();
    if (vh !== this.vh) {
      this.vh = vh;
      section.style.setProperty("--story-vh", `${vh}px`);
      if (restore && t > -ENTRANCE_VH && t < TIMELINE.end) {
        this.restoreT = t;
        this.restore();
      }
    }
    this.forEachAct((act) => {
      act.resize?.(this.ctx);
    });
  }

  private restoreT: number | null = null;
  private restoreTimer = 0;

  /** After a resize changed the story's height, puts the story back at the same `t`. */
  private restore() {
    const t = this.restoreT;
    if (t === null || !this.section) return;
    this.scrollToT(t);
    window.clearTimeout(this.restoreTimer);
    this.restoreTimer = window.setTimeout(() => {
      if (this.restoreT === null) return;
      this.scrollToT(this.restoreT);
      this.restoreT = null;
    }, 350);
  }

  // ------------------------------------------------------------------ dev

  private setupDev() {
    if (process.env.NODE_ENV === "production") return;
    const params = new URLSearchParams(window.location.search);
    const jump = params.get("story");
    if (jump) {
      const [beat, p] = jump.split(":");
      if (beat && TIMELINE.byId.has(beat as BeatId)) {
        this.jumpOnStart = { beat: beat as BeatId, p: Number(p) || 0 };
      }
    }
    this.overlay.setDebug(params.has("storydebug"));
    // Glue check: the box placeholder gets a 1 px outline (story.css) to measure against the GL face.
    if (params.has("storyglue")) this.section?.setAttribute("data-story-glue", "");
    Object.assign(window, {
      __story: {
        director: this,
        stage: this.stage,
        timeline: TIMELINE,
        jump: (beat: BeatId, p = 0) => {
          this.jump(beat, p);
        },
        jumpTo: (t: number) => {
          this.scrollToT(t);
        },
        setTier: (tier: StoryTier) => {
          this.stage.setLevel(levelOf(tier));
          this.forEachAct((act) => {
            act.tier?.(this.ctx);
          });
        },
      },
    });
  }

  private writeDebug() {
    const element = this.overlay.debugElement;
    if (!element) return;
    this.debugEvery = (this.debugEvery + 1) % 6;
    if (this.debugEvery !== 0) return;
    const beat = beatAt(this.t);
    const info = this.stage.info;
    const intent = this.intent;
    const state = this.autoAdvancing
      ? "advancing"
      : intent.armed
        ? this.settledFor > 0
          ? "settling"
          : "armed"
        : "idle";
    element.textContent = [
      `beat   ${this.t < 0 ? "c-enter" : (beat?.id ?? "-")}`,
      `local  ${(beat ? beatProgress(beat, this.t) : saturate(this.t + 1)).toFixed(3)}`,
      `t      ${this.t.toFixed(3)} / ${TIMELINE.end} vh`,
      `fps    ${this.fps.toFixed(0)}   cpu ${info.frameMs.toFixed(1)} ms`,
      `tier   ${this.stage.level.tier} @ ${this.stage.size.dpr.toFixed(2)}`,
      `draws  ${info.calls}   tris ${info.triangles}`,
      `auto   ${state} ${intent.direction > 0 ? "down" : "up"}`,
      `freeze ${this.freeze.toFixed(2)}`,
    ].join("\n");
  }
}
