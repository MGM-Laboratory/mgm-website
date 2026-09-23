import {
  TOPOGRAPHY_FRAGMENT,
  TOPOGRAPHY_VERTEX,
} from "@/components/projects/detail/topography-shader";
import { hexToRgb } from "@/lib/project-themes";

/**
 * The raw WebGL2 renderer behind <ProjectTopography>: one full-screen
 * triangle, one program, a handful of uniforms, and its own frame loop.
 * No three.js or ogl: the whole effect is a fragment shader, so a scene
 * graph would only add bytes.
 *
 * Loop rules (the background sits behind every detail page, so it must
 * cost next to nothing):
 * - Draws at most 30 fps while the page is still, 60 fps while the page's
 *   motion source reports scrolling (and for a moment after).
 * - The rAF loop is cancelled outright, not just idled, while the canvas is
 *   off screen, the tab is hidden, the host pauses it, reduced motion is on
 *   or the context is lost. Whatever needs a redraw meanwhile (a palette
 *   switch, a resize) gets one static frame.
 * - Renders at most 1.5 device pixels per CSS pixel and at most
 *   MAX_PIXELS in total (the lines are faint, so a 5K display doesn't need
 *   every pixel).
 */

export type TopographyMotion = {
  /** Horizontal scroll position, CSS px. */
  scroll: number;
  /** Scroll velocity, CSS px per frame. */
  velocity: number;
};

export type TopographyColors = { bg: string; text: string; highlight: string };

type RGB = [number, number, number];

// ---------------------------------------------------------------- the look

/**
 * React Bits' field parameters. Speed, morph, bands, thickness, contrast,
 * grain and the cursor bump keep the original defaults; the glow is
 * narrower so the soft halo hugs each line instead of hazing the page.
 */
const FIELD = {
  speed: 0.35,
  morphAmount: 3,
  morphSpeed: 0.05,
  bands: 2,
  thickness: 0.01,
  scale: 1,
  glow: 0.25,
  contrast: 3,
  grainIntensity: 0.05,
  mouseRadius: 0.3,
  mouseStrength: 0.4,
} as const;

/**
 * How far a full line core sits from the page background, in CIELAB
 * lightness (L*, 0..100: a perceptual scale, so one number means the same
 * faintness on a pale page and a near-black one). Every stop gets the alpha
 * that lands exactly this far from its own background, so the lines read
 * the same on all 40 theme variants instead of following each palette's
 * contrast. About 6% in gamma-encoded luma on light pages, 4-6% on dark.
 */
const LINE_LIGHTNESS_STEP = 5.5;
/** Hard ceiling for one stop's alpha, whatever the palette. */
const MAX_STOP_ALPHA = 0.35;

/** The original's per-control-point phase indices. */
const CTRL_INDICES = [
  [1, -2, 3, -4],
  [9, -8, 7, -6],
  [5, 2, 5, -5],
  [-1, -3, 8, 9],
] as const;

/**
 * Where the field's clock starts, and so the frame reduced motion shows
 * (seconds; picked for a still with a calm spread of contours).
 */
const STATIC_TIME = 24;

// ---------------------------------------------------------------- the loop

const MAX_PIXEL_RATIO = 1.5;
const MAX_PIXELS = 2560 * 1600;
const IDLE_FPS = 30;
const ACTIVE_FPS = 60;
/** rAF timestamps jitter around the vsync; without slack a 30 fps cap drops to 20 on a 60 Hz display. */
const FRAME_SLACK_MS = 4;
/** Longest clock step, so a stalled frame never makes the field jump. */
const MAX_STEP_MS = 100;
/** Keep 60 fps a moment past the last reported motion (Lenis settles slowly). */
const MOTION_HOLD_MS = 300;
const MOTION_EPSILON = 0.05;
/** Share of the horizontal scroll distance the field drifts along with. */
const DRIFT = 0.05;
/** Scroll speed (px/frame) at which the morph reaches its full boost. */
const VELOCITY_FULL = 40;
/** Extra morph speed at full scroll velocity (1 = twice as fast). */
const VELOCITY_BOOST = 1.2;
const BOOST_SMOOTH_MS = 250;
/** The original's cursor easing per 60 fps frame, made frame-rate independent below. */
const MOUSE_EASE = 0.05;
const PALETTE_FADE_MS = 600;
const REVEAL_FADE_MS = 1200;

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false, // the shader antialiases its own lines (fwidth)
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  // A faint background must never wake a discrete GPU on a dual-GPU laptop.
  powerPreference: "low-power",
  // A software rasteriser would run a full-screen shader at a crawl: those
  // visitors simply get the plain theme background.
  failIfMajorPerformanceCaveat: true,
};

