import gsap from "gsap";
import {
  Camera,
  DoubleSide,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector4,
  WebGLRenderer,
} from "three";

import { coverFragmentShader, coverVertexShader } from "@/components/projects/stage/cover-shaders";
import {
  coverUvRect,
  prepareCover,
  type CoverCrop,
  type PreparedCover,
} from "@/components/projects/stage/cover-textures";
import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import { gridRevealState } from "@/components/projects/stage/grid-reveal-state";
import { Spring } from "@/components/projects/stage/spring";
import {
  getStageCards,
  onStageCardsChange,
  type StageCard,
} from "@/components/projects/stage/stage-registry";
import { randomBetween } from "@/lib/random";

/**
 * The /projects cover stage: one full-viewport WebGL canvas (fixed, at the
 * body level, under the header) that draws every card's cover as a quad
 * kept on its DOM frame's rect, lusion.co style. The DOM keeps the text,
 * the links and the layout; the canvas only paints pictures.
 *
 * Loaded only through a dynamic import from the /projects client code, so
 * three.js never reaches a chunk another route loads.
 *
 * Per card it plays, all time-based from the moment the card enters:
 * - the opening: a rounded mask growing 70% -> 100%, the picture pulling
 *   back from 1.333x, the quad sliding in from the page centre and
 *   un-rotating (lusion's exact curves);
 * - a focus pulse (blur -> sharp -> blur -> sharp, spring driven) on every
 *   opening, plus a radial motion blur at the edges while it zooms out;
 * - hover: a focus pull, a small zoom-out, a cursor tilt, two handheld
 *   "jolts".
 * And for the whole list, from the scroll itself: lusion's horizontal lens
 * (edges flare outward at speed) plus a spring-damped bend of every card,
 * which the card's DOM footer follows so the whole card reacts.
 *
 * Everything renders on demand: nothing is drawn while nothing moves.
 */

const MAX_PIXEL_RATIO = 2;
const SEGMENTS_X = 32;
const SEGMENTS_Y = 8;
// Fixed stacking: above the page's opaque background, below BackToTop (30),
// the cursor wake (40), the header and its nav (50) and the curtain (999).
const CANVAS_Z_INDEX = "20";

// Opening (lusion's constants).
const SHOW_SECONDS = 1.5; // mask grow + zoom-out
const SETTLE_SECONDS = 2; // slide + un-rotate
const SLIDE = 0.05; // x viewport width, from the page centre
const TILT_IN = 0.05; // rad
const ZOOM_FROM = 0.75; // sampling scale at the start: content at 1.333x
// Resting overscan (content at 1.026x) so the hover zoom-out, the jolts and
// the parallax never sample past the picture's edges.
const REST_ZOOM = 0.975;

// Focus pulse: the spring starts fully blurred and is released toward
// sharp; its kick undershoots to about -0.5, which reads as blur -> sharp
// -> blur -> sharp, a lens hunting for focus.
const FOCUS_SPRING = [2.2, 0.7, 3] as const;
const FOCUS_PX = 9;
// A card entering from the bottom edge holds its blur until enough of it is
// on screen to see the pulse (or this long at most).
const FOCUS_HOLD_VISIBLE = 0.3;
const FOCUS_HOLD_SECONDS = 0.35;
const FOCUS_EPSILON = 0.004;

// Edge motion blur: streak length per unit of zoom-out speed (1/s).
const STREAK_GAIN = 7;
const STREAK_MAX = 16;

// Scroll lens (lusion): strength accumulates per-frame scroll distance in
// viewport heights and decays with a 100 ms time constant.
const LENS_DECAY = 10;
const LENS_MAX = 0.15;
// Chromatic split at the warped edges, only near full lens strength.
const SPLIT_MAX = 1.5;

