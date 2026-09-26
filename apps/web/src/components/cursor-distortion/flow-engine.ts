import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  GLSL3,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
  type IUniform,
  type Texture,
} from "three";

import {
  BLUR_FRAGMENT,
  COMPOSITE_FRAGMENT,
  COPY_FRAGMENT,
  FILL_FRAGMENT,
  FULLSCREEN_VERTEX,
  SIM_FRAGMENT,
} from "@/components/cursor-distortion/flow-shaders";
import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import type { GlFrame, GlHost } from "@/lib/gl-host";
import { pointer, onPointer } from "@/lib/motion/pointer";
import { isScrollLocked, onScrollLockChange } from "@/lib/scroll-lock";

/**
 * The cursor flow stage: one fixed WebGL canvas BEHIND the page (the DOM
 * paints over it, text included, so nothing readable is ever distorted).
 * It draws the page colour, plus whatever layers put into `scene`, and the
 * cursor drags those pixels like wet paint, leaving a thin iridescent
 * sheen on the tail of each stroke.
 *
 * The technique is lusion.co's screen paint, re-derived: a 1/4 resolution
 * RGBA8 field the cursor stamps with its velocity (a leaky integral of the
 * brush's motion) and two decaying weights, advected every step along a
 * blurred 1/8 resolution copy of itself; then a full-screen pass that
 * averages nine samples of the stage along the field's velocity and adds
 * `sin(velocity)` where the paint has faded. Scrolling carries the field
 * with the content and paints lightly under a still cursor.
 *
 * Every constant is lusion's 60 Hz per-frame value; each simulation step
 * scales them to its own length (`k^(dt*60)` for the decays, linearly for
 * the rest), so a 120 Hz screen shows the same trail as a 60 Hz one. The
 * 8-bit decay floor stays per step: scaling it would round to nothing.
 *
 * Colour: display-referred throughout. The renderer's output colour space
 * is linear sRGB, which three.js reads as "no conversion", so a texture
 * left in NoColorSpace (the default for images and videos) draws its bytes
 * exactly as the DOM would. A layer that sets a material colour from hex
 * should use `color.setHex(hex, LinearSRGBColorSpace)` to keep the same
 * bytes.
 *
 * Rendering stops entirely when nothing moves: no stamp for 1.2 s (the
 * paint has fully faded by then), no scroll, and no layer holding frames.
 */

type Rgb = readonly [number, number, number];

/** WebGL pixel ratio cap and total pixel budget (lusion's rule). */
const MAX_DPR = 1.5;
const MAX_PIXELS = 2560 * 1440;
/** No stamp for this long: the sim and the pass stop (the paint is gone by ~1.07 s). */
const IDLE_AFTER_MS = 1200;
/** Frames the loop keeps running after the content last moved. */
const SETTLE_FRAMES = 4;

// lusion's per-frame (60 Hz) constants, in field pixels.
const PUSH = 25;
const WARP_FREQ = 0.02;
const WARP_AMP = 3;
const KEEP_VELOCITY = 0.975;
const KEEP_SLOW = 0.95;
const KEEP_FAST = 0.8;
const INJECT_LEAK = 0.8;
/** CSS px moved in one 60 Hz frame that reaches the full brush radius. */
const RADIUS_RANGE = 100;
/** Per-tap smear step: amount 3 / 4 x multiplier 5, in field texels per unit velocity. */
const SMEAR_STEP = 3.75;
const RGB_PHASE = 0.5;
/** Sheen strength: shade 1.25 x colour multiplier 10 (light theme, lusion's value). */
const TINT_LIGHT = 12.5;
/**
 * Dark theme, tuned by eye: an additive sine clips its negative lobes to
 * black on a dark page and leaves only hard, bright streaks. Folding the
 * lobes up (abs) keeps both halves of every contour line as light, and a
 * little desaturation toward grey reads as a pearl sheen rather than an
 * oil slick.
 */