const UNIFORM_NAMES = [
  "uResolution",
  "uBands",
  "uThickness",
  "uScale",
  "uGlow",
  "uContrast",
  "uMorphAmount",
  "uCtrlA",
  "uCtrlB",
  "uCtrlC",
  "uCtrlD",
  "uOffset",
  "uMouse",
  "uMouseActive",
  "uMouseRadius",
  "uMouseStrength",
  "uGrainSeed",
  "uGrainIntensity",
  "uLow",
  "uMid",
  "uHigh",
  "uOpacity",
] as const;

type UniformName = (typeof UNIFORM_NAMES)[number];
type Uniforms = Record<UniformName, WebGLUniformLocation | null>;

function toLinear(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** CIELAB L* of a gamma-encoded sRGB colour. */
function lightness([r, g, b]: RGB) {
  const y = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (y * 24389) / 27;
}

/**
 * The alpha at which `color` composited over `bg` lands
 * LINE_LIGHTNESS_STEP away from it. Compositing is linear in gamma-encoded
 * colour but lightness isn't, so this bisects (24 steps, once per palette).
 */
function stopAlpha(color: RGB, bg: RGB) {
  const base = lightness(bg);
  const offset = (alpha: number) =>
    Math.abs(
      lightness([
        bg[0] + (color[0] - bg[0]) * alpha,
        bg[1] + (color[1] - bg[1]) * alpha,
        bg[2] + (color[2] - bg[2]) * alpha,
      ]) - base,
    );
  if (offset(MAX_STOP_ALPHA) <= LINE_LIGHTNESS_STEP) return MAX_STOP_ALPHA;
  let low = 0;
  let high = MAX_STOP_ALPHA;
  for (let i = 0; i < 24; i += 1) {
    const middle = (low + high) / 2;
    if (offset(middle) < LINE_LIGHTNESS_STEP) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * The palette's three elevation stops, premultiplied (rgb * a, a) and laid
 * out low, mid, high: low = highlight, mid = halfway to the text colour,
 * high = text, so valleys carry the project's accent and ridges its ink.
 */
export function paletteStops(colors: TopographyColors, out = new Float32Array(12)) {
  const bg = hexToRgb(colors.bg);
  const text = hexToRgb(colors.text);
  const highlight = hexToRgb(colors.highlight);
  const mid: RGB = [
    (text[0] + highlight[0]) / 2,
    (text[1] + highlight[1]) / 2,
    (text[2] + highlight[2]) / 2,
  ];
  [highlight, mid, text].forEach((color, index) => {
    const alpha = stopAlpha(color, bg);
    out.set([color[0] * alpha, color[1] * alpha, color[2] * alpha, alpha], index * 4);
  });
  return out;
}

function easeInOutSine(t: number) {
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

export class TopographyEngine {
  /**
   * Appends a canvas to `host` and starts rendering once `setColors` has
   * been called. Returns null (and leaves `host` empty) without hardware
   * WebGL2.
   */
  static create(host: HTMLElement, readMotion: () => TopographyMotion | undefined) {
    const canvas = document.createElement("canvas");
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
    } catch {
      gl = null;
    }
    if (!gl) return null;
    const engine = new TopographyEngine(host, canvas, gl, readMotion);
    if (!engine.program) {
      engine.dispose();
      return null;
    }
    return engine;
  }

  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly readMotion: () => TopographyMotion | undefined;
  // Fetched up front: getExtension returns null once the context is lost,
  // and dispose needs it to release the context straight away.
  private readonly loseContextExtension: WEBGL_lose_context | null;
  private readonly finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;

  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniforms: Uniforms | null = null;
  private readonly ctrl = new Float32Array(4);

  // Colour stops: what is on screen, and the crossfade between two sets.
  private readonly stops = new Float32Array(12);
  private readonly from = new Float32Array(12);
  private readonly to = new Float32Array(12);
  private pendingStops: Float32Array | null = null;
  private colorsKey = "";
  private hasColors = false;
  private tweenStart = 0;
  private tweenDuration = 0;
  private opacity = 1;

  // Conditions for running the loop.
  private visible = true;
  private pageVisible = document.visibilityState !== "hidden";
  private paused = false;
  private reduced = false;
  private lost = false;
  private disposed = false;

  private raf = 0;
  private syncQueued = false;
  private dirty = true;
  private lastFrameAt = 0;
  private lastMotionAt = Number.NEGATIVE_INFINITY;
  private cssWidth = 0;
  private cssHeight = 0;

  private time = STATIC_TIME;
  private scroll: number | null = null;
  private velocity = 0;
  private boost = 0;
  private offset = 0;

  private pointerX = 0;
  private pointerY = 0;
  private pointerTarget = 0;
  private mouseX = 0;
  private mouseY = 0;
  private mouseActive = 0;

  private ticks = 0;
  private renders = 0;

  private constructor(
    host: HTMLElement,
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    readMotion: () => TopographyMotion | undefined,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.readMotion = readMotion;
    this.loseContextExtension = gl.getExtension("WEBGL_lose_context");

    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "block",
      pointerEvents: "none",
    });

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.intersectionObserver = new IntersectionObserver(this.onIntersect, { threshold: 0 });
    if (!this.initGl()) return;

    host.appendChild(canvas);
    const rect = canvas.getBoundingClientRect();
    this.resize(rect.width, rect.height);
    this.resizeObserver.observe(canvas);
    this.intersectionObserver.observe(canvas);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    document.addEventListener("visibilitychange", this.onVisibility);
    // The canvas never takes pointer events (content sits above it), so the
    // cursor is read from the window.
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);

    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, { __projectTopography: this.debugView() });
    }
  }

  // ------------------------------------------------------------ public API

  /** New palette colours: crossfades while the loop runs, snaps otherwise. */
  setColors(colors: TopographyColors) {
    const key = `${colors.bg}|${colors.text}|${colors.highlight}`;
    if (key === this.colorsKey) return;
    this.colorsKey = key;
    this.pendingStops = paletteStops(colors);
    this.schedule();
  }

  /** Multiplies the line alpha (1 = the tuned default). */
  setIntensity(intensity: number) {
    const next = Math.min(Math.max(intensity, 0), 1 / MAX_STOP_ALPHA);
    if (next === this.opacity) return;
    this.opacity = next;
    this.dirty = true;
    this.schedule();
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.schedule();
  }

  setReducedMotion(reduced: boolean) {
    if (reduced === this.reduced) return;
    this.reduced = reduced;
    this.dirty = true;
    this.schedule();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
    if (!this.lost) {
      this.gl.deleteProgram(this.program);
      this.gl.deleteVertexArray(this.vao);
    }
    // Release the context now rather than whenever GC gets to it, so
    // repeated visits never pile contexts up.
    this.loseContextExtension?.loseContext();
    this.canvas.remove();
    this.program = null;
    this.vao = null;
    this.uniforms = null;
    if (process.env.NODE_ENV !== "production") {
      const view = (window as { __projectTopography?: { engine?: unknown } }).__projectTopography;
      if (view?.engine === this) Reflect.deleteProperty(window, "__projectTopography");
    }
  }

  // ------------------------------------------------------------------ GL

  private initGl() {
    const gl = this.gl;
    const vertex = compile(gl, gl.VERTEX_SHADER, TOPOGRAPHY_VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, TOPOGRAPHY_FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return false;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    const linked = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
    if (!linked && process.env.NODE_ENV !== "production" && !gl.isContextLost()) {
      console.error(
        "[topography]",
        gl.getShaderInfoLog(vertex),
        gl.getShaderInfoLog(fragment),
        gl.getProgramInfoLog(program),
      );
    }
    gl.detachShader(program, vertex);
    gl.detachShader(program, fragment);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!linked) {
      gl.deleteProgram(program);
      return false;
    }

    const uniforms = Object.fromEntries(
      UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Uniforms;
    this.program = program;
    this.uniforms = uniforms;
    // The triangle comes from gl_VertexID; an empty VAO keeps every driver
    // happy about drawing with no attributes.
    this.vao = gl.createVertexArray();
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.uniform1f(uniforms.uBands, FIELD.bands);
    gl.uniform1f(uniforms.uThickness, FIELD.thickness);
    gl.uniform1f(uniforms.uScale, FIELD.scale);
    gl.uniform1f(uniforms.uGlow, FIELD.glow);
    gl.uniform1f(uniforms.uContrast, FIELD.contrast);
    gl.uniform1f(uniforms.uMorphAmount, FIELD.morphAmount);
    gl.uniform1f(uniforms.uMouseRadius, FIELD.mouseRadius);
    gl.uniform1f(uniforms.uMouseStrength, FIELD.mouseStrength);
    gl.uniform1f(uniforms.uGrainIntensity, FIELD.grainIntensity);
    return true;
  }

  /** Sizes the drawing buffer; true when it changed (which clears it). */
  private resize(width: number, height: number) {
    this.cssWidth = width;
    this.cssHeight = height;
    let ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const budget = MAX_PIXELS / Math.max(width * height, 1);
    if (ratio * ratio > budget) ratio = Math.sqrt(budget);
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width === w && this.canvas.height === h) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  private canDraw() {
    return !this.disposed && !this.lost && this.hasColors && this.program !== null;
  }

  /** Draws one frame. `live` adds the cursor bump and the scroll drift. */
  private draw(live: boolean) {
    const u = this.uniforms;
    if (!this.canDraw() || !u) return;
    const gl = this.gl;
    const { width, height } = this.canvas;
    this.dirty = false;
    this.renders += 1;

    gl.viewport(0, 0, width, height);
    gl.uniform2f(u.uResolution, width, height);

    const time = this.time;
    const control = (i: number) =>
      FIELD.morphAmount * Math.sin(time * FIELD.speed * Math.sin(i * FIELD.morphSpeed) + i);
    const [indicesA, indicesB, indicesC, indicesD] = CTRL_INDICES;
    const groups = [
      [u.uCtrlA, indicesA],
      [u.uCtrlB, indicesB],
      [u.uCtrlC, indicesC],
      [u.uCtrlD, indicesD],
    ] as const;
    for (const [location, indices] of groups) {
      this.ctrl.set(indices.map(control));
      gl.uniform4fv(location, this.ctrl);
    }

    gl.uniform2f(u.uOffset, live ? this.offset : 0, 0);
    let active = live ? this.mouseActive : 0;
    if (active < 0.001) active = 0;
    if (active > 0) {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((this.mouseX - rect.left) / Math.max(rect.width, 1)) * width;
      const y = ((rect.bottom - this.mouseY) / Math.max(rect.height, 1)) * height;
      gl.uniform2f(u.uMouse, x, y);
    }
    gl.uniform1f(u.uMouseActive, active);
    // Kept small: sin() of a large argument loses precision on some GPUs.
    gl.uniform1f(u.uGrainSeed, (time * 7.31) % 100);
    gl.uniform4fv(u.uLow, this.stops, 0, 4);
    gl.uniform4fv(u.uMid, this.stops, 4, 4);
    gl.uniform4fv(u.uHigh, this.stops, 8, 4);
    gl.uniform1f(u.uOpacity, this.opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---------------------------------------------------------------- state

  private shouldRun() {
    return this.canDraw() && this.visible && this.pageVisible && !this.paused && !this.reduced;
  }

  /** Coalesces every change made in one task (one React commit) into one sync. */
  private schedule() {
    if (this.syncQueued || this.disposed) return;
    this.syncQueued = true;
    queueMicrotask(this.sync);
  }

  private sync = () => {
    this.syncQueued = false;
    if (this.disposed) return;

    if (this.pendingStops) {
      const target = this.pendingStops;
      this.pendingStops = null;
      const first = !this.hasColors;
      this.hasColors = true;
      if (this.shouldRun()) {
        // Fade from whatever is on screen (nothing, on the first palette).
        this.from.set(this.stops);
        this.to.set(target);
        this.tweenStart = performance.now();
        this.tweenDuration = first ? REVEAL_FADE_MS : PALETTE_FADE_MS;
      } else {
        this.snapStops(target);
      }
      this.dirty = true;
    }

    if (this.shouldRun()) {
      this.startLoop();
      return;
    }
    this.stopLoop();
    if (this.tweenDuration > 0) {
      // Stopped mid-crossfade: land on the new palette rather than leave a
      // half-faded frame on screen.
      this.snapStops(this.to);
      this.dirty = true;
    }
    if (this.dirty && this.visible && this.pageVisible) this.draw(false);
  };

  private snapStops(target: Float32Array) {
    this.from.set(target);
    this.to.set(target);
    this.stops.set(target);
    this.tweenDuration = 0;
  }

  private startLoop() {
    if (this.raf) return;
    this.lastFrameAt = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopLoop() {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    this.ticks += 1;

    const motion = this.readMotion();
    if (motion) {
      const moved =
        Math.abs(motion.velocity) > MOTION_EPSILON ||
        (this.scroll !== null && motion.scroll !== this.scroll);
      if (moved) this.lastMotionAt = now;
      this.scroll = motion.scroll;
      this.velocity = motion.velocity;
    } else {
      this.velocity = 0;
    }

    const fps = now - this.lastMotionAt < MOTION_HOLD_MS ? ACTIVE_FPS : IDLE_FPS;
    const elapsed = now - this.lastFrameAt;
    if (this.lastFrameAt > 0 && elapsed < 1000 / fps - FRAME_SLACK_MS) return;
    const dt = this.lastFrameAt > 0 ? Math.min(elapsed, MAX_STEP_MS) : 1000 / ACTIVE_FPS;
    this.lastFrameAt = now;
    this.step(dt, now);
    this.draw(true);
  };

  private step(dt: number, now: number) {
    // Scrolling fast morphs the field a little faster, easing in and out.
    const boostTarget = Math.min(Math.abs(this.velocity) / VELOCITY_FULL, 1);
    this.boost += (boostTarget - this.boost) * (1 - Math.exp(-dt / BOOST_SMOOTH_MS));
    this.time += (dt / 1000) * (1 + VELOCITY_BOOST * this.boost);

    // The field follows the horizontal scroll a little. One period is the
    // canvas's longer side, and the field repeats every period, so the
    // offset wraps without a seam.
    const period = Math.max(this.cssWidth, this.cssHeight, 1);
    const drift = ((this.scroll ?? 0) * DRIFT) / period;
    this.offset = drift - Math.floor(drift);

    if (this.tweenDuration > 0) {
      const progress = Math.min((now - this.tweenStart) / this.tweenDuration, 1);
      const eased = easeInOutSine(progress);
      const to = this.to;
      this.stops.set(this.from.map((from, i) => from + ((to.at(i) ?? from) - from) * eased));
      if (progress >= 1) this.tweenDuration = 0;
    }

    const ease = 1 - Math.pow(1 - MOUSE_EASE, dt / (1000 / 60));
    this.mouseX += (this.pointerX - this.mouseX) * ease;
    this.mouseY += (this.pointerY - this.mouseY) * ease;
    this.mouseActive += (this.pointerTarget - this.mouseActive) * ease;
  }

  // --------------------------------------------------------------- events

  private onResize = (entries: ResizeObserverEntry[]) => {
    const box = entries.at(-1)?.contentRect;
    if (!box || !this.resize(box.width, box.height)) return;
    // A new buffer size clears the canvas. Resize observers run before
    // paint, so drawing here means the lines never blink out.
    this.draw(this.raf !== 0);
  };

  private onIntersect = (entries: IntersectionObserverEntry[]) => {
    const entry = entries.at(-1);
    if (!entry) return;
    this.visible = entry.isIntersecting;
    this.schedule();
  };

  private onVisibility = () => {
    this.pageVisible = document.visibilityState !== "hidden";
    this.schedule();
  };

  private onPointerMove = (event: PointerEvent) => {
    // Touch and coarse pointers get no bump.
    if (event.pointerType !== "mouse" || !this.finePointer.matches) return;
    if (this.mouseActive < 0.01) {
      // Grow the bump where the cursor is instead of sweeping it in from
      // wherever it faded out.
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    }
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.pointerTarget = 1;
  };

  private onPointerLeave = () => {
    this.pointerTarget = 0;
  };

  private onContextLost = (event: Event) => {
    // Without preventDefault the browser never offers the context back.
    event.preventDefault();
    this.lost = true;
    this.program = null;
    this.vao = null;
    this.uniforms = null;
    this.stopLoop();
  };

  private onContextRestored = () => {
    if (this.disposed || !this.initGl()) return;
    this.lost = false;
    this.dirty = true;
    this.schedule();
  };

  /** Dev only: counters the verification scripts read. */
  private debugView() {
    return {
      engine: this,
      get ticks() {
        return this.engine.ticks;
      },
      get renders() {
        return this.engine.renders;
      },
      get running() {
        return this.engine.raf !== 0;
      },
      get state() {
        const engine = this.engine;
        return {
          visible: engine.visible,
          pageVisible: engine.pageVisible,
          paused: engine.paused,
          reduced: engine.reduced,
          lost: engine.lost,
          width: engine.canvas.width,
          height: engine.canvas.height,
          time: engine.time,
          offset: engine.offset,
          boost: engine.boost,
          mouseActive: engine.mouseActive,
          tweening: engine.tweenDuration > 0,
        };
      },
    };
  }
}