// Scroll bend: px of sag at the card centre for a given scroll speed, with
// a dead zone so ordinary reading scrolls barely register and a soft knee
// toward the cap on flicks. The spring is underdamped so the sheet swings
// past flat once when the scroll stops.
const BOW_MAX = 30;
const BOW_LIMIT = 36;
const BOW_DEADZONE = 250; // px/s
const BOW_SOFTNESS = 2600; // px/s
const BOW_SPRING = [2, 0.3, 0] as const;
const VELOCITY_SMOOTHING = 18; // 1/s, evens out discrete wheel steps
// The footer rides with the frame's bottom-centre point (the vertex bend
// there is 1 - 0.35 of the centre's).
const FOOTER_BOW = 0.65;

// Hover.
const HOVER_ZOOM = 0.68; // spring target; its overshoot lands near 1.0x
const HOVER_BLUR = 0.7; // focus kick target
const HOVER_BLUR_SECONDS = 0.09;
const HOVER_SPRING = [2.2, 0.7, 3] as const;
const TILT_MAX = 0.05; // rad at the frame edge
const TILT_SPRING = [1.3, 0.65, 1] as const;
const PARALLAX = 0.006; // frame uv at the frame edge
const JOLT_UV = 0.01;
const JOLT_TIMES = [0.2, 0.3];

// Texture streaming.
const PRELOAD_AHEAD = 2.5; // viewports below
const PRELOAD_BEHIND = 1.5; // viewports above
const MAX_CONCURRENT_LOADS = 2;

type CoverState = "idle" | "loading" | "prepared" | "uploaded" | "attached" | "failed";

type CardUniforms = {
  u_map: { value: Texture | null };
  u_mapRect: { value: Vector4 };
  u_rect: { value: Vector4 };
  u_pad: { value: Vector2 };
  u_offset: { value: Vector2 };
  u_angle: { value: number };
  u_tilt: { value: Vector2 };
  u_bow: { value: number };
  u_show: { value: number };
  u_radius: { value: number };
  u_mag: { value: number };
  u_shift: { value: Vector2 };
  u_focus: { value: number };
  u_streak: { value: number };
};