const TINT_DARK = 14;
const PEARL_DARK = 0.35;
/** A pointer jump longer than this (a return from outside, a hitch) starts a fresh stroke. */
const MAX_SEGMENT_PX = 360;
/** A content jump longer than this share of the viewport (a route reset, an anchor) clears the paint. */
const MAX_SCROLL_SHARE = 0.6;
/** Startup benchmark: above this many ms per full pass the renderer is a CPU in disguise. */
const SLOW_PASS_MS = 10;
/** Runtime watch: a median frame above this while the pass runs hands the page back. */
const SLOW_FRAME_MS = 45;

export type FlowFailure = "context-lost" | "too-slow";

export type FlowEngineOptions = {
  /** The stage can't continue (a lost context, a renderer too slow): tear it down. */
  onFail: (reason: FlowFailure) => void;
  /** Development only: sample a debug grid instead of the stage. */
  grid?: boolean;
};

type Brush = { x: number; y: number; radius: number; strength: number };

function passMaterial(fragmentShader: string, uniforms: Record<string, IUniform>, defines = {}) {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
  });
}

function fieldTarget(width: number, height: number) {
  const target = new WebGLRenderTarget(width, height, {
    type: UnsignedByteType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  target.texture.colorSpace = NoColorSpace;
  return target;
}

export class FlowEngine implements GlHost {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(0, 1, 0, -1, -1000, 1000);
  readonly size = { width: 1, height: 1, dpr: 1 };

  private readonly options: FlowEngineOptions;
  private readonly passScene = new Scene();
  private readonly passCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh;

  private field = fieldTarget(1, 1);
  private scratch = fieldTarget(1, 1);
  private coarse = fieldTarget(1, 1);
  private coarseTmp = fieldTarget(1, 1);
  private stageTarget: WebGLRenderTarget | null = null;

  private readonly fill: RawShaderMaterial;
  private readonly copy: RawShaderMaterial;
  private readonly blur: RawShaderMaterial;
  private readonly sim: RawShaderMaterial;
  private readonly compositeFlat: RawShaderMaterial;
  private readonly compositeStage: RawShaderMaterial;
  private readonly compositeUniforms: Record<string, IUniform>;

  private readonly background = new Color(1, 1, 1);
  private readonly backgroundRaw = new Vector3(1, 1, 1);
  private dark = false;

  private readonly listeners = new Set<(frame: GlFrame) => void>();
  private readonly owners = new Set<string>();
  private readonly frame: GlFrame = { time: 0, dt: 0 };
  private offTick: (() => void) | null = null;
  private readonly offs: Array<() => void> = [];

  private visible = false;
  private disposed = false;
  private lost = false;
  private frozen = false;
  private locked = false;
  private dirty = false;

  // Input and simulation state.
  private brush: Brush = { x: 0, y: 0, radius: 0, strength: 0 };
  private brushValid = false;
  private readonly inject = new Vector2();
  private lastPointer = { x: 0, y: 0, valid: false };
  private lastStampAt = -Infinity;
  private content: HTMLElement | null = null;
  private lastTop: number | null = null;
  private stillFrames = 0;
  private frameCount = 0;

  // Runtime slowness watch (real intervals: the frame loop clamps dt).
  private slowSamples: number[] = [];
  private slowGrace = 1;
  private lastTickAt = 0;
  private lastDevicePixelRatio = 0;

  constructor(options: FlowEngineOptions) {
    this.options = options;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.dataset.cursorFlow = "";
    Object.assign(this.canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      // Under every in-flow block of the page (a fixed element at z-index
      // 0 would paint over static content off the homepage), above the
      // root background the body's colour propagates to.
      zIndex: "-1",
      pointerEvents: "none",
      display: "none",
    });

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.autoClear = false;

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.fill = passMaterial(FILL_FRAGMENT, { uValue: { value: new Vector4() } });
    this.quad = new Mesh(geometry, this.fill);
    this.quad.frustumCulled = false;
    this.passScene.add(this.quad);

    this.copy = passMaterial(COPY_FRAGMENT, { tSource: { value: null } });
    this.blur = passMaterial(BLUR_FRAGMENT, {
      tSource: { value: null },
      uStep: { value: new Vector2() },
    });
    this.sim = passMaterial(SIM_FRAGMENT, {
      tPrev: { value: null },
      tCoarse: { value: null },
      uTexel: { value: new Vector2() },
      uScroll: { value: new Vector2() },
      uFrom: { value: new Vector4() },
      uTo: { value: new Vector4() },
      uInject: { value: new Vector2() },
      uKeep: { value: new Vector3() },
      uAdvect: { value: PUSH },
      uWarpFreq: { value: WARP_FREQ },
      uWarpAmp: { value: WARP_AMP },
      uGain: { value: 1 },
    });
    this.compositeUniforms = {
      tScene: { value: null },
      tField: { value: this.field.texture },
      uFieldTexel: { value: new Vector2(1, 1) },
      uViewport: { value: new Vector2(1, 1) },
      uBackground: { value: this.backgroundRaw },
      uStep: { value: SMEAR_STEP },
      uPhase: { value: RGB_PHASE },
      uTint: { value: TINT_LIGHT },
      uAbs: { value: 0 },
      uPearl: { value: 0 },
      uFrame: { value: 0 },
    };
    this.compositeFlat = passMaterial(
      COMPOSITE_FRAGMENT,
      this.compositeUniforms,
      options.grid ? { GRID: "" } : {},
    );
    this.compositeStage = passMaterial(COMPOSITE_FRAGMENT, this.compositeUniforms, {
      STAGE: "",
    });

    this.canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    // A layer added while the stage sleeps still needs a frame to show.
    this.scene.addEventListener("childadded", this.wake);
    this.scene.addEventListener("childremoved", this.wake);
  }

  // ------------------------------------------------------------- GlHost

  /** Stable across frames: the sim ping-pongs through a scratch target and copies back. */
  get paintTexture(): Texture {
    return this.field.texture;
  }

  onFrame(listener: (frame: GlFrame) => void) {
    this.listeners.add(listener);
    this.wake();
    return () => {
      this.listeners.delete(listener);
    };
  }

  requestFrames(owner: string, active: boolean) {
    if (active) {
      this.owners.add(owner);
      this.wake();
    } else if (this.owners.delete(owner)) {
      // One more frame so the layer's last state lands.
      this.dirty = true;
      this.wake();
    }
  }

  // ------------------------------------------------------------- lifecycle

  /**
   * Compiles every pass and measures one full frame. Returns false when
   * the renderer is too slow to run behind the page (a software renderer
   * that hides its name). Call once, before `show()`.
   */
  prepare(): boolean {
    if (this.lost) return false;
    document.body.appendChild(this.canvas);
    this.resize();
    // Warm every program, then time the heaviest frame (the stage pass).
    this.stageTarget = this.makeStageTarget();
    this.resetField();
    this.simulateStep(1, 1 / 60, null, 0);
    this.renderComposite(true);
    this.renderComposite(false);
    const gl = this.renderer.getContext();
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const start = performance.now();
    const runs = 3;
    for (let run = 0; run < runs; run += 1) {
      this.simulateStep(1, 1 / 60, null, 0);
      this.renderComposite(true);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    }
    const perFrame = (performance.now() - start) / runs;
    this.disposeStageTarget();
    this.resetField();
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[cursor-flow] warm frame ${perFrame.toFixed(2)} ms`);
    }
    return !this.lost && perFrame < SLOW_PASS_MS;
  }

  /** The page colour the stage clears to (sRGB bytes). */
  setBackground(rgb: Rgb, dark: boolean) {
    this.background.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, LinearSRGBColorSpace);
    this.backgroundRaw.set(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    this.dark = dark;
    this.compositeUniforms.uTint.value = dark ? TINT_DARK : TINT_LIGHT;
    this.compositeUniforms.uAbs.value = dark ? 1 : 0;
    this.compositeUniforms.uPearl.value = dark ? PEARL_DARK : 0;
  }

  /**
   * Shows the canvas with a frame already drawn, so the page never shows
   * a blank or stale canvas. Synchronous: the caller clears the page's
   * surfaces in the same task.
   */
  show() {
    if (this.disposed || this.lost) return;
    this.resize();
    this.resetField();
    this.lastTop = null;
    this.lastPointer.valid = false;
    this.brushValid = false;
    this.renderNow();
    this.canvas.style.display = "block";
    if (!this.visible) {
      this.visible = true;
      this.offs.push(
        onPointer((state, event) => {
          if (event && event.pointerType !== "touch" && event.type === "pointermove") this.wake();
          if (!state.inside) this.lastPointer.valid = false;
        }),
        onScrollLockChange((locked) => {
          this.locked = locked;
          if (locked) this.lastPointer.valid = false;
        }),
      );
      this.locked = isScrollLocked();
      window.addEventListener("scroll", this.wake, { passive: true });
      window.addEventListener("resize", this.onResize);
      document.addEventListener("visibilitychange", this.onVisibility);
      this.offs.push(() => {
        window.removeEventListener("scroll", this.wake);
        window.removeEventListener("resize", this.onResize);
        document.removeEventListener("visibilitychange", this.onVisibility);
      });
    }
  }

  /** Hides the canvas and stops every frame; the big buffers are released until the next show. */
  hide() {
    if (!this.visible) return;
    this.visible = false;
    for (const off of this.offs.splice(0)) off();
    this.stop();
    this.canvas.style.display = "none";
    this.disposeStageTarget();
    this.owners.clear();
  }

  /** Draws the current state now (a theme switch, a resize): the next paint shows it. */
  renderNow() {
    if (this.disposed || this.lost) return;
    this.render(performance.now() - this.lastStampAt < IDLE_AFTER_MS);
  }

  /** Clears the paint (a route change: the old strokes belong to another page). */
  resetField() {
    for (const target of [this.field, this.scratch, this.coarse, this.coarseTmp]) {
      this.draw(this.fill, target, { uValue: [0.5, 0.5, 0, 0] });
    }
    this.inject.set(0, 0);
    this.brushValid = false;
    this.lastStampAt = -Infinity;
  }

  /** Development only: holds the paint where it is (for screenshots). */
  setFrozen(frozen: boolean) {
    this.frozen = frozen;
    this.wake();
  }

  /** Development only: overrides the pass's look (tint, soft, step, phase) and redraws. */
  debugTune(values: Partial<Record<"uTint" | "uAbs" | "uPearl" | "uStep" | "uPhase", number>>) {
    for (const [name, value] of Object.entries(values)) {
      if (typeof value === "number") this.compositeUniforms[name].value = value;
    }
    this.dirty = true;
    this.wake();
  }

  /** Development only: what the stage is doing. */
  debugState() {
    return {
      visible: this.visible,
      running: this.offTick !== null,
      painting: performance.now() - this.lastStampAt < IDLE_AFTER_MS,
      owners: [...this.owners],
      layers: this.scene.children.length,
      field: [this.field.width, this.field.height],
      size: { ...this.size },
      dark: this.dark,
    };
  }

  /** Development only: reads the field back (RGBA8, bottom row first). */
  debugReadField() {
    const { width, height } = this.field;
    const data = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(this.field, 0, 0, width, height, data);
    return { width, height, data };
  }

  dispose() {
    if (this.disposed) return;
    this.hide();
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
    this.scene.removeEventListener("childadded", this.wake);
    this.scene.removeEventListener("childremoved", this.wake);
    this.listeners.clear();
    for (const target of [this.field, this.scratch, this.coarse, this.coarseTmp]) {
      target.dispose();
    }
    for (const material of [
      this.fill,
      this.copy,
      this.blur,
      this.sim,
      this.compositeFlat,
      this.compositeStage,
    ]) {
      material.dispose();
    }
    this.quad.geometry.dispose();
    const lost = this.lost || this.renderer.getContext().isContextLost();
    this.renderer.dispose();
    // Release the context now rather than whenever GC gets to it, so
    // repeated visits never pile contexts up.
    if (!lost) this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ------------------------------------------------------------- the loop

  private readonly wake = () => {
    if (!this.visible || this.disposed || this.lost || this.offTick) return;
    this.stillFrames = 0;
    this.offTick = addFrameCallback("render", this.tick);
  };

  private stop() {
    this.offTick?.();
    this.offTick = null;
    this.slowSamples = [];
    this.lastTickAt = 0;
  }

  private readonly onVisibility = () => {
    // A hidden tab gets no frames anyway; start the next visible one fresh.
    if (document.hidden) {
      this.stop();
      this.lastPointer.valid = false;
    } else {
      this.lastTop = null;
      this.wake();
    }
  };

  private readonly onResize = () => {
    if (!this.visible) return;
    // Resizing clears the drawing buffer: draw again before the next paint.
    this.resize();
    this.resetField();
    this.renderNow();
    this.wake();
  };

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    if (this.lost) return;
    this.lost = true;
    this.stop();
    this.options.onFail("context-lost");
  };

  /** The content's scroll position as drawn this frame (smoothed on the homepage). */
  private contentTop(): number | null {
    if (!this.content?.isConnected) this.content = document.getElementById("smooth-content");
    return this.content ? this.content.getBoundingClientRect().top : null;
  }

  private readonly tick = (_time: number, dt: number) => {
    if (!this.visible || this.lost) return;
    if (window.devicePixelRatio !== this.lastDevicePixelRatio) this.onResize();
    const now = performance.now();
    const interval = this.lastTickAt ? now - this.lastTickAt : 0;
    this.lastTickAt = now;
    this.frame.time += dt;
    this.frame.dt = dt;
    this.frameCount += 1;

    // The content's movement since the last frame (positive: it moved up).
    const top = this.contentTop();
    let scroll = 0;
    if (top !== null && this.lastTop !== null) scroll = this.lastTop - top;
    this.lastTop = top;
    if (Math.abs(scroll) > this.size.height * MAX_SCROLL_SHARE) {
      this.resetField();
      scroll = 0;
    }

    const state = pointer();
    const mouse = state.type === "mouse" || state.type === "pen";
    const canPaint = mouse && state.inside && state.lastMove > 0 && !this.locked && !this.frozen;
    let moved = false;
    if (canPaint) {
      if (!this.lastPointer.valid) {
        this.lastPointer = { x: state.x, y: state.y, valid: true };
        this.brushValid = false;
      } else if (Math.hypot(state.x - this.lastPointer.x, state.y - this.lastPointer.y) > 0) {
        moved = true;
      }
    } else {
      this.lastPointer.valid = false;
    }
    const stamping = canPaint && (moved || scroll !== 0);
    if (stamping) this.lastStampAt = now;
    // A frozen field (development screenshots) keeps showing as it is.
    const painting = this.frozen || now - this.lastStampAt < IDLE_AFTER_MS;

    if (painting && !this.frozen) this.simulate(dt, state.x, state.y, stamping, scroll);
    if (canPaint) this.lastPointer = { x: state.x, y: state.y, valid: true };

    for (const listener of [...this.listeners]) listener(this.frame);

    const layers = this.scene.children.length > 0;
    const drawn = painting || this.dirty || this.owners.size > 0 || (layers && scroll !== 0);
    if (drawn) this.render(painting);
    this.dirty = false;
    if (painting) this.watchSpeed(interval);

    if (scroll !== 0) this.stillFrames = 0;
    else this.stillFrames += 1;
    if (!painting && this.owners.size === 0 && this.stillFrames > SETTLE_FRAMES) this.stop();
  };

  /** A renderer that can't keep up behind the page gives the page back. */
  private watchSpeed(ms: number) {
    if (ms <= 0 || ms > 1000 || document.hidden) return;
    if (this.slowGrace > 0) {
      this.slowGrace -= ms / 1000;
      return;
    }
    this.slowSamples.push(ms);
    if (this.slowSamples.length < 40) return;
    const sorted = [...this.slowSamples].sort((a, b) => a - b);
    this.slowSamples = [];
    if (sorted[sorted.length >> 1] > SLOW_FRAME_MS) {
      this.stop();
      this.options.onFail("too-slow");
    }
  }

  // ------------------------------------------------------------- sizing

  private resize() {
    const html = document.documentElement;
    const width = Math.max(1, html.clientWidth || window.innerWidth);
    const height = Math.max(1, html.clientHeight || window.innerHeight);
    let dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    if (width * height * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (width * height));
    this.lastDevicePixelRatio = window.devicePixelRatio;
    const same = width === this.size.width && height === this.size.height && dpr === this.size.dpr;
    this.size.width = width;
    this.size.height = height;
    this.size.dpr = dpr;
    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = 0;
    this.camera.bottom = -height;
    this.camera.updateProjectionMatrix();
    if (same && this.field.width > 1) return;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const buffer = this.renderer.getDrawingBufferSize(new Vector2());
    const fieldW = Math.max(1, buffer.x >> 2);
    const fieldH = Math.max(1, buffer.y >> 2);
    const coarseW = Math.max(1, buffer.x >> 3);
    const coarseH = Math.max(1, buffer.y >> 3);
    this.field.setSize(fieldW, fieldH);
    this.scratch.setSize(fieldW, fieldH);
    this.coarse.setSize(coarseW, coarseH);
    this.coarseTmp.setSize(coarseW, coarseH);
    this.stageTarget?.setSize(buffer.x, buffer.y);
    (this.sim.uniforms.uTexel.value as Vector2).set(1 / fieldW, 1 / fieldH);
    (this.compositeUniforms.uFieldTexel.value as Vector2).set(1 / fieldW, 1 / fieldH);
    (this.compositeUniforms.uViewport.value as Vector2).set(width, height);
  }

  private makeStageTarget() {
    const buffer = this.renderer.getDrawingBufferSize(new Vector2());
    const target = fieldTarget(buffer.x, buffer.y);
    return target;
  }

  private disposeStageTarget() {
    this.stageTarget?.dispose();
    this.stageTarget = null;
  }

  // ------------------------------------------------------------- simulation

  /**
   * Advances the field by `dt`. Steps are at most a 60 Hz frame long
   * (a slow frame runs several, walking the pointer along its path), and
   * every constant is scaled to its step.
   */
  private simulate(dt: number, x: number, y: number, stamping: boolean, scroll: number) {
    const steps = dt > 1 / 45 ? Math.min(3, Math.ceil(dt * 60 - 0.01)) : 1;
    const stepDt = dt / steps;
    const scale = stepDt * 60;
    const from = this.lastPointer.valid ? this.lastPointer : { x, y };
    let jump = Math.hypot(x - from.x, y - from.y) > MAX_SEGMENT_PX;
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const px = from.x + (x - from.x) * t;
      const py = from.y + (y - from.y) * t;
      const moved = Math.hypot((x - from.x) / steps, (y - from.y) / steps + (3 * scroll) / steps);
      if (jump) {
        this.brushValid = false;
        jump = false;
      }
      this.simulateStep(
        scale,
        stepDt,
        stamping ? { x: px, y: py, moved, scroll: scroll / steps } : null,
        scroll / steps,
      );
    }
  }

  /** One step of `scale` 60 Hz frames (`stepDt` seconds). */
  private simulateStep(
    scale: number,
    stepDt: number,
    stamp: { x: number; y: number; moved: number; scroll: number } | null,
    scroll: number,
  ) {
    const { width: vw, height: vh } = this.size;
    const fieldW = this.field.width;
    const fieldH = this.field.height;

    const from = this.brush;
    let to: Brush;
    if (stamp) {
      const perFrame = stamp.moved / Math.max(scale, 1e-3);
      const radiusCss = Math.min(1, perFrame / RADIUS_RANGE) * Math.max(40, vw / 20);
      // Field space: y up, in field pixels. lusion rides the brush point
      // half the scroll up, which draws the short comet a scroll paints.
      to = {
        x: (stamp.x / vw) * fieldW,
        y: ((vh - stamp.y + stamp.scroll * 0.5) / vh) * fieldH,
        radius: (radiusCss / vh) * fieldH,
        strength: 1,
      };
    } else {
      to = { ...from, radius: 0, strength: 0 };
    }
    if (!this.brushValid) {
      from.x = to.x;
      from.y = to.y;
      from.radius = to.radius;
      from.strength = to.strength;
      this.brushValid = Boolean(stamp);
    }

    // The injected velocity: a leaky integral of the brush's motion whose
    // steady state (speed / 900 in field px) doesn't depend on the step.
    const leak = Math.pow(INJECT_LEAK, scale);
    const gain = (1 - leak) / (900 * stepDt);
    this.inject.set(
      this.inject.x * leak + (to.x - from.x) * gain,
      this.inject.y * leak + (to.y - from.y) * gain,
    );

    const u = this.sim.uniforms;
    (u.uFrom.value as Vector4).set(from.x, from.y, from.radius, from.strength);
    (u.uTo.value as Vector4).set(to.x, to.y, to.radius, to.strength);
    (u.uInject.value as Vector2).set(this.inject.x * scale, this.inject.y * scale);
    (u.uScroll.value as Vector2).set(0, scroll / vh);
    (u.uKeep.value as Vector3).set(
      Math.pow(KEEP_VELOCITY, scale),
      Math.pow(KEEP_SLOW, scale),
      Math.pow(KEEP_FAST, scale),
    );
    u.uAdvect.value = PUSH * scale;
    u.uWarpAmp.value = WARP_AMP * scale;
    u.uGain.value = Math.min(1, scale);
    u.tPrev.value = this.field.texture;
    u.tCoarse.value = this.coarse.texture;
    this.draw(this.sim, this.scratch);
    this.draw(this.copy, this.field, { tSource: this.scratch.texture });

    // The coarse copy the next step flows along: 1/8 resolution, blurred.
    this.draw(this.copy, this.coarse, { tSource: this.field.texture });
    (this.blur.uniforms.uStep.value as Vector2).set(2 / this.coarse.width, 0);
    this.draw(this.blur, this.coarseTmp, { tSource: this.coarse.texture });
    (this.blur.uniforms.uStep.value as Vector2).set(0, 2 / this.coarse.height);
    this.draw(this.blur, this.coarse, { tSource: this.coarseTmp.texture });

    this.brush = to;
  }

  // ------------------------------------------------------------- rendering

  private draw(
    material: RawShaderMaterial,
    target: WebGLRenderTarget | null,
    values?: Record<string, unknown>,
  ) {
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        const uniform = material.uniforms[name];
        if (Array.isArray(value)) (uniform.value as Vector4).fromArray(value);
        else uniform.value = value;
      }
    }
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.passScene, this.passCamera);
  }

  /** The stage (page colour plus layers) into `target`. */
  private renderStage(target: WebGLRenderTarget | null) {
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(this.background, 1);
    this.renderer.clear(true, false, false);
    if (this.scene.children.length) this.renderer.render(this.scene, this.camera);
  }

  /** The full pass: the stage dragged by the field, plus the sheen. */
  private renderComposite(withStage: boolean) {
    this.compositeUniforms.uFrame.value = this.frameCount % 64;
    if (withStage) {
      this.stageTarget ??= this.makeStageTarget();
      this.renderStage(this.stageTarget);
      this.compositeUniforms.tScene.value = this.stageTarget.texture;
      this.draw(this.compositeStage, null);
    } else {
      this.draw(this.compositeFlat, null);
    }
  }

  private render(painting: boolean) {
    const layers = this.scene.children.length > 0;
    if (painting) {
      this.renderComposite(layers);
    } else {
      // Nothing to smear: the stage straight to the screen, exact bytes.
      this.renderStage(null);
      if (!layers) this.disposeStageTarget();
    }
  }
}
