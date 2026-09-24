import gsap from "gsap";
import {
  Color,
  ColorManagement,
  Group,
  LinearSRGBColorSpace,
  PerspectiveCamera,
  Scene,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";

import { CameraRig } from "@/components/articles/world/camera-rig";
import { CardsLayer } from "@/components/articles/world/cards/cards-layer";
import {
  PULSE_SLOTS,
  createComposite,
  type Composite,
} from "@/components/articles/world/fx/composite";
import {
  FRONT_BAND,
  FRONT_SECONDS,
  frontEase,
  frontEdge,
  frontReach,
  type ThemeFront,
} from "@/components/articles/world/fx/theme-front";
import {
  createLibraryEnvironment,
  type LibraryEnvironment,
} from "@/components/articles/world/library/environment";
import { WORLD_PALETTE, hexToUnit } from "@/components/articles/world/palette";
import {
  createCursorMagic,
  type CursorMagic,
} from "@/components/articles/world/particles/cursor-magic";
import { QualityGovernor, type QualityLevel } from "@/components/articles/world/quality";
import type {
  ArticlesWorldApi,
  QualityTier,
  WorldFrame,
  WorldFxApi,
  WorldGL,
  WorldLayer,
  WorldRoute,
  WorldTransitionApi,
} from "@/components/articles/world/world-api";
import { createWorldUniforms, type WorldUniforms } from "@/components/articles/world/world-glsl";
import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import {
  isArticleCoverActive,
  isArticleTransitionBusy,
  onArticleTransitionChange,
} from "@/lib/article-transition";
import type { ProjectPalette } from "@/lib/project-themes";
import { random } from "@/lib/random";

/**
 * The library world: one fixed, full-viewport three.js canvas behind the
 * articles pages, alive for as long as the visitor stays in /articles and
 * /articles/<slug> (app/articles/layout.tsx keeps its host mounted across
 * those navigations, so transitions can play inside one continuous scene).
 *
 * Space: the camera sits `CAMERA_DISTANCE` CSS px in front of the card plane
 * (z = 0), with a field of view that makes one world unit one CSS px there,
 * so DOM rects map straight onto the plane. The library is modelled in its
 * own units and scaled with the viewport.
 *
 * Frame: one callback on the shared frame loop's "render" phase, which runs
 * after every "scroll" callback (Lenis) in the same tick, so the canvas and
 * the DOM never disagree by a frame (docs/animation-system.md gotcha #17).
 * The scene renders to an 8-bit target, then the screen pass (lens, motion
 * blur, grain, the transition wipe) draws it to the canvas. Nothing in the
 * per-frame path allocates.
 *
 * Quality: the start level comes from a device guess; the governor
 * (quality.ts) then watches real frame times and steps the pixel ratio and
 * the tier down while frames miss.
 *
 * Routes: the list wears the full lens and the lively camera; an article
 * wears grain only, a quieter camera and thicker fog. While an articles
 * transition runs, the lens and the cards belong to it (it drives them
 * through `transition`), so a route change mid-transition only moves the
 * eased targets, and the rest applies when the transition lets go.
 *
 * Colour: the whole pipeline stays in display sRGB (colour management off,
 * raw textures), like the project cover stage, so palette hex values show
 * exactly as written.
 */

const CAMERA_DISTANCE = 2000;
/** Most device pixels drawn per frame, whatever the screen. */
const MAX_PIXELS = 2560 * 1600;
/** The lens at rest (about 17 px of fringe in a 1440 px corner, like unseen.co's). */
const REST_DISTORT = -0.05;
/** A first visit starts this warped and settles (unseen's 5 to 0.4 is 12.5 times). */
const SETTLE_DISTORT = REST_DISTORT * 12.5;
/** Seconds the camera, fog and particles take to follow a route change. */
const ROUTE_EASE_SECONDS = 1;
/** Most sparks a theme front throws per frame, by tier (the ring buffer's size bounds them). */
const FRONT_SPARKS: Record<QualityTier, number> = { high: 12, medium: 8, low: 5 };

export type LibraryEngineOptions = {
  tier: QualityTier;
  dark: boolean;
  route: WorldRoute;
  onContextLost: () => void;
  /** Locks the governor (the `?worldtier=` and `?worlddpr=` overrides). */
  lockQuality?: boolean;
  /** Pixel ratio override. */
  pixelRatio?: number | null;
};

function transitionOwnsTheLens() {
  return isArticleTransitionBusy() || isArticleCoverActive();
}

/** Frame-rate independent smoothing: reaches ~63% of the way in `seconds`. */
function follow(seconds: number, dt: number) {
  return 1 - Math.exp(-dt / Math.max(seconds, 1e-3));
}

export class LibraryEngine implements ArticlesWorldApi {
  readonly canvas: HTMLCanvasElement;
  readonly cards: CardsLayer;
  readonly transition: WorldTransitionApi;
  readonly fx: WorldFxApi;
  readonly gl: WorldGL;

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly overlay = new Scene();
  private readonly layers: { layer: WorldLayer; order: number }[] = [];
  private readonly pointerState = { x: 0, y: 0 };
  private readonly frameState: WorldFrame = {
    time: 0,
    dt: 0,
    scrollY: 0,
    scrollSpeed: 0,
    width: 1,
    height: 1,
    pixelRatio: 1,
    pointer: null,
    pointerSpeed: 0,
    scrolling: false,
  };
  private hasPointer = false;
  private readonly pointerPrevious = { x: 0, y: 0 };
  private hadPointer = false;
  private pointerSpeed = 0;
  private blurAmount = 1;
  private readonly lensState = { distort: REST_DISTORT };
  private lensTween: gsap.core.Tween | null = null;
  private readonly camera: PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly uniforms: WorldUniforms;
  private readonly environment: LibraryEnvironment;
  private readonly envGroup = new Group();
  private readonly cardGroup = new Group();
  private readonly composite: Composite;
  private readonly magic: CursorMagic;
  private target: WebGLRenderTarget;
  private readonly governor: QualityGovernor;
  private level: QualityLevel;
  private readonly pixelRatioOverride: number | null;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private route: WorldRoute;
  /** Half the nave's width, CSS px at the card plane: measured target and eased value. */
  private frameTarget = 0;
  private frameHalf = 0;
  private framesSinceMeasure = 0;
  private head: HTMLElement | null = null;
  private influenceTarget = 1;
  private detailTarget = 0;
  private offFrame: (() => void) | null = null;
  private offBusy: (() => void) | null = null;
  private paused = false;
  private disposed = false;
  private time = 0;
  private lastFrameAt = 0;
  private lastScroll = 0;
  private scrollSpeed = 0;
  /** The theme switch's front in flight (setScheme with a wave). */
  private readonly wave = {
    active: false,
    /** The page's DOM flips behind a clip that follows the front (a view transition). */
    masked: false,
    x: 0,
    y: 0,
    elapsed: 0,
    reach: 1,
    to: 0,
    flooding: false,
    /** How far the front must spread to reach the great window on screen. */
    floodAt: 0,
  };
  private readonly frontState: ThemeFront = { x: 0, y: 0, radius: 0, time: 0, to: 0 };
  /** Seconds since the dawn reached the window (negative: no flood). */
  private floodAge = -1;
  private readonly envGroupPoint = new Vector3();
  private pulseSlot = 0;
  private themeTween: gsap.core.Tween | null = null;
  private readonly themeState = { value: 0 };
  private readonly fogLight = new Color();
  private readonly fogDark = new Color();
  private readonly scratch = new Color();
  private readonly scratchTheme = new Color();
  private readonly clearColor = new Color();
  private readonly onContextLost: () => void;

  constructor(options: LibraryEngineOptions) {
    this.onContextLost = options.onContextLost;
    this.pixelRatioOverride = options.pixelRatio ?? null;
    ColorManagement.enabled = false;

    this.governor = new QualityGovernor(options.tier, (level) => this.applyLevel(level), {
      locked: options.lockQuality,
    });
    this.level = this.governor.level;

    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.dataset.articlesWorldCanvas = "";
    Object.assign(this.canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      zIndex: "0",
      pointerEvents: "none",
      display: "block",
    });

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.autoClear = true;
    // One frame is several render calls (scene, screen pass, overlay):
    // count them together, reset at the start of each frame.
    this.renderer.info.autoReset = false;

    this.uniforms = createWorldUniforms();
    this.uniforms.uDark.value = options.dark ? 1 : 0;
    this.fogLight.setRGB(...hexToUnit(WORLD_PALETTE.light.fog));
    this.fogDark.setRGB(...hexToUnit(WORLD_PALETTE.dark.fog));

    this.camera = new PerspectiveCamera(25, 1, 50, 80000);
    this.rig = new CameraRig(this.camera, CAMERA_DISTANCE);

    this.environment = createLibraryEnvironment(this.uniforms, this.level.tier);
    this.envGroup.add(this.environment.group);
    this.scene.add(this.envGroup, this.cardGroup);

    this.composite = createComposite(this.uniforms);
    this.target = new WebGLRenderTarget(1, 1, { type: UnsignedByteType, depthBuffer: true });

    this.magic = createCursorMagic({
      world: this.uniforms,
      camera: this.camera,
      viewport: () => ({ width: this.width, height: this.height }),
      tier: this.level.tier,
      random,
    });
    this.scene.add(this.magic.paper.mesh, this.magic.sparks.points);

    this.cards = new CardsLayer({
      group: this.cardGroup,
      renderer: this.renderer,
      world: this.uniforms,
      pixelRatio: () => this.pixelRatio,
      viewport: () => ({ width: this.width, height: this.height }),
    });

    this.transition = {
      setPan: (px) => {
        this.rig.offset.x = px;
      },
      setWipe: (progress, color) => {
        this.composite.uniforms.uWipe.value = progress;
        this.composite.uniforms.uWipeColor.value.set(color);
      },
      setLensAmount: (amount) => {
        this.composite.uniforms.uLens.value = amount;
      },
      setFogSwallow: (amount) => {
        this.uniforms.uSwallow.value = amount;
      },
      setCardsVisible: (visible) => this.cards.setVisible(visible),
      setLift: (px) => {
        this.rig.offset.y = px;
      },
      setDolly: (px) => {
        this.rig.offset.z = px;
      },
    };

    this.fx = {
      settleLens: (seconds = 1.5) => {
        this.lensTween?.kill();
        this.lensState.distort = SETTLE_DISTORT;
        this.lensTween = gsap.to(this.lensState, {
          distort: REST_DISTORT,
          duration: seconds,
          ease: "power2.out",
        });
      },
      setBlurAmount: (amount) => {
        this.blurAmount = amount;
      },
      pulse: (x, y, strength = 1) => {
        // A ring on the screen pass (the oldest slot gives way) and a burst of motes.
        const slots = this.composite.uniforms.uPulses.value;
        slots[this.pulseSlot].set(x, y, this.time, Math.max(0.05, strength));
        this.pulseSlot = (this.pulseSlot + 1) % PULSE_SLOTS;
        this.magic.burst(x, y, Math.round(26 * strength), 0.8 + strength * 0.4);
      },
      swarm: (x, y) => this.magic.swarm(x, y),
    };

    this.gl = {
      scene: this.scene,
      overlay: this.overlay,
      camera: this.camera,
      renderer: this.renderer,
      uniforms: this.uniforms,
    };

    this.route = options.route;
    this.applyRoute(true);
    this.rig.influence = this.influenceTarget;
    this.uniforms.uDetail.value = this.detailTarget;
    // When a transition lets go, the route it left the world on takes over
    // the lens and the cards.
    this.offBusy = onArticleTransitionChange(() => {
      if (!transitionOwnsTheLens()) this.applyRoute(false);
    });

    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    document.addEventListener("mouseout", this.onMouseOut);
    window.addEventListener("blur", this.onPointerLeave);
    this.resize();
    document.body.appendChild(this.canvas);
    this.lastScroll = window.scrollY;

    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, {
        __articlesWorld: {
          engine: this,
          uniforms: this.uniforms,
          composite: this.composite.uniforms,
          rig: this.rig,
          info: () => this.renderer.info,
          stats: () => this.stats(),
        },
      });
    }
  }

  get tier(): QualityTier {
    return this.level.tier;
  }

  /**
   * Compiles every program the first frames need (off the main thread where
   * the driver can), then starts the frame loop. The host publishes the
   * world only after this, so its first frame doesn't hitch.
   */
  async start() {
    const warm = (async () => {
      try {
        await this.renderer.compileAsync(this.scene, this.camera);
        await this.renderer.compileAsync(this.composite.scene, this.composite.camera);
      } catch {
        // A failed warm-up is not fatal: programs then compile on first draw.
      }
    })();
    // Never wait on a slow driver for long: the rest compiles on first draw.
    await Promise.race([warm, new Promise((resolve) => window.setTimeout(resolve, 2500))]);
    if (this.disposed) return;
    this.lastFrameAt = performance.now();
    this.offFrame = addFrameCallback("render", this.frame);
  }

  addLayer(layer: WorldLayer, order = 0) {
    const entry = { layer, order };
    this.layers.push(entry);
    this.layers.sort((a, b) => a.order - b.order);
    return () => {
      const index = this.layers.indexOf(entry);
      if (index < 0) return;
      this.layers.splice(index, 1);
      layer.dispose();
    };
  }

  frameInfo() {
    return this.frameState;
  }

  setRoute(route: WorldRoute) {
    this.route = route;
    this.applyRoute(false);
  }

  setScheme(dark: boolean, options?: { wave?: { x: number; y: number }; masked?: boolean }) {
    const target = dark ? 1 : 0;
    const u = this.uniforms;
    // A wave cut short lands where it was going first, like the page's DOM
    // does (a second view transition starts from the first one's end).
    if (this.wave.active) this.endWave();
    if (!options?.wave || u.uDark.value === target) {
      u.uDark.value = target;
      return;
    }
    const { x, y } = options.wave;
    const wave = this.wave;
    wave.active = true;
    wave.masked = options.masked ?? false;
    wave.x = x;
    wave.y = y;
    wave.elapsed = 0;
    wave.reach = frontReach(x, y, this.width, this.height);
    wave.to = target;
    wave.flooding = false;
    u.uWaveFrom.value = u.uDark.value;
    u.uWaveTo.value = target;
    u.uWave.value.set(x, y, 0, 1);
    // Where the dawn floods from: the heart of the great window on screen.
    this.envGroupPoint.copy(this.environment.windowAnchor);
    this.environment.group.localToWorld(this.envGroupPoint).project(this.camera);
    const bloom = this.composite.uniforms.uBloomAt.value;
    bloom.set(
      (this.envGroupPoint.x * 0.5 + 0.5) * this.width,
      (0.5 - this.envGroupPoint.y * 0.5) * this.height,
    );
    wave.floodAt = Math.hypot(bloom.x - x, bloom.y - y);
  }

  /**
   * The theme front in flight (the DOM's clip follows it every frame), or
   * null when no switch is running.
   */
  waveFront(): ThemeFront | null {
    const wave = this.wave;
    if (!wave.active) return null;
    const front = this.frontState;
    front.x = wave.x;
    front.y = wave.y;
    front.radius = this.uniforms.uWave.value.z;
    front.time = this.time;
    front.to = wave.to;
    return front;
  }

  setTheme(theme: { light: ProjectPalette; dark: ProjectPalette } | null, seconds = 0.8) {
    const u = this.uniforms;
    this.themeTween?.kill();
    if (theme) {
      u.uThemeLight.value.setRGB(...hexToUnit(theme.light.bg));
      u.uThemeDark.value.setRGB(...hexToUnit(theme.dark.bg));
    }
    this.themeState.value = u.uTheme.value;
    this.themeTween = gsap.to(this.themeState, {
      value: theme ? 1 : 0,
      duration: seconds,
      ease: "power2.inOut",
      onUpdate: () => {
        u.uTheme.value = this.themeState.value;
      },
    });
  }

  colorAt(x: number, y: number): [number, number, number] {
    const u = this.uniforms;
    const dark = this.darkAtPoint(x, y);
    this.scratch.copy(this.fogLight).lerp(this.fogDark, dark);
    this.scratchTheme.copy(u.uThemeLight.value).lerp(u.uThemeDark.value, dark);
    this.scratch.lerp(this.scratchTheme, u.uTheme.value);
    return [
      Math.round(this.scratch.r * 255),
      Math.round(this.scratch.g * 255),
      Math.round(this.scratch.b * 255),
    ];
  }

  /** What the last frame cost (dev probe and the verification scripts). */
  stats() {
    const { render, memory, programs } = this.renderer.info;
    return {
      tier: this.level.tier,
      pixelRatio: this.pixelRatio,
      settled: this.governor.settled,
      calls: render.calls,
      triangles: render.triangles,
      points: render.points,
      geometries: memory.geometries,
      textures: memory.textures,
      programs: programs?.length ?? 0,
      layers: this.layers.length,
    };
  }

  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.lastFrameAt = performance.now();
    this.governor.rest();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame?.();
    this.offFrame = null;
    this.offBusy?.();
    this.offBusy = null;
    for (const { layer } of this.layers.splice(0)) layer.dispose();
    this.lensTween?.kill();
    this.themeTween?.kill();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("mouseout", this.onMouseOut);
    window.removeEventListener("blur", this.onPointerLeave);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.cards.dispose();
    this.magic.dispose();
    this.environment.dispose();
    this.composite.dispose();
    this.target.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    if (process.env.NODE_ENV !== "production") {
      delete (window as { __articlesWorld?: unknown }).__articlesWorld;
    }
  }

  // ---------------------------------------------------------------- internals

  /**
   * The scheme at a viewport point, the way darkAt() sees it. While the
   * page's DOM flips behind a view-transition clip, the only live DOM on
   * screen is the part the front has already reached, so what sits behind
   * it is the new scheme wherever it shows.
   */
  private darkAtPoint(x: number, y: number) {
    const u = this.uniforms;
    const wave = u.uWave.value;
    if (wave.w < 0.5) return u.uDark.value;
    if (this.wave.masked) return u.uWaveTo.value;
    const distance = Math.hypot(x - wave.x, y - wave.y) + frontEdge(x, y, this.time) - wave.z;
    const t = Math.min(1, Math.max(0, (FRONT_BAND - distance) / (2 * FRONT_BAND)));
    const k = t * t * (3 - 2 * t);
    return u.uWaveFrom.value + (u.uWaveTo.value - u.uWaveFrom.value) * k;
  }

  /** The front lands: the scheme it brought is the resting one now. */
  private endWave() {
    const u = this.uniforms;
    this.wave.active = false;
    this.wave.masked = false;
    u.uDark.value = this.wave.to;
    u.uWave.value.w = 0;
    this.composite.uniforms.uShiver.value = 0;
  }

  /**
   * Moves a theme front one frame: its radius (the DOM's clip reads it
   * back), the sparks racing along its edge, a night-fall's chromatic
   * shiver, and the dawn's flood of light once it reaches the window.
   */
  private updateWave(dt: number) {
    const wave = this.wave;
    const fx = this.composite.uniforms;
    if (wave.active) {
      wave.elapsed += dt;
      const p = Math.min(1, wave.elapsed / FRONT_SECONDS);
      const radius = wave.reach * frontEase(p);
      this.uniforms.uWave.value.z = radius;
      const falling = wave.to > 0.5;
      fx.uShiver.value = falling ? Math.sin(Math.PI * Math.min(1, p / 0.55)) ** 2 * 0.85 : 0;
      if (!falling && !wave.flooding && radius >= wave.floodAt) {
        wave.flooding = true;
        this.floodAge = 0;
      }
      // Sparks along the part of the edge on screen, as many as its length
      // asks for, capped by the tier.
      const arc = Math.min(Math.PI * 2 * radius, 2 * (this.width + this.height));
      const cap = FRONT_SPARKS[this.level.tier];
      const front = this.waveFront();
      if (front) this.magic.front(front, Math.min(cap, arc * dt * 0.32), this.width, this.height);
      if (p >= 1) this.endWave();
    }
    const flood = this.environment.uniforms.uFlood;
    if (this.floodAge >= 0) {
      this.floodAge += dt;
      const age = this.floodAge;
      const rise = Math.min(1, age / 0.35);
      const value = age < 0.35 ? rise * rise * (3 - 2 * rise) : Math.exp(-(age - 0.35) / 0.7);
      flood.value = value;
      fx.uBloom.value = value * 0.9;
      if (age > 4) {
        this.floodAge = -1;
        flood.value = 0;
        fx.uBloom.value = 0;
      }
    }
  }

  /**
   * Where the walls stand: just outside the list's columns, measured from
   * the cards on screen (their links, the list's contract), so the arcade
   * frames the list whatever widths the list gives its cards. Without cards
   * (an article, an empty list) the walls stay where they were, or take a
   * guess from the viewport on a first visit.
   */
  private measureFrame(snap: boolean) {
    this.framesSinceMeasure = 0;
    this.head = document.querySelector<HTMLElement>("[data-articles-head]");
    const width = this.width;
    const centre = width / 2;
    let extent = 0;
    const cards = document.querySelectorAll<HTMLElement>("a[data-article-card]");
    for (let i = 0; i < cards.length && i < 6; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (rect.width < 1) continue;
      extent = Math.max(extent, Math.abs(rect.left - centre), Math.abs(rect.right - centre));
    }
    if (extent === 0) {
      if (this.frameTarget > 0 && !snap) return;
      extent =
        width >= 1024
          ? Math.min(width * 0.4, 900)
          : width >= 768
            ? 246
            : Math.min(width * 0.44, 240);
    }
    const gutter = Math.min(70, Math.max(14, width * 0.03));
    this.frameTarget = Math.min(extent + gutter, width * 0.5 + 40);
    if (snap || this.frameHalf === 0) {
      this.frameHalf = this.frameTarget;
      this.environment.setNaveHalfWidth(this.frameHalf / this.uniforms.uEnvScale.value);
    }
  }

  /**
   * Follows the list's fixed head (it slides away in transitions) so the
   * screen pass can keep a veil of mist behind it.
   */
  private veilHead() {
    const veil = this.composite.uniforms.uHead.value;
    const head = this.head?.isConnected ? this.head : null;
    if (!head) {
      veil.w = 0;
      return;
    }
    const rect = head.getBoundingClientRect();
    const opacity = Number.parseFloat(head.style.opacity || "1");
    const strength = rect.height > 0 && rect.right > 0 && rect.left < this.width ? 0.78 : 0;
    veil.set(
      rect.left,
      rect.right,
      rect.bottom,
      strength * (Number.isFinite(opacity) ? opacity : 1),
    );
  }

  /**
   * Dresses the world for the route. The camera, fog and particle targets
   * always move (they ease); the lens and the cards only when no transition
   * holds them, or on the first frame.
   */
  private applyRoute(initial: boolean) {
    const detail = this.route.kind === "detail";
    this.influenceTarget = detail ? 0.35 : 1;
    this.detailTarget = detail ? 1 : 0;
    if (!initial && transitionOwnsTheLens()) return;
    this.composite.uniforms.uLens.value = detail ? 0 : 1;
    this.cards.setVisible(!detail);
  }

  private applyLevel(level: QualityLevel) {
    const tierChanged = level.tier !== this.level.tier;
    this.level = level;
    if (tierChanged) {
      this.environment.setTier(level.tier);
      this.magic.setTier(level.tier);
    }
    this.resize();
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.onContextLost();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointerState.x = event.clientX;
    this.pointerState.y = event.clientY;
    this.hasPointer = true;
    if (event.pointerType === "touch") return;
    this.rig.pointer.x = (event.clientX / this.width) * 2 - 1;
    this.rig.pointer.y = -((event.clientY / this.height) * 2 - 1);
  };

  /** The pointer left the window (mouseout to nowhere). */
  private readonly onMouseOut = (event: MouseEvent) => {
    if (!event.relatedTarget) this.onPointerLeave();
  };

  private readonly onPointerLeave = () => {
    this.hasPointer = false;
    this.rig.pointer.x = 0;
    this.rig.pointer.y = 0;
  };

  private readonly resize = () => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const cap = this.pixelRatioOverride ?? this.level.pixelRatio;
    const budget = Math.sqrt(MAX_PIXELS / (width * height));
    this.pixelRatio = Math.max(0.5, Math.min(window.devicePixelRatio || 1, cap, budget));
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.target.setSize(Math.round(width * this.pixelRatio), Math.round(height * this.pixelRatio));

    this.camera.aspect = width / height;
    this.camera.fov = (2 * Math.atan(height / 2 / CAMERA_DISTANCE) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    this.rig.distance = CAMERA_DISTANCE;

    const u = this.uniforms;
    u.uResolution.value.set(width * this.pixelRatio, height * this.pixelRatio);
    u.uPixelRatio.value = this.pixelRatio;
    u.uViewport.value.set(width, height);
    // The library is modelled in units of a ninth of the viewport height,
    // so its storeys and arches keep their proportions on every screen; its
    // walls are moved separately to frame the list (measureFrame).
    const envScale = height / 9;
    u.uEnvScale.value = envScale;
    u.uFogStart.value = CAMERA_DISTANCE;
    u.uFogDensity.value = 0.028 / envScale;
    this.environment.group.scale.setScalar(envScale);
    this.measureFrame(true);
    this.cards.measure();
  };

  private readonly frame = (_time: number, dt: number) => {
    if (this.paused || this.disposed) return;
    const now = performance.now();
    this.governor.sample(now - this.lastFrameAt);
    this.lastFrameAt = now;
    this.renderer.info.reset();
    this.time += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    this.composite.uniforms.uGrainSeed.value = (this.time * 60) % 1000;

    const scrollY = window.scrollY;
    const moved = scrollY - this.lastScroll;
    this.lastScroll = scrollY;
    // A jump (End, an anchor, a route change) moves the cards without
    // feeding any of the speed effects.
    const perSecond = Math.abs(moved) > this.height ? 0 : moved / Math.max(dt, 1 / 240);
    const k = 1 - Math.exp(-dt * 10);
    this.scrollSpeed += (perSecond - this.scrollSpeed) * k;
    const speedVh = this.scrollSpeed / this.height;
    this.composite.uniforms.uBlur.value =
      this.route.kind === "list"
        ? Math.max(-34, Math.min(34, this.scrollSpeed * 0.011)) * this.blurAmount
        : 0;
    this.composite.uniforms.uDistort.value = this.lensState.distort;

    // Route easing: the camera quiets down and the fog thickens on an article.
    const r = follow(ROUTE_EASE_SECONDS / 3, dt);
    this.rig.influence += (this.influenceTarget - this.rig.influence) * r;
    u.uDetail.value += (this.detailTarget - u.uDetail.value) * r;

    if (this.hasPointer && this.hadPointer) {
      const step = Math.hypot(
        this.pointerState.x - this.pointerPrevious.x,
        this.pointerState.y - this.pointerPrevious.y,
      );
      this.pointerSpeed += (step / Math.max(dt, 1 / 240) - this.pointerSpeed) * k;
    } else {
      this.pointerSpeed *= 1 - k;
    }
    this.hadPointer = this.hasPointer;
    this.pointerPrevious.x = this.pointerState.x;
    this.pointerPrevious.y = this.pointerState.y;

    const frame = this.frameState;
    frame.time = this.time;
    frame.dt = dt;
    frame.scrollY = scrollY;
    frame.scrollSpeed = this.scrollSpeed;
    frame.width = this.width;
    frame.height = this.height;
    frame.pixelRatio = this.pixelRatio;
    frame.pointer = this.hasPointer ? this.pointerState : null;
    frame.pointerSpeed = this.pointerSpeed;
    frame.scrolling = Math.abs(this.scrollSpeed) > 30;

    this.framesSinceMeasure += 1;
    if (this.framesSinceMeasure > 40) this.measureFrame(false);
    this.veilHead();
    if (Math.abs(this.frameTarget - this.frameHalf) > 0.25) {
      this.frameHalf += (this.frameTarget - this.frameHalf) * follow(0.35, dt);
      this.environment.setNaveHalfWidth(this.frameHalf / u.uEnvScale.value);
    }

    this.rig.update(dt);
    this.environment.update(this.time, dt, speedVh);
    this.cards.update(scrollY);
    this.magic.setQuiet(u.uDetail.value);
    this.magic.setEnabled(!transitionOwnsTheLens());
    this.updateWave(dt);
    this.magic.update(frame, this.frameHalf);
    for (const { layer } of this.layers) layer.update(frame);

    this.clearColor.copy(this.fogLight).lerp(this.fogDark, u.uDark.value);
    this.scratchTheme.copy(u.uThemeLight.value).lerp(u.uThemeDark.value, u.uDark.value);
    this.clearColor.lerp(this.scratchTheme, u.uTheme.value);
    this.renderer.setClearColor(this.clearColor, 1);

    // The library first, then (depth cleared) the cards and every layer:
    // nothing of the library, not even a gallery reaching out in front of
    // the card plane on a narrow screen, may ever cover a card or a page's
    // own 3D. Draw calls stay the same; only the order is fixed.
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.envGroup, this.camera);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.envGroup.visible = false;
    this.renderer.render(this.scene, this.camera);
    this.envGroup.visible = true;
    this.renderer.autoClear = true;
    this.renderer.setRenderTarget(null);
    this.composite.uniforms.tScene.value = this.target.texture;
    this.renderer.render(this.composite.scene, this.composite.camera);
    if (this.overlay.children.length) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.overlay, this.camera);
      this.renderer.autoClear = true;
    }
  };
}
