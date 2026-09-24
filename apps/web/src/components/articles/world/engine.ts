import gsap from "gsap";
import {
  Color,
  ColorManagement,
  Group,
  LinearSRGBColorSpace,
  PerspectiveCamera,
  Scene,
  UnsignedByteType,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";

import { CameraRig } from "@/components/articles/world/camera-rig";
import { CardsLayer } from "@/components/articles/world/cards/cards-layer";
import { createComposite, type Composite } from "@/components/articles/world/fx/composite";
import {
  createLibraryEnvironment,
  type LibraryEnvironment,
} from "@/components/articles/world/library/environment";
import { WORLD_PALETTE, hexToUnit } from "@/components/articles/world/palette";
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
  private target: WebGLRenderTarget;
  private readonly governor: QualityGovernor;
  private level: QualityLevel;
  private readonly pixelRatioOverride: number | null;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private route: WorldRoute;
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
  private readonly waveState = { radius: 0 };
  private waveTween: gsap.core.Tween | null = null;
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
      pulse: () => {},
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

  setScheme(dark: boolean, options?: { wave?: { x: number; y: number } }) {
    const target = dark ? 1 : 0;
    const u = this.uniforms;
    this.waveTween?.kill();
    if (!options?.wave) {
      u.uWave.value.w = 0;
      u.uDark.value = target;
      return;
    }
    const { x, y } = options.wave;
    const reach = Math.hypot(Math.max(x, this.width - x), Math.max(y, this.height - y)) + 260;
    u.uWaveFrom.value = u.uDark.value;
    u.uWaveTo.value = target;
    u.uWave.value.set(x, y, 0, 1);
    this.waveState.radius = 0;
    this.waveTween = gsap.to(this.waveState, {
      radius: reach,
      duration: 1.6,
      ease: "power2.inOut",
      onUpdate: () => {
        u.uWave.value.z = this.waveState.radius;
      },
      onComplete: () => {
        u.uDark.value = target;
        u.uWave.value.w = 0;
      },
    });
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
    this.waveTween?.kill();
    this.themeTween?.kill();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("mouseout", this.onMouseOut);
    window.removeEventListener("blur", this.onPointerLeave);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.cards.dispose();
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

  /** The scheme at a viewport point, the way darkAt() sees it (without the ragged edge). */
  private darkAtPoint(x: number, y: number) {
    const u = this.uniforms;
    const wave = u.uWave.value;
    if (wave.w < 0.5) return u.uDark.value;
    const distance = Math.hypot(x - wave.x, y - wave.y) - wave.z;
    const t = Math.min(1, Math.max(0, (26 - distance) / 52));
    const k = t * t * (3 - 2 * t);
    return u.uWaveFrom.value + (u.uWaveTo.value - u.uWaveFrom.value) * k;
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
    if (tierChanged) this.environment.setTier(level.tier);
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
    // The library frames the cards like unseen's arcade: its walls sit just
    // outside a two-column list at every width.
    const envScale = Math.max(width * 0.08, height * 0.1);
    u.uEnvScale.value = envScale;
    u.uFogStart.value = CAMERA_DISTANCE;
    u.uFogDensity.value = 0.028 / envScale;
    this.environment.group.scale.setScalar(envScale);
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

    this.rig.update(dt);
    this.environment.update(this.time, dt, speedVh);
    this.cards.update(scrollY);
    for (const { layer } of this.layers) layer.update(frame);

    this.clearColor.copy(this.fogLight).lerp(this.fogDark, u.uDark.value);
    this.scratchTheme.copy(u.uThemeLight.value).lerp(u.uThemeDark.value, u.uDark.value);
    this.clearColor.lerp(this.scratchTheme, u.uTheme.value);
    this.renderer.setClearColor(this.clearColor, 1);

    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
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