type Card = {
  source: StageCard;
  frame: HTMLElement;
  root: HTMLElement;
  image: HTMLImageElement;
  footer: HTMLElement | null;
  // Layout in document space (measured on resize, never per frame).
  x: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  rootTop: number;
  rootBottom: number;
  side: -1 | 1;
  // Texture pipeline.
  state: CoverState;
  loading: Promise<void> | null;
  cover: PreparedCover | null;
  crop: CoverCrop | null;
  mesh: Mesh | null;
  uniforms: CardUniforms | null;
  // Opening.
  inRange: boolean;
  time: number;
  focusHeld: boolean;
  focus: Spring;
  // Hover.
  hovered: boolean;
  hoverTime: number;
  blurInLeft: number;
  pointerX: number;
  pointerY: number;
  zoom: Spring;
  tiltX: Spring;
  tiltY: Spring;
  jolt: { x: number; y: number; tx: number; ty: number };
  footerY: number;
  offHover: () => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
// expo.out normalised to end at exactly 1 (plain 1 - 2^-10x stops at
// 0.999, which would leave a 0.03% zoom residue on every card).
const EXPO_END = 1 - 2 ** -10;
const expoOut = (x: number) => (x >= 1 ? 1 : (1 - 2 ** (-10 * x)) / EXPO_END);
const expoOutRate = (x: number) => (x >= 1 ? 0 : (10 * Math.LN2 * 2 ** (-10 * x)) / EXPO_END);

function releaseCover(cover: PreparedCover | null) {
  if (!cover) return;
  if ("close" in cover.source) cover.source.close();
  else cover.source.width = cover.source.height = 0;
}

export type CoverEngineCallbacks = {
  /** The GPU dropped the context: the host should fall back to the DOM. */
  onContextLost: () => void;
};

export class CoverEngine {
  private readonly callbacks: CoverEngineCallbacks;
  private readonly cards = new Map<StageCard, Card>();
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly geometry = new PlaneGeometry(1, 1, SEGMENTS_X, SEGMENTS_Y);
  private readonly shared = {
    u_viewport: { value: new Vector2(1, 1) },
    u_resolution: { value: new Vector2(1, 1) },
    u_lens: { value: 0 },
    u_split: { value: 0 },
    u_alpha: { value: 0 },
  };
  private canvas: HTMLCanvasElement | null = null;
  private renderer: WebGLRenderer | null = null;
  // Never rendered: keeps the one shared program compiled and cached even
  // while no card material exists yet.
  private prototype: ShaderMaterial | null = null;
  private maxTextureSize = 4096;

  private viewportWidth = 0;
  private viewportHeight = 0;
  private pixelRatio = 1;
  private layoutDirty = true;
  private renderDirty = true;
  private lastActive = false;
  private lastAlpha = -1;
  private lastRevealY = Number.NaN;

  private lastScroll: number | null = null;
  private lens = 0;
  private velocity = 0;
  private readonly bow = new Spring(...BOW_SPRING);

  private loads = 0;
  private renders = 0;
  private uploadedThisFrame = false;
  private started = false;
  private disposed = false;
  private offFrame: (() => void) | null = null;
  private readonly offCards: () => void;
  private readonly resizeObserver: ResizeObserver;

  constructor(callbacks: CoverEngineCallbacks) {
    this.callbacks = callbacks;
    this.syncCards();
    this.offCards = onStageCardsChange(() => this.syncCards());
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    // Any layout shift (fonts settling, the footer measuring its title)
    // moves card rects; re-measure on the next frame.
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(document.body);
    document.fonts?.ready.then(this.onResize).catch(() => {});
  }

  /**
   * Starts decoding and cropping the covers that will be on screen first.
   * No GPU work, so it can run while the hero's intro still plays.
   */
  warm() {
    if (this.disposed) return;
    this.measure();
    for (const card of this.firstCards()) this.loadCover(card);
  }

  /**
   * Creates the renderer, compiles the shader and uploads the first
   * screen's covers. Resolves false when WebGL isn't usable after all.
   */
  async prepare(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      this.createRenderer();
    } catch {
      return false;
    }
    this.measure();
    const first = this.firstCards();
    for (const card of first) this.loadCover(card);

    this.prototype = this.createMaterial(null);
    const warmup = new Mesh(this.geometry, this.prototype);
    warmup.frustumCulled = false;
    try {
      // KHR_parallel_shader_compile lets this finish off the main thread.
      await Promise.all([
        this.renderer!.compileAsync(warmup, this.camera),
        ...first.map((card) => card.loading),
      ]);
    } catch {
      return false;
    }
    if (this.disposed || !this.renderer) return false;

    for (const card of first) {
      if (card.state === "prepared") this.upload(card);
      if (card.state === "uploaded") this.attach(card);
    }
    this.renderDirty = true;
    return true;
  }

  /** Begins drawing (the host calls this once the stage owns the covers). */
  start() {
    if (this.disposed || this.started) return;
    this.started = true;
    this.offFrame = addFrameCallback("render", this.frame);
    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, { __projectsStage: this.debugView() });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame?.();
    this.offCards();
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const card of this.cards.values()) this.destroyCard(card);
    this.cards.clear();
    this.prototype?.dispose();
    this.geometry.dispose();
    if (this.canvas) this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    if (this.renderer) {
      const lost = this.renderer.getContext().isContextLost();
      this.renderer.dispose();
      // Release the context now rather than whenever GC gets to it, so
      // repeated visits never pile contexts up.
      if (!lost) this.renderer.forceContextLoss();
    }
    this.canvas?.remove();
    this.renderer = null;
    this.canvas = null;
    if (process.env.NODE_ENV !== "production") {
      Reflect.deleteProperty(window, "__projectsStage");
    }
  }

  // ---------------------------------------------------------------- setup

  private createRenderer() {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.projectsStage = "";
    Object.assign(canvas.style, {
      position: "fixed",
      left: "0",
      top: "0",
      pointerEvents: "none",
      zIndex: CANVAS_Z_INDEX,
    });
    const renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false, // the mask antialiases its own edge
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
    renderer.setClearColor(0x000000, 0);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    document.body.appendChild(canvas);
    this.canvas = canvas;
    this.renderer = renderer;
    this.maxTextureSize = Math.min(renderer.capabilities.maxTextureSize, 8192);
    this.viewportWidth = 0; // force the size sync in measure()
  }

  private createMaterial(texture: Texture | null) {
    const uniforms: CardUniforms = {
      u_map: { value: texture },
      u_mapRect: { value: new Vector4(0, 0, 1, 1) },
      u_rect: { value: new Vector4(0, 0, 1, 1) },
      u_pad: { value: new Vector2() },
      u_offset: { value: new Vector2() },
      u_angle: { value: 0 },
      u_tilt: { value: new Vector2() },
      u_bow: { value: 0 },
      u_show: { value: 1 },
      u_radius: { value: 0 },
      u_mag: { value: 1 },
      u_shift: { value: new Vector2() },
      u_focus: { value: 0 },
      u_streak: { value: 0 },
    };
    return new ShaderMaterial({
      uniforms: { ...uniforms, ...this.shared },
      vertexShader: coverVertexShader,
      fragmentShader: coverFragmentShader,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    });
  }

  private syncCards() {
    const current = new Set(getStageCards());
    for (const [source, card] of this.cards) {
      if (!current.has(source)) {
        this.destroyCard(card);
        this.cards.delete(source);
      }
    }
    for (const source of current) {
      if (this.cards.has(source) || !source.image) continue;
      this.cards.set(source, this.createCard(source, source.image));
    }
    this.layoutDirty = true;
  }

  private createCard(source: StageCard, image: HTMLImageElement): Card {
    // Textures have to be ready before a card scrolls in, so every cover is
    // fetched now instead of whenever native lazy loading gets to it (a
    // lazy image far down the list also held a load slot waiting on a
    // request the browser hadn't started). Only here, where the engine
    // exists: the three.js chunk has landed, so this never competes with
    // it, and touch/DOM visitors keep lazy loading.
    image.loading = "eager";
    const card: Card = {
      source,
      frame: source.frame,
      root: source.root,
      image,
      footer: source.root.querySelector<HTMLElement>("[data-card-footer]"),
      x: 0,
      top: 0,
      width: 0,
      height: 0,
      radius: 0,
      rootTop: 0,
      rootBottom: 0,
      side: source.index % 2 ? 1 : -1,
      state: "idle",
      loading: null,
      cover: null,
      crop: null,
      mesh: null,
      uniforms: null,
      inRange: false,
      time: 0,
      focusHeld: true,
      focus: new Spring(...FOCUS_SPRING, 1),
      hovered: false,
      hoverTime: 0,
      blurInLeft: 0,
      pointerX: 0,
      pointerY: 0,
      zoom: new Spring(...HOVER_SPRING),
      tiltX: new Spring(...TILT_SPRING),
      tiltY: new Spring(...TILT_SPRING),
      jolt: { x: 0, y: 0, tx: 0, ty: 0 },
      footerY: 0,
      offHover: () => {},
    };

    // Hover follows the picture (the frame), like lusion; the DOM frame
    // still gets the events because the canvas above it ignores pointers.
    const enter = () => {
      if (card.state !== "attached") return;
      card.hovered = true;
      card.hoverTime = 0;
      card.blurInLeft = HOVER_BLUR_SECONDS;
    };
    const leave = () => {
      card.hovered = false;
      card.blurInLeft = 0;
    };
    const move = (event: MouseEvent) => {
      if (!card.hovered) return;
      const top = card.top + gridRevealState.y - window.scrollY;
      card.pointerX = clamp((event.clientX - card.x) / card.width - 0.5, -0.5, 0.5);
      card.pointerY = clamp((event.clientY - top) / card.height - 0.5, -0.5, 0.5);
    };
    card.frame.addEventListener("mouseenter", enter);
    card.frame.addEventListener("mouseleave", leave);
    card.frame.addEventListener("mousemove", move);
    card.offHover = () => {
      card.frame.removeEventListener("mouseenter", enter);
      card.frame.removeEventListener("mouseleave", leave);
      card.frame.removeEventListener("mousemove", move);
    };
    return card;
  }

  private destroyCard(card: Card) {
    card.offHover();
    this.detach(card);
    if (card.mesh) this.scene.remove(card.mesh);
    card.uniforms?.u_map.value?.dispose();
    (card.mesh?.material as ShaderMaterial | undefined)?.dispose();
    releaseCover(card.cover);
    card.cover = null;
    card.mesh = null;
    card.uniforms = null;
  }

  // --------------------------------------------------------------- layout

  private readonly onResize = () => {
    this.layoutDirty = true;
  };

  private readonly onVisibility = () => {
    if (!document.hidden) this.renderDirty = true;
  };

  private readonly onContextLost = () => {
    this.callbacks.onContextLost();
  };

  private measure() {
    this.layoutDirty = false;
    const root = document.documentElement;
    const width = root.clientWidth;
    const height = root.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    if (
      this.renderer &&
      this.canvas &&
      (width !== this.viewportWidth || height !== this.viewportHeight || ratio !== this.pixelRatio)
    ) {
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(width, height, false);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.shared.u_viewport.value.set(width, height);
      this.shared.u_resolution.value.set(this.canvas.width, this.canvas.height);
    }
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.pixelRatio = ratio;

    // Document-space rects: the list's reveal rise is a transform on an
    // ancestor, so take it back out; it is added again per frame.
    const offset = window.scrollY - gridRevealState.y;
    for (const card of this.cards.values()) {
      const frame = card.frame.getBoundingClientRect();
      const link = card.root.getBoundingClientRect();
      card.x = frame.left;
      card.top = frame.top + offset;
      card.width = frame.width;
      card.height = frame.height;
      card.rootTop = link.top + offset;
      card.rootBottom = link.bottom + offset;
      card.radius = parseFloat(getComputedStyle(card.frame).borderTopLeftRadius) || 0;
      // Mirror the two columns (a single column alternates).
      const centre = frame.left + frame.width / 2;
      card.side =
        frame.width > width * 0.6 ? (card.source.index % 2 ? 1 : -1) : centre < width / 2 ? -1 : 1;
      this.syncCardUniforms(card);
    }
    this.renderDirty = true;
  }

  private syncCardUniforms(card: Card) {
    const u = card.uniforms;
    if (!u) return;
    u.u_radius.value = card.radius;
    // Room for the lens flare on both sides (at most 7.5% of the width).
    const pad = Math.ceil(card.width * 0.08 + 4);
    u.u_pad.value.set(pad, pad);
    if (card.crop) {
      const [ox, oy, sx, sy] = coverUvRect(card.crop, card.width, card.height);
      u.u_mapRect.value.set(ox, oy, sx, sy);
    }
  }

  private firstCards() {
    const top = -this.viewportHeight * 0.1;
    const bottom = this.viewportHeight * 1.1;
    const offset = gridRevealState.y - window.scrollY;
    return [...this.cards.values()].filter(
      (card) => card.top + offset < bottom && card.top + card.height + offset > top,
    );
  }

  // ------------------------------------------------------------- textures

  private loadCover(card: Card) {
    if (card.state !== "idle") return;
    card.state = "loading";
    this.loads += 1;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    card.loading = prepareCover(card.image, card.width, card.height, ratio, this.maxTextureSize)
      .then((cover) => {
        if (this.disposed) {
          releaseCover(cover);
          return;
        }
        if (!cover) {
          card.state = "failed";
          return;
        }
        card.cover = cover;
        card.crop = cover.crop;
        card.state = "prepared";
      })
      .catch(() => {
        card.state = "failed";
      })
      .finally(() => {
        this.loads -= 1;
      });
  }

  private upload(card: Card) {
    const renderer = this.renderer;
    const cover = card.cover;
    if (!renderer || !cover) return;
    const texture = new Texture(cover.source);
    texture.flipY = false; // the shader samples top-down, like the image rows
    texture.generateMipmaps = false; // uploaded at about display size
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.premultiplyAlpha = !cover.premultiplied;
    texture.needsUpdate = true;

    const material = this.createMaterial(texture);
    const mesh = new Mesh(this.geometry, material);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    this.scene.add(mesh);
    renderer.initTexture(texture);

    // The pixels live on the GPU now; drop the CPU copy.
    releaseCover(cover);
    card.cover = null;
    card.mesh = mesh;
    card.uniforms = material.uniforms as unknown as CardUniforms;
    card.state = "uploaded";
    this.syncCardUniforms(card);
    this.uploadedThisFrame = true;
  }

  /**
   * Hands a card's cover to the stage. Only ever while the list is still
   * hidden or the card is off screen, so the swap from the DOM picture
   * (1.0x) to the GL one (1.026x overscan) is never seen.
   */
  private attach(card: Card) {
    card.state = "attached";
    card.frame.dataset.stage = "gl";
    this.renderDirty = true;
  }

  private detach(card: Card) {
    if (card.state === "attached") card.state = "uploaded";
    delete card.frame.dataset.stage;
    if (card.footer && card.footerY !== 0) gsap.set(card.footer, { clearProps: "transform" });
    card.footerY = 0;
  }

  // ---------------------------------------------------------------- frame

  private beginOpening(card: Card) {
    card.time = 0;
    card.focusHeld = true;
    // Blurred, "previously aiming at" blurred: releasing it toward sharp
    // gives the spring its kick.
    card.focus.reset(1, 1);
  }

  private endOpening(card: Card) {
    card.time = 0;
    card.focusHeld = true;
    card.focus.reset(1, 1);
    card.hovered = false;
    card.blurInLeft = 0;
    card.zoom.reset(0);
    card.tiltX.reset(0);
    card.tiltY.reset(0);
    card.jolt.x = card.jolt.y = card.jolt.tx = card.jolt.ty = 0;
  }

  private moveFooter(card: Card, y: number) {
    if (!card.footer) return;
    const rounded = Math.round(y * 100) / 100;
    if (rounded === card.footerY) return;
    card.footerY = rounded;
    if (rounded === 0) gsap.set(card.footer, { clearProps: "transform" });
    else gsap.set(card.footer, { y: rounded, force3D: true });
  }

  private readonly frame = (_time: number, dt: number) => {
    const renderer = this.renderer;
    if (this.disposed || !renderer) return;
    if (this.layoutDirty) this.measure();
    this.uploadedThisFrame = false;

    const vw = this.viewportWidth;
    const vh = this.viewportHeight;
    const scrollY = window.scrollY;
    const moved = this.lastScroll === null ? 0 : scrollY - this.lastScroll;
    this.lastScroll = scrollY;
    // A jump of more than a screen in one frame is a teleport (End key, an
    // anchor, a programmatic jump), not motion: it moves the covers but
    // feeds none of the scroll physics.
    const delta = Math.abs(moved) > vh ? 0 : moved;

    // Lens.
    this.lens = Math.min(1, (this.lens + Math.abs(delta) / vh) * Math.exp(-LENS_DECAY * dt));
    if (this.lens < 1e-4) this.lens = 0;
    const lens = Math.min(LENS_MAX, this.lens * 0.5);
    this.shared.u_lens.value = lens;
    const splitT = clamp((lens - 0.06) / 0.09, 0, 1);
    this.shared.u_split.value = SPLIT_MAX * splitT * splitT * (3 - 2 * splitT);

    // Bend.
    if (dt > 0)
      this.velocity += (delta / dt - this.velocity) * (1 - Math.exp(-VELOCITY_SMOOTHING * dt));
    if (delta === 0 && Math.abs(this.velocity) < 1) this.velocity = 0;
    const speed = Math.abs(this.velocity);
    const bowTarget =
      Math.sign(this.velocity) *
      BOW_MAX *
      (1 - Math.exp(-Math.max(0, speed - BOW_DEADZONE) / BOW_SOFTNESS));
    this.bow.step(dt, bowTarget);
    this.bow.value = clamp(this.bow.value, -BOW_LIMIT, BOW_LIMIT);
    this.bow.settle(0.01);
    let bow = this.bow.value;
    if (process.env.NODE_ENV !== "production") {
      // Verification scripts isolate effects through this (dev builds only).
      const tuning = (window as { __projectsStageTuning?: { bow?: number } }).__projectsStageTuning;
      if (tuning?.bow !== undefined) bow *= tuning.bow;
    }

    const revealed = gridRevealState.started;
    const alpha = gridRevealState.opacity;
    const revealY = gridRevealState.y;
    this.shared.u_alpha.value = alpha;

    let active =
      this.renderDirty ||
      moved !== 0 ||
      lens > 0 ||
      !this.bow.atRest ||
      alpha !== this.lastAlpha ||
      revealY !== this.lastRevealY;
    this.renderDirty = false;
    this.lastAlpha = alpha;
    this.lastRevealY = revealY;

    const offset = revealY - scrollY;
    for (const card of this.cards.values()) {
      const top = card.top + offset;
      const bottom = top + card.height;
      const inRange = card.rootBottom + offset > 0 && card.rootTop + offset < vh;

      // Stream covers in ahead of the viewport, one upload per frame.
      if (
        card.state === "idle" &&
        this.loads < MAX_CONCURRENT_LOADS &&
        top < vh * (1 + PRELOAD_AHEAD) &&
        bottom > -vh * PRELOAD_BEHIND
      ) {
        this.loadCover(card);
      }
      if (card.state === "prepared" && !this.uploadedThisFrame) this.upload(card);
      if (card.state === "uploaded" && (!revealed || !inRange)) this.attach(card);
      if (card.state !== "attached" || !card.mesh || !card.uniforms) {
        card.inRange = inRange;
        continue;
      }

      // The opening replays whenever the card comes back after having been
      // fully out of view, from either direction.
      if (revealed && inRange !== card.inRange) {
        if (inRange) this.beginOpening(card);
        else this.endOpening(card);
      }
      card.inRange = inRange;
      if (!revealed) {
        card.mesh.visible = false;
        continue;
      }
      if (inRange) card.time += dt;

      const visible = inRange && top < vh && bottom > 0;
      card.mesh.visible = visible;
      if (!visible) {
        this.moveFooter(card, 0);
        continue;
      }

      // Opening curves.
      const showX = Math.min(card.time / SHOW_SECONDS, 1);
      const show = expoOut(showX);
      const settle = expoOut(Math.min(card.time / SETTLE_SECONDS, 1));
      const zoomBase = mix(ZOOM_FROM, 1, show);
      const magRate =
        ((1 - ZOOM_FROM) * (expoOutRate(showX) / SHOW_SECONDS)) / (zoomBase * zoomBase);
      const streak = Math.min(STREAK_MAX, magRate * STREAK_GAIN);

      // Focus: hold, then release toward sharp (or a hover's blur-in).
      if (card.focusHeld) {
        const onScreen = (Math.min(bottom, vh) - Math.max(top, 0)) / card.height;
        if (onScreen >= FOCUS_HOLD_VISIBLE || card.time >= FOCUS_HOLD_SECONDS)
          card.focusHeld = false;
      }
      if (!card.focusHeld) {
        let target = 0;
        if (card.blurInLeft > 0) {
          target = HOVER_BLUR;
          card.blurInLeft -= dt;
        }
        card.focus.step(dt, target);
        if (target === 0) card.focus.settle(FOCUS_EPSILON);
      }

      // Hover springs.
      const hovered = card.hovered;
      card.zoom.step(dt, hovered ? HOVER_ZOOM : 0);
      card.zoom.settle(1e-4);
      card.tiltX.step(dt, hovered ? -card.pointerY * 2 * TILT_MAX : 0);
      card.tiltY.step(dt, hovered ? card.pointerX * 2 * TILT_MAX : 0);
      card.tiltX.settle(1e-5);
      card.tiltY.settle(1e-5);
      const jolt = card.jolt;
      let kicked = false;
      if (hovered) {
        const before = card.hoverTime;
        card.hoverTime += dt;
        JOLT_TIMES.forEach((at, i) => {
          if (before < at && card.hoverTime >= at) {
            // Two small handheld "camera" kicks, the second one weaker.
            const angle = randomBetween(0, Math.PI * 2);
            const size = i === 0 ? 0.667 : 0.25;
            jolt.tx = Math.cos(angle) * size;
            jolt.ty = Math.sin(angle) * size;
            kicked = true;
          }
        });
      } else {
        card.hoverTime = 0;
      }
      if (!kicked) {
        const decay = Math.exp(-3.1 * dt);
        jolt.tx *= decay;
        jolt.ty *= decay;
      }
      const follow = 1 - Math.exp(-13.4 * dt);
      jolt.x += (jolt.tx - jolt.x) * follow;
      jolt.y += (jolt.ty - jolt.y) * follow;
      if (
        Math.max(Math.abs(jolt.x), Math.abs(jolt.y), Math.abs(jolt.tx), Math.abs(jolt.ty)) < 2e-3
      ) {
        jolt.x = jolt.y = jolt.tx = jolt.ty = 0;
      }

      const u = card.uniforms;
      const mag = 1 / (zoomBase * mix(REST_ZOOM, 1, card.zoom.value));
      // Never shift past the pixels the texture actually has.
      const spare = 0.5 - 0.5 / mag;
      const rect = u.u_mapRect.value;
      const maxX = spare + rect.x / rect.z;
      const maxY = spare + rect.y / rect.w;
      const shiftX = jolt.x * JOLT_UV - (card.tiltY.value / TILT_MAX) * PARALLAX;
      const shiftY = jolt.y * JOLT_UV + (card.tiltX.value / TILT_MAX) * PARALLAX;

      u.u_rect.value.set(card.x, top, card.width, card.height);
      u.u_offset.value.set((1 - settle) * -card.side * SLIDE * vw, 0);
      u.u_angle.value = (1 - settle) * card.side * TILT_IN;
      u.u_tilt.value.set(card.tiltX.value, card.tiltY.value);
      u.u_bow.value = bow;
      u.u_show.value = show;
      u.u_mag.value = mag;
      u.u_shift.value.set(clamp(shiftX, -maxX, maxX), clamp(shiftY, -maxY, maxY));
      u.u_focus.value = Math.abs(card.focus.value) * FOCUS_PX;
      u.u_streak.value = streak < 0.01 ? 0 : streak;

      this.moveFooter(card, bow * FOOTER_BOW);

      if (
        card.time < SETTLE_SECONDS ||
        card.focusHeld ||
        !card.focus.atRest ||
        card.blurInLeft > 0 ||
        !card.zoom.atRest ||
        !card.tiltX.atRest ||
        !card.tiltY.atRest ||
        jolt.x !== 0 ||
        jolt.y !== 0 ||
        (hovered && card.hoverTime <= JOLT_TIMES[JOLT_TIMES.length - 1])
      ) {
        active = true;
      }
    }

    // One extra frame after everything settles draws the exact rest state.
    if (active || this.lastActive || this.uploadedThisFrame) {
      renderer.render(this.scene, this.camera);
      this.renders += 1;
    }
    this.lastActive = active;
  };

  // ---------------------------------------------------------------- debug

  private debugView() {
    return {
      cards: () =>
        [...this.cards.values()].map((card) => ({
          index: card.source.index,
          state: card.state,
          inRange: card.inRange,
          time: card.time,
          hovered: card.hovered,
          visible: card.mesh?.visible ?? false,
          focus: card.uniforms?.u_focus.value ?? null,
          focusSpring: card.focus.value,
          streak: card.uniforms?.u_streak.value ?? null,
          mag: card.uniforms?.u_mag.value ?? null,
          show: card.uniforms?.u_show.value ?? null,
          angle: card.uniforms?.u_angle.value ?? null,
          offset: card.uniforms?.u_offset.value.x ?? null,
          tilt: card.uniforms ? [card.uniforms.u_tilt.value.x, card.uniforms.u_tilt.value.y] : null,
          shift: card.uniforms
            ? [card.uniforms.u_shift.value.x, card.uniforms.u_shift.value.y]
            : null,
          footerY: card.footerY,
        })),
      lens: () => this.shared.u_lens.value,
      bow: () => this.bow.value,
      alpha: () => this.shared.u_alpha.value,
      renders: () => this.renders,
    };
  }
}
