import {
  Color,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
  type Light,
  type Material,
  type Mesh,
} from "three";

import type { StoryTier } from "@/components/story/assets/types";
import {
  STORY_LAYERS,
  type StoryFrameInfo,
  type StoryRect,
  type StorySize,
  type StoryStageApi,
} from "@/components/story/engine/act";
import { StoryBackdrop } from "@/components/story/engine/backdrop";
import { StoryPost } from "@/components/story/engine/post";
import { levelOf, storyPixelRatio, type QualityLevel } from "@/components/story/engine/quality";

/**
 * The story's stage: one WebGL2 renderer, one canvas and one camera for the
 * whole story (cards, room, worlds, finale), kept for the whole visit.
 *
 * The canvas lives in `div[data-story-layer]`, inside the story section's
 * layer host (a dedicated empty element React never reconciles into), at
 * z-index -1 under the section's transparent DOM. This deliberately differs
 * from a body-level fixed canvas (SPEC 2.2): on touch the page scrolls on
 * the compositor, where a fixed canvas trails page-anchored content by a
 * frame. So the layer is placed per frame:
 * - `viewport`: covers the viewport. With ScrollSmoother (desktop) it is
 *   translated back to the viewport in the same tick the smoother moved the
 *   page; with native scroll (touch) it is `position: fixed`.
 * - an anchor rect (the entrance screen, the finale block): it sits on that
 *   element and scrolls with it, so GL glued to the DOM stays glued even
 *   while the compositor scrolls.
 *
 * Composition (docs/homepage-story.md): the canvas is transparent; the
 * backdrop paints the page colour where the story covers the page, and the
 * `behind` layer (the room) shows only where the backdrop is revealed. Post
 * effects, when any is on, render the same passes into a target that acts
 * exactly like the canvas, then composite once.
 */

export type StagePlacement = "viewport" | StoryRect;

type StageOptions = {
  tier: StoryTier;
  onContextLost: () => void;
};

function textureOf(value: unknown): Texture | null {
  return value instanceof Texture ? value : null;
}

