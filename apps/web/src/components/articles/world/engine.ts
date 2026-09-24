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
import type {
  ArticlesWorldApi,
  QualityTier,
  WorldRoute,
  WorldTransitionApi,
} from "@/components/articles/world/world-api";
import { createWorldUniforms, type WorldUniforms } from "@/components/articles/world/world-glsl";
import { addFrameCallback } from "@/components/projects/stage/frame-loop";
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
 * blur, grain, the transition wipe) draws it to the canvas.
 *
 * Colour: the whole pipeline stays in display sRGB (colour management off,
 * raw textures), like the project cover stage, so palette hex values show
 * exactly as written.
 */

const CAMERA_DISTANCE = 2000;
/** Most device pixels drawn per frame, whatever the screen. */
const MAX_PIXELS = 2560 * 1600;
const TIER_PIXEL_RATIO: Record<QualityTier, number> = { high: 1.75, medium: 1.35, low: 1 };

export type LibraryEngineOptions = {
  tier: QualityTier;
  dark: boolean;
  onContextLost: () => void;
};

export class LibraryEngine implements ArticlesWorldApi {
  readonly canvas: HTMLCanvasElement;
  readonly tier: QualityTier;
  readonly cards: CardsLayer;
  readonly transition: WorldTransitionApi;

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly uniforms: WorldUniforms;
  private readonly environment: LibraryEnvironment;
  private readonly envGroup = new Group();
  private readonly cardGroup = new Group();
  private readonly composite: Composite;
  private target: WebGLRenderTarget;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private route: WorldRoute = { kind: "list" };
  private offFrame: (() => void) | null = null;
  private paused = false;
  private disposed = false;
  private time = 0;
  private lastScroll = 0;
  private scrollSpeed = 0;
  private readonly waveState = { radius: 0 };
  private waveTween: gsap.core.Tween | null = null;
  private themeTween: gsap.core.Tween | null = null;
  private readonly onContextLost: () => void;

  constructor(options: LibraryEngineOptions) {
    this.tier = options.tier;
    this.onContextLost = options.onContextLost;
    ColorManagement.enabled = false;

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

    this.uniforms = createWorldUniforms();
    this.uniforms.uDark.value = options.dark ? 1 : 0;

    this.camera = new PerspectiveCamera(25, 1, 50, 80000);
    this.rig = new CameraRig(this.camera, CAMERA_DISTANCE);

    this.environment = createLibraryEnvironment(this.uniforms, this.tier);
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
    };

    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    this.resize();
    document.body.appendChild(this.canvas);
    this.lastScroll = window.scrollY;
    this.offFrame = addFrameCallback("render", this.frame);

    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, {
        __articlesWorld: {
          engine: this,
          uniforms: this.uniforms,
          composite: this.composite.uniforms,
          rig: this.rig,
          info: () => this.renderer.info,
        },
      });
    }
  }

  setRoute(route: WorldRoute) {
    this.route = route;
    const detail = route.kind === "detail";
    this.rig.influence = detail ? 0.35 : 1;
    this.composite.uniforms.uLens.value = detail ? 0 : 1;
    this.cards.setVisible(!detail);
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
    const state = { value: u.uTheme.value };
    this.themeTween = gsap.to(state, {
      value: theme ? 1 : 0,
      duration: seconds,
      ease: "power2.inOut",
      onUpdate: () => {
        u.uTheme.value = state.value;
      },
    });
  }

  colorAt(): [number, number, number] {
    const dark = this.uniforms.uDark.value;
    const light = new Color(WORLD_PALETTE.light.fog);
    const darkColor = new Color(WORLD_PALETTE.dark.fog);
    const fog = light.lerp(darkColor, dark);
    const theme = this.uniforms.uThemeLight.value
      .clone()
      .lerp(this.uniforms.uThemeDark.value, dark);
    fog.lerp(theme, this.uniforms.uTheme.value);
    return [Math.round(fog.r * 255), Math.round(fog.g * 255), Math.round(fog.b * 255)];
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame?.();
    this.offFrame = null;
    this.waveTween?.kill();
    this.themeTween?.kill();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
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

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.onContextLost();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    this.rig.pointer.x = (event.clientX / this.width) * 2 - 1;
    this.rig.pointer.y = -((event.clientY / this.height) * 2 - 1);
  };

  private readonly onPointerLeave = () => {
    this.rig.pointer.x = 0;
    this.rig.pointer.y = 0;
  };

  private readonly resize = () => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const cap = TIER_PIXEL_RATIO[this.tier];
    const budget = Math.sqrt(MAX_PIXELS / (width * height));
    this.pixelRatio = Math.max(0.75, Math.min(window.devicePixelRatio || 1, cap, budget));
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
      this.route.kind === "list" ? Math.max(-34, Math.min(34, this.scrollSpeed * 0.011)) : 0;

    this.rig.update(dt);
    this.environment.update(this.time, dt, speedVh);
    this.cards.update(scrollY);

    const fog = new Color().setRGB(...hexToUnit(WORLD_PALETTE.light.fog));
    fog.lerp(new Color().setRGB(...hexToUnit(WORLD_PALETTE.dark.fog)), u.uDark.value);
    fog.lerp(u.uThemeLight.value.clone().lerp(u.uThemeDark.value, u.uDark.value), u.uTheme.value);
    this.renderer.setClearColor(fog, 1);

    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.composite.uniforms.tScene.value = this.target.texture;
    this.renderer.render(this.composite.scene, this.composite.camera);
  };
}