export class StoryStage implements StoryStageApi {
  readonly layer: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly rootScene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.005, 200);
  readonly post = new StoryPost();
  readonly backdrop = new StoryBackdrop();
  size: StorySize = { width: 1, height: 1, dpr: 1, aspect: 1, portrait: false };
  info: StoryFrameInfo = { calls: 0, triangles: 0, frameMs: 0, fps: 0 };
  level: QualityLevel;
  lost = false;
  private frameScene: Scene;
  private host: HTMLElement | null = null;
  private smoothed = false;
  private shown = false;
  private page = 0xf7f7f5;
  private rect: StoryRect = { x: 0, y: 0, width: 1, height: 1 };
  private transform = "";
  private position = "";
  private disposed = false;
  private readonly onLost: (event: Event) => void;

  constructor(private readonly options: StageOptions) {
    this.level = levelOf(options.tier);
    this.frameScene = this.rootScene;
    this.layer = document.createElement("div");
    this.layer.dataset.storyLayer = "";
    this.layer.setAttribute("aria-hidden", "true");
    Object.assign(this.layer.style, {
      position: "absolute",
      top: "0",
      left: "0",
      zIndex: "-1",
      pointerEvents: "none",
      display: "none",
      contain: "strict",
    });
    this.canvas = document.createElement("canvas");
    this.canvas.dataset.storyCanvas = "";
    Object.assign(this.canvas.style, { display: "block", width: "100%", height: "100%" });
    this.layer.appendChild(this.canvas);

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: options.tier !== "low",
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Neutral keeps the brand's primaries close to their hex values under light.
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x000000, 0);
    this.post.setSamples(options.tier === "low" ? 0 : 4);

    this.onLost = (event: Event) => {
      event.preventDefault();
      if (this.lost) return;
      this.lost = true;
      this.options.onContextLost();
    };
    this.canvas.addEventListener("webglcontextlost", this.onLost);
    // Park the layer until the story section adopts it.
    this.park();
  }

  get scene() {
    return this.frameScene;
  }

  setScene(scene: Scene) {
    this.frameScene = scene;
  }

  /** Where the canvas is in the viewport this frame. */
  get canvasRect(): StoryRect {
    return this.rect;
  }

  /** The page colour the backdrop paints (palette.page). */
  setPage(hex: number) {
    this.page = hex;
  }

  /** Per-frame settings back to their defaults, before the acts update. */
  beginFrame() {
    this.frameScene = this.rootScene;
    this.post.reset();
    this.backdrop.reset();
    this.renderer.info.reset();
  }

  /** The layer moves into the story section's host (after hydration). */
  attach(host: HTMLElement) {
    this.host = host;
    if (this.layer.parentElement !== host) host.appendChild(this.layer);
    this.detectScroller();
  }

  /** Out of the page: hidden, parked at the end of the body. */
  park() {
    this.host = null;
    this.hide();
    if (this.layer.parentElement !== document.body) document.body.appendChild(this.layer);
  }

  get attached() {
    return this.host !== null && this.host.isConnected;
  }

  /** ScrollSmoother moves the page with a transform (desktop), or the page scrolls natively (touch). */
  detectScroller() {
    const wrapper = document.getElementById("smooth-wrapper");
    this.smoothed = wrapper !== null && getComputedStyle(wrapper).position === "fixed";
  }

  /** Places the layer for this frame: over the viewport, or on an anchor's viewport rect. */
  place(placement: StagePlacement, section: StoryRect) {
    const { width, height } = this.size;
    let position: string;
    let transform: string;
    if (placement === "viewport") {
      if (this.smoothed) {
        position = "absolute";
        transform = `translate3d(${-section.x}px, ${-section.y}px, 0)`;
      } else {
        position = "fixed";
        transform = "none";
      }
      this.rect = { x: 0, y: 0, width, height };
    } else {
      position = "absolute";
      transform = `translate3d(${placement.x - section.x}px, ${placement.y - section.y}px, 0)`;
      this.rect = { x: placement.x, y: placement.y, width, height };
    }
    if (position !== this.position) {
      this.position = position;
      this.layer.style.position = position;
    }
    if (transform !== this.transform) {
      this.transform = transform;
      this.layer.style.transform = transform;
    }
  }

  show() {
    if (this.shown || this.disposed) return;
    this.shown = true;
    this.layer.style.display = "block";
  }

  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.layer.style.display = "none";
    // The post targets come back on the next post frame.
    this.post.release();
  }

  get visible() {
    return this.shown;
  }

  /** The context is gone (a method, so a caller's earlier check never narrows it). */
  isLost(): boolean {
    return this.lost;
  }

  /** The canvas's CSS size (the viewport's, without a classic scrollbar). */
  resize(width: number, height: number) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const ratio = storyPixelRatio(this.level, w, h);
    const same =
      w === this.size.width && h === this.size.height && Math.abs(ratio - this.size.dpr) < 1e-3;
    this.detectScroller();
    if (same) return;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.layer.style.width = `${w}px`;
    this.layer.style.height = `${h}px`;
    this.size = { width: w, height: h, dpr: ratio, aspect: w / h, portrait: h > w };
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** A governor step: new pixel ratio (and MSAA off on the low tier). */
  setLevel(level: QualityLevel) {
    this.level = level;
    this.post.setSamples(level.tier === "low" ? 0 : 4);
    const { width, height } = this.size;
    this.size = { ...this.size, dpr: -1 };
    this.resize(width, height);
  }

  /** Compiles `scene`'s programs and uploads its textures, for both layers and both paths. */
  async compile(scene: Scene = this.rootScene) {
    if (this.lost) return;
    const mask = this.camera.layers.mask;
    this.camera.layers.enableAll();
    // Lights must light both layers, or the two passes would compile different programs.
    scene.traverse((object) => {
      if ((object as Light).isLight) object.layers.enableAll();
    });
    try {
      await this.renderer.compileAsync(scene, this.camera);
    } finally {
      this.camera.layers.mask = mask;
    }
    const seen = new Set<Texture>();
    scene.traverse((object) => {
      const material = (object as Mesh).material as Material | Material[] | undefined;
      if (!material) return;
      for (const one of Array.isArray(material) ? material : [material]) {
        for (const value of Object.values(one)) {
          const texture = textureOf(value);
          if (texture && !seen.has(texture)) {
            seen.add(texture);
            this.renderer.initTexture(texture);
          }
        }
      }
    });
  }

  /** The post passes and the backdrop mask, once (the loading screen calls it). */
  compileSystems() {
    if (this.lost) return;
    this.post.compile(this.renderer);
    this.backdrop.compile(this.renderer);
  }

  /** Renders this frame: the backdrop composition, then the post composite when any effect is on. */
  render(time: number) {
    if (this.lost || this.disposed) return;
    const r = this.renderer;
    const camera = this.camera;
    const scene = this.frameScene;
    camera.updateProjectionMatrix();
    // Lit, tone-mapped materials only: the backdrop and anything `toneMapped: false` keep their bytes.
    r.toneMappingExposure = this.post.params.exposure;
    const post = this.post.active;
    const target = post
      ? this.post.begin(
          Math.max(1, Math.round(this.size.width * this.size.dpr)),
          Math.max(1, Math.round(this.size.height * this.size.dpr)),
        )
      : null;
    r.setRenderTarget(target);
    const reveal = this.backdrop.reveal;
    const paint = this.backdrop.paint;
    const page = this.backdrop.color(this.page);
    const background = scene.background;
    const mask = camera.layers.mask;
    if (reveal >= 0.999) {
      // Everything shows: one pass, both layers, shared depth.
      if (background instanceof Color) r.setClearColor(background, 1);
      else r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      camera.layers.enableAll();
      r.render(scene, camera);
    } else if (reveal <= 0.001) {
      // Nothing behind shows: the page colour (or the DOM) and the front layer.
      r.setClearColor(page, paint);
      r.clear(true, true, false);
      camera.layers.set(STORY_LAYERS.front);
      scene.background = null;
      r.render(scene, camera);
      scene.background = background;
    } else {
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      camera.layers.set(STORY_LAYERS.behind);
      r.render(scene, camera);
      this.backdrop.renderMask(r, this.page, this.size.aspect);
      camera.layers.set(STORY_LAYERS.front);
      scene.background = null;
      r.render(scene, camera);
      scene.background = background;
    }
    camera.layers.mask = mask;
    if (post) this.post.finish(r, time);
    r.setClearColor(0x000000, 0);
    this.info = {
      ...this.info,
      calls: r.info.render.calls,
      triangles: r.info.render.triangles,
    };
  }

  /** Frame timing for the dev HUD. */
  setTiming(frameMs: number, fps: number) {
    this.info = { ...this.info, frameMs, fps };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.post.dispose();
    this.backdrop.dispose();
    this.renderer.dispose();
    if (!this.lost) this.renderer.forceContextLoss();
    this.layer.remove();
  }
}
