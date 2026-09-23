import {
  Camera,
  LinearFilter,
  Mesh,
  NoBlending,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  VideoTexture,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";

import {
  coverUvRect,
  prepareCover,
  visibleRegion,
  type CoverCrop,
  type PreparedCover,
} from "@/components/projects/stage/cover-textures";
import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import { Spring } from "@/components/projects/stage/spring";
import { hexToRgb, type ProjectPalette } from "@/lib/project-themes";

import type { DetailStageHandle, DetailStageItem, DetailStageOptions } from "./contract";
import { PointerLens } from "./detail-pointer";
import {
  itemFragmentShader,
  itemVertexShader,
  screenFragmentShader,
  screenVertexShader,
} from "./detail-shaders";
import { SpeedWave } from "./detail-wave";

/**
 * The project detail page's WebGL media stage (see contract.ts): one canvas
 * in the page's fixed media layer that draws every media item of the
 * horizontal track, lusion.co style.
 *
 * Items are drawn as quads over their placeholders' rects (measured when
 * the page asks, never per frame: per frame only the track offset moves)
 * into an offscreen target, which one full-screen pass then composites to
 * the transparent canvas with the scroll-speed wave, the smear and the
 * cursor lens. Everything renders on demand; nothing is drawn at rest.
 *
 * Loaded only through the dynamic import in detail-stage.ts, so three.js
 * never reaches a chunk that doesn't need it.
 */

const MAX_PIXEL_RATIO = 2;
// Drawing-buffer budget (4K worth of pixels): beyond it the pixel ratio
// drops uniformly, as lusion caps its own (DPR 1.5, 2560x1440). A 1440p
// screen at 2x would otherwise run the smear pass over 14.7 MP.
const MAX_PIXELS = 3840 * 2160;
// lusion's desktop --global-border-radius, used when the placeholder and
// its media carry no radius of their own.
const DEFAULT_RADIUS = 20;

// Emerge (lusion's): the mask opens and the picture settles over 1 s of
// expo.out, counted from the moment the item is on screen. It replays on
// every re-entry.
const EMERGE_SECONDS = 1;
// Highlight -> texture crossfade (lusion's: linear, 1 s).
const READY_SECONDS = 1;
const PALETTE_SECONDS = 0.6;

// Hover: the item under a resting cursor leans in to 1.03x, toward the cursor.
const HOVER_ZOOM = 1.03;
const HOVER_SPRING = [1.6, 0.9, 0] as const;
// |s| below which the page counts as calm (about 350 px/s at 1440 px wide):
// the lens and the hover zoom only engage then, so media sliding under a
// resting cursor don't flash.
const CALM_SPEED = 0.004;

// Texture streaming along the track, in viewport widths.
const PRELOAD_AHEAD = 2;
const PRELOAD_BEHIND = 1;
const EVICT_DISTANCE = 4;
const MAX_CONCURRENT_LOADS = 2;
// A resize that grows an item past this share of the size its texture was
// prepared for re-prepares it (the old one stays up until the new is ready).
const RELOAD_GROWTH = 1.3;
// rVFC calls older than this while the video plays: frames are detected
// from currentTime instead (a hidden element may stop reporting frames).
const FRAME_CALLBACK_STALE_MS = 250;

// expo.out normalised to end at exactly 1 (as in the list page's stage).
const EXPO_END = 1 - 2 ** -10;
const expoOut = (x: number) => (x >= 1 ? 1 : (1 - 2 ** (-10 * x)) / EXPO_END);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type ItemUniforms = {
  u_map: { value: Texture | null };
  u_mapRect: { value: Vector4 };
  u_rect: { value: Vector4 };
  u_radius: { value: number };
  u_emerge: { value: number };
  u_fullscreen: { value: number };
  u_ready: { value: number };
  u_zoom: { value: number };
  u_zoomOrigin: { value: Vector2 };
};

type ScreenUniforms = {
  u_scene: { value: Texture | null };
  u_resolution: { value: Vector2 };
  u_viewport: { value: Vector2 };
  u_opacity: { value: number };
  u_arch: { value: number };
  u_ripple: { value: number };
  u_ripplePhase: { value: Vector2 };
  u_blur: { value: number };
  u_split: { value: number };
  u_lens: { value: Vector3 };
  u_lensDrag: { value: Vector2 };
};

type Item = {
  source: DetailStageItem;
  // Track rect: x at scroll 0, y in the viewport (CSS px).
  x: number;
  y: number;
  width: number;
  height: number;
  mesh: Mesh;
  material: ShaderMaterial;
  uniforms: ItemUniforms;
  owned: boolean;
  // Picture: the image, or a video's poster.
  loading: boolean;
  generation: number;
  prepared: PreparedCover | null;
  texture: Texture | null;
  crop: CoverCrop | null;
  pictureWidth: number;
  pictureFailed: boolean;
  reload: boolean;
  // Video.
  videoTexture: VideoTexture | null;
  videoSize: string;
  videoPrimed: boolean;
  videoFrame: boolean;
  videoTime: number;
  lastFrameCallback: number;
  frameCallback: number;
  videoPath: "none" | "rvfc" | "time";
  // Animation.
  visible: boolean;
  activeTime: number;
  ready: number;
  hover: Spring;
};

function releaseCover(cover: PreparedCover | null) {
  if (!cover) return;
  if ("close" in cover.source) cover.source.close();
  else cover.source.width = cover.source.height = 0;
}

/** The corner radius the page's own media show, if any. */
function readRadius(element: HTMLElement) {
  const own = parseFloat(getComputedStyle(element).borderTopLeftRadius);
  if (own > 0) return own;
  const media = element.querySelector<HTMLElement>("img, video");
  const inner = media ? parseFloat(getComputedStyle(media).borderTopLeftRadius) : 0;
  return inner > 0 ? inner : DEFAULT_RADIUS;
}

/** Dev-only probes of the running stages, newest last. */
const liveProbes: object[] = [];

function hasFrameCallback(video: HTMLVideoElement) {
  return "requestVideoFrameCallback" in video;
}

export class DetailEngine {
  readonly handle: DetailStageHandle;

  private readonly options: DetailStageOptions;
  private readonly items: Item[] = [];
  private readonly itemScene = new Scene();
  private readonly screenScene = new Scene();
  private readonly camera = new Camera();
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly shared = {
    u_viewport: { value: new Vector2(1, 1) },
    u_highlight: { value: new Vector3() },
  };
  private readonly wave = new SpeedWave();
  private readonly lens: PointerLens | null;

  private canvas: HTMLCanvasElement | null = null;
  private renderer: WebGLRenderer | null = null;
  private target: WebGLRenderTarget | null = null;
  private screenMaterial: ShaderMaterial | null = null;
  private screenUniforms: ScreenUniforms | null = null;
  private maxTextureSize = 4096;

  private vw = 0;
  private vh = 0;
  private pixelRatio = 1;
  private layoutDirty = true;
  private claimed = false;
  private lastScroll = Number.NaN;
  private lastOpacity = -1;

  private paletteFrom: [number, number, number];
  private paletteTo: [number, number, number];
  private paletteT = 1;

  private loads = 0;
  private uploadedThisFrame = false;
  private sceneRenders = 0;
  private screenRenders = 0;
  private uploads = 0;
  private offFrame: (() => void) | null = null;
  private disposed = false;
  private probe: ReturnType<DetailEngine["debugView"]> | null = null;

  constructor(options: DetailStageOptions) {
    this.options = options;
    const highlight = hexToRgb(options.palette.highlight);
    this.paletteFrom = highlight;
    this.paletteTo = highlight;
    this.shared.u_highlight.value.set(...highlight);
    this.lens = window.matchMedia("(hover: hover) and (pointer: fine)").matches
      ? new PointerLens()
      : null;
    this.handle = {
      measure: () => {
        // Read on the next frame, against that frame's scroll position.
        this.layoutDirty = true;
      },
      setPalette: (palette) => this.setPalette(palette),
      dispose: () => this.dispose(),
    };
  }

  /**
   * Creates the renderer and compiles both passes. Resolves false (with
   * everything released) when WebGL isn't usable after all.
   */
  async prepare(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      this.createRenderer();
      this.createMeshes();
    } catch {
      this.dispose();
      return false;
    }
    const renderer = this.renderer!;
    try {
      // Programs are keyed by their output target, so each pass compiles
      // against the target it will draw into (compile is synchronous; only
      // the wait for the driver is asynchronous, KHR_parallel_shader_compile).
      for (const item of this.items) item.mesh.visible = true;
      renderer.setRenderTarget(this.target);
      const items = renderer.compileAsync(this.itemScene, this.camera);
      renderer.setRenderTarget(null);
      const screen = renderer.compileAsync(this.screenScene, this.camera);
      for (const item of this.items) item.mesh.visible = false;
      await Promise.all([items, screen]);
    } catch {
      this.dispose();
      return false;
    }
    return !this.disposed;
  }

  /** Starts the frame loop; the first frame claims every item and draws it. */
  start() {
    if (this.disposed || this.offFrame) return;
    this.offFrame = addFrameCallback("render", this.frame);
    if (process.env.NODE_ENV !== "production") {
      this.probe = this.debugView();
      liveProbes.push(this.probe);
      Object.assign(window, { __detailStage: this.probe });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame?.();
    this.offFrame = null;
    this.lens?.dispose();
    this.canvas?.removeEventListener("webglcontextlost", this.onContextLost);
    this.releaseOwnership();
    for (const item of this.items) {
      this.evict(item);
      this.itemScene.remove(item.mesh);
      item.material.dispose();
    }
    this.screenMaterial?.dispose();
    this.geometry.dispose();
    this.target?.dispose();
    const renderer = this.renderer;
    if (renderer) {
      if (process.env.NODE_ENV !== "production") {
        // What is still allocated once everything has been released.
        Object.assign(window, {
          __detailStageDisposed: {
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            programs: renderer.info.programs?.length ?? 0,
          },
        });
      }
      const lost = renderer.getContext().isContextLost();
      renderer.dispose();
      // Release the context now rather than whenever GC gets to it.
      if (!lost) renderer.forceContextLoss();
    }
    this.canvas?.remove();
    this.renderer = null;
    this.canvas = null;
    this.target = null;
    if (process.env.NODE_ENV !== "production" && this.probe) {
      // Another stage may still be running (a remount overlapping this
      // one): the probe then points at the newest live one.
      liveProbes.splice(liveProbes.indexOf(this.probe), 1);
      const latest = liveProbes.at(-1);
      if (latest) Object.assign(window, { __detailStage: latest });
      else Reflect.deleteProperty(window, "__detailStage");
      this.probe = null;
    }
  }

  // ---------------------------------------------------------------- setup

  private createRenderer() {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.detailStage = "";
    Object.assign(canvas.style, {
      position: "absolute",
      left: "0",
      top: "0",
      display: "block",
      pointerEvents: "none",
    });
    const renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false, // the masks antialias their own edges
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
    renderer.setClearColor(0x000000, 0);
    this.canvas = canvas;
    this.renderer = renderer;
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.maxTextureSize = Math.min(renderer.capabilities.maxTextureSize, 8192);

    this.target = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
    });
    const root = document.documentElement;
    const width = root.clientWidth;
    const height = root.clientHeight;
    this.resize(width, height, this.currentPixelRatio(width, height));
    this.options.container.appendChild(canvas);
  }

  private createMeshes() {
    for (const source of this.options.items) {
      const uniforms: ItemUniforms = {
        u_map: { value: null },
        u_mapRect: { value: new Vector4(0, 0, 1, 1) },
        u_rect: { value: new Vector4(0, 0, 1, 1) },
        u_radius: { value: source.fullscreen ? 0 : DEFAULT_RADIUS },
        u_emerge: { value: 0 },
        u_fullscreen: { value: source.fullscreen ? 1 : 0 },
        u_ready: { value: 0 },
        u_zoom: { value: 1 },
        u_zoomOrigin: { value: new Vector2(0.5, 0.5) },
      };
      const material = new ShaderMaterial({
        uniforms: { ...uniforms, ...this.shared },
        vertexShader: itemVertexShader,
        fragmentShader: itemFragmentShader,
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new Mesh(this.geometry, material);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      this.itemScene.add(mesh);
      this.items.push({
        source,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        mesh,
        material,
        uniforms: material.uniforms as unknown as ItemUniforms,
        owned: false,
        loading: false,
        generation: 0,
        prepared: null,
        texture: null,
        crop: null,
        pictureWidth: 0,
        pictureFailed: false,
        reload: false,
        videoTexture: null,
        videoSize: "",
        videoPrimed: false,
        videoFrame: false,
        videoTime: -1,
        lastFrameCallback: Number.NEGATIVE_INFINITY,
        frameCallback: 0,
        videoPath: "none",
        visible: false,
        activeTime: 0,
        ready: 0,
        hover: new Spring(...HOVER_SPRING),
      });
    }

    const uniforms: ScreenUniforms = {
      u_scene: { value: this.target!.texture },
      u_resolution: { value: new Vector2(1, 1) },
      u_viewport: this.shared.u_viewport,
      u_opacity: { value: 0 },
      u_arch: { value: 0 },
      u_ripple: { value: 0 },
      u_ripplePhase: { value: new Vector2() },
      u_blur: { value: 0 },
      u_split: { value: 0 },
      u_lens: { value: new Vector3() },
      u_lensDrag: { value: new Vector2() },
    };
    this.screenMaterial = new ShaderMaterial({
      uniforms,
      vertexShader: screenVertexShader,
      fragmentShader: screenFragmentShader,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.screenUniforms = this.screenMaterial.uniforms as unknown as ScreenUniforms;
    this.syncResolution();
    const screen = new Mesh(this.geometry, this.screenMaterial);
    screen.frustumCulled = false;
    screen.matrixAutoUpdate = false;
    this.screenScene.add(screen);
  }

  private currentPixelRatio(width: number, height: number) {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const budget = Math.sqrt(MAX_PIXELS / Math.max(1, width * height));
    return Math.min(ratio, budget);
  }

  private resize(width: number, height: number, ratio: number) {
    const renderer = this.renderer;
    const canvas = this.canvas;
    if (!renderer || !canvas) return;
    this.vw = width;
    this.vh = height;
    this.pixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    this.target?.setSize(canvas.width, canvas.height);
    this.shared.u_viewport.value.set(width, height);
    this.syncResolution();
  }

  private syncResolution() {
    if (this.canvas && this.screenUniforms) {
      this.screenUniforms.u_resolution.value.set(this.canvas.width, this.canvas.height);
    }
  }

  private setPalette(palette: ProjectPalette) {
    if (this.disposed) return;
    const current = this.shared.u_highlight.value;
    this.paletteFrom = [current.x, current.y, current.z];
    this.paletteTo = hexToRgb(palette.highlight);
    this.paletteT = 0;
  }

  // ------------------------------------------------------------ ownership

  private claim() {
    this.claimed = true;
    for (const item of this.items) {
      if (item.owned || item.pictureFailed) continue;
      item.owned = true;
      this.options.onOwnershipChange(item.source.id, true);
    }
  }

  /** Hands one item back to the page's DOM media (its media failed). */
  private release(item: Item) {
    item.mesh.visible = false;
    if (!item.owned) return;
    item.owned = false;
    this.options.onOwnershipChange(item.source.id, false);
  }

  private releaseOwnership() {
    for (const item of this.items) this.release(item);
  }

  private readonly onContextLost = () => {
    if (this.disposed) return;
    this.dispose();
    this.options.onFailure();
  };

  // --------------------------------------------------------------- layout

  /** Reads every placeholder rect against the scroll the track shows now. */
  private measureNow(scroll: number) {
    this.layoutDirty = false;
    for (const item of this.items) {
      const rect = item.source.element.getBoundingClientRect();
      item.x = rect.left + scroll;
      item.y = rect.top;
      item.width = rect.width;
      item.height = rect.height;
      item.uniforms.u_radius.value = item.source.fullscreen ? 0 : readRadius(item.source.element);
      if (item.texture && item.width > item.pictureWidth * RELOAD_GROWTH) item.reload = true;
    }
  }

  // ------------------------------------------------------------- textures

  private distanceOutside(item: Item, scroll: number) {
    const left = item.x - scroll;
    if (left > this.vw) return { ahead: left - this.vw, behind: 0 };
    if (left + item.width < 0) return { ahead: 0, behind: -(left + item.width) };
    return { ahead: 0, behind: 0 };
  }

  /** Loads what is near, one upload per frame; frees what is far. */
  private stream(scroll: number) {
    const vw = this.vw;
    const wanted: { item: Item; distance: number }[] = [];
    for (const item of this.items) {
      if (!item.owned || item.width < 1 || item.height < 1) continue;
      const { ahead, behind } = this.distanceOutside(item, scroll);
      if (Math.max(ahead, behind) > EVICT_DISTANCE * vw) {
        if (item.texture || item.prepared || item.loading || item.videoTexture) this.evict(item);
        continue;
      }
      const near = ahead <= PRELOAD_AHEAD * vw && behind <= PRELOAD_BEHIND * vw;
      if (!near) continue;
      if (item.source.video && !item.videoTexture) this.createVideoTexture(item);
      if (
        item.source.src &&
        !item.loading &&
        !item.prepared &&
        !item.pictureFailed &&
        (!item.texture || item.reload)
      ) {
        wanted.push({ item, distance: ahead + behind });
      }
    }
    wanted.sort((a, b) => a.distance - b.distance);
    for (const { item } of wanted) {
      if (this.loads >= MAX_CONCURRENT_LOADS) break;
      this.loadPicture(item);
    }
    if (!this.uploadedThisFrame) {
      let next: Item | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const item of this.items) {
        if (!item.prepared) continue;
        const { ahead, behind } = this.distanceOutside(item, scroll);
        if (ahead + behind < best) {
          best = ahead + behind;
          next = item;
        }
      }
      if (next) this.upload(next);
    }
  }

  private loadPicture(item: Item) {
    const src = item.source.src;
    if (!src) return;
    item.loading = true;
    item.reload = false;
    this.loads += 1;
    const generation = ++item.generation;
    const width = item.width;
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    prepareCover(image, width, item.height, this.pixelRatio, this.maxTextureSize)
      .then((cover) => {
        if (this.disposed || generation !== item.generation) {
          releaseCover(cover);
          return;
        }
        if (!cover) {
          this.failPicture(item);
          return;
        }
        releaseCover(item.prepared);
        item.prepared = cover;
        item.pictureWidth = width;
      })
      .catch(() => {
        if (!this.disposed && generation === item.generation) this.failPicture(item);
      })
      .finally(() => {
        this.loads -= 1;
        if (generation === item.generation) item.loading = false;
      });
  }

  private failPicture(item: Item) {
    item.pictureFailed = true;
    // An image item has nothing else to show: the page's DOM takes it back.
    // A video only loses its poster.
    if (!item.source.video) this.release(item);
  }

  private upload(item: Item) {
    const renderer = this.renderer;
    const cover = item.prepared;
    if (!renderer || !cover) return;
    const texture = new Texture(cover.source);
    texture.flipY = false; // the shader samples top-down, like the image rows
    texture.generateMipmaps = false; // prepared at about display size
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.premultiplyAlpha = !cover.premultiplied;
    texture.needsUpdate = true;
    renderer.initTexture(texture);
    // The pixels live on the GPU now; drop the CPU copy.
    releaseCover(cover);
    item.prepared = null;
    item.texture?.dispose();
    item.texture = texture;
    item.crop = cover.crop;
    this.uploadedThisFrame = true;
    this.uploads += 1;
  }

  private createVideoTexture(item: Item) {
    const video = item.source.video;
    if (!video) return;
    const texture = new VideoTexture(video);
    texture.flipY = false;
    texture.premultiplyAlpha = false; // opaque frames
    item.videoTexture = texture;
    item.videoPrimed = false;
    item.videoSize = "";
    item.videoTime = -1;
    if (hasFrameCallback(video)) {
      // Our own "a new frame was presented" signal (three's texture keeps
      // its own callback for the upload itself).
      const onFrame = () => {
        item.videoFrame = true;
        item.lastFrameCallback = performance.now();
        item.frameCallback = video.requestVideoFrameCallback(onFrame);
      };
      item.frameCallback = video.requestVideoFrameCallback(onFrame);
    }
  }

  private evict(item: Item) {
    item.generation += 1;
    item.loading = false;
    releaseCover(item.prepared);
    item.prepared = null;
    item.texture?.dispose();
    item.texture = null;
    item.crop = null;
    item.reload = false;
    const video = item.source.video;
    if (video && item.frameCallback) video.cancelVideoFrameCallback(item.frameCallback);
    item.frameCallback = 0;
    item.videoTexture?.dispose();
    item.videoTexture = null;
    item.uniforms.u_map.value = null;
    item.ready = 0;
  }

  /** Points the item at the best texture it has. Returns whether it has one. */
  private syncMap(item: Item): boolean {
    const u = item.uniforms;
    const video = item.source.video;
    const texture = item.videoTexture;
    if (video && texture && video.readyState >= 2 && video.videoWidth > 0) {
      const size = `${video.videoWidth}x${video.videoHeight}`;
      if (item.videoSize && item.videoSize !== size) {
        // A new source resolution can't reuse the texture's storage.
        this.evictVideo(item);
        return this.syncMap(item);
      }
      item.videoSize = size;
      if (!item.videoPrimed) {
        // A paused video never reports a frame: upload the current one.
        item.videoPrimed = true;
        texture.needsUpdate = true;
      }
      u.u_map.value = texture;
      const v = visibleRegion(video.videoWidth, video.videoHeight, item.width, item.height);
      u.u_mapRect.value.set(
        v.x / video.videoWidth,
        v.y / video.videoHeight,
        v.w / video.videoWidth,
        v.h / video.videoHeight,
      );
      return true;
    }
    if (item.texture && item.crop) {
      u.u_map.value = item.texture;
      const [ox, oy, sx, sy] = coverUvRect(item.crop, item.width, item.height);
      u.u_mapRect.value.set(ox, oy, sx, sy);
      return true;
    }
    u.u_map.value = null;
    return false;
  }

  private evictVideo(item: Item) {
    const video = item.source.video;
    if (video && item.frameCallback) video.cancelVideoFrameCallback(item.frameCallback);
    item.frameCallback = 0;
    item.videoTexture?.dispose();
    item.videoTexture = null;
    this.createVideoTexture(item);
  }

  // ---------------------------------------------------------------- frame

  private readonly frame = (_time: number, dt: number) => {
    const renderer = this.renderer;
    if (this.disposed || !renderer || !this.target || !this.screenUniforms) return;
    const frame = this.options.getFrame();
    const vw = frame.viewportWidth;
    const vh = frame.viewportHeight;
    if (!(vw >= 1 && vh >= 1)) return;
    const scroll = frame.scroll;

    let sceneActive = false;
    const ratio = this.currentPixelRatio(vw, vh);
    if (vw !== this.vw || vh !== this.vh || ratio !== this.pixelRatio) {
      this.resize(vw, vh, ratio);
      this.layoutDirty = true;
    }
    if (this.layoutDirty) {
      this.measureNow(scroll);
      sceneActive = true;
    }
    if (!this.claimed) {
      this.claim();
      sceneActive = true;
    }
    if (scroll !== this.lastScroll) {
      this.lastScroll = scroll;
      sceneActive = true;
    }

    if (process.env.NODE_ENV !== "production") {
      // Verification scripts pin the speed for deterministic stills.
      const tuning = (window as { __detailStageTuning?: { speed?: number } }).__detailStageTuning;
      this.wave.pinned = typeof tuning?.speed === "number" ? tuning.speed : null;
    }
    const waveActive = this.wave.step(frame.scrollDelta, scroll, vw, vh, dt);
    const calm = Math.abs(this.wave.speed) < CALM_SPEED;

    const lens = this.lens;
    let hovered: Item | null = null;
    if (lens?.inside) {
      for (const item of this.items) {
        if (!item.owned || !item.visible) continue;
        const left = item.x - scroll;
        if (
          lens.x >= left &&
          lens.x < left + item.width &&
          lens.y >= item.y &&
          lens.y < item.y + item.height
        ) {
          hovered = item;
          break;
        }
      }
    }
    const lensActive = lens ? lens.step(dt, hovered !== null && calm) : false;

    const opacity = clamp01(frame.itemsOpacity);
    const opacityChanged = opacity !== this.lastOpacity;
    this.lastOpacity = opacity;

    if (this.paletteT < 1) {
      this.paletteT = Math.min(1, this.paletteT + dt / PALETTE_SECONDS);
      const t = this.paletteT * this.paletteT * (3 - 2 * this.paletteT);
      const [fr, fg, fb] = this.paletteFrom;
      const [tr, tg, tb] = this.paletteTo;
      this.shared.u_highlight.value.set(fr + (tr - fr) * t, fg + (tg - fg) * t, fb + (tb - fb) * t);
      sceneActive = true;
    }

    this.uploadedThisFrame = false;
    this.stream(scroll);
    if (this.uploadedThisFrame) sceneActive = true;

    const now = performance.now();
    for (const item of this.items) {
      if (this.stepItem(item, scroll, vw, vh, dt, opacity, hovered === item && calm, now)) {
        sceneActive = true;
      }
    }

    // Every change above is reported on the frame it happens, including the
    // frame something lands at rest, so the rest state is always drawn and
    // nothing is drawn after it.
    const renderScene = sceneActive;
    const renderScreen = renderScene || waveActive || lensActive || opacityChanged;

    if (renderScene) {
      renderer.setRenderTarget(this.target);
      renderer.render(this.itemScene, this.camera);
      renderer.setRenderTarget(null);
      this.sceneRenders += 1;
    }
    if (renderScreen) {
      const u = this.screenUniforms;
      const w = this.wave.uniforms;
      u.u_opacity.value = opacity;
      u.u_arch.value = w.arch;
      u.u_ripple.value = w.ripple;
      u.u_ripplePhase.value.set(w.phase[0], w.phase[1]);
      u.u_blur.value = w.blur;
      u.u_split.value = w.split;
      if (lens && lens.strength > 0) {
        u.u_lens.value.set(lens.cx, lens.cy, lens.strength);
        u.u_lensDrag.value.set(lens.dragX, lens.dragY);
      } else {
        u.u_lens.value.set(0, 0, 0);
        u.u_lensDrag.value.set(0, 0);
      }
      renderer.render(this.screenScene, this.camera);
      this.screenRenders += 1;
    }
  };

  /** Advances one item and writes its uniforms. Returns whether it changed. */
  private stepItem(
    item: Item,
    scroll: number,
    vw: number,
    vh: number,
    dt: number,
    opacity: number,
    hovered: boolean,
    now: number,
  ) {
    const video = item.source.video;
    if (item.owned && video?.error) this.release(item);
    if (!item.owned) {
      // Handed back: one more frame clears it if it was on screen.
      const wasVisible = item.visible;
      item.visible = false;
      return wasVisible;
    }
    const left = item.x - scroll;
    const visible =
      item.width > 0 &&
      item.height > 0 &&
      left < vw &&
      left + item.width > 0 &&
      item.y < vh &&
      item.y + item.height > 0;
    let active = visible !== item.visible;
    item.visible = visible;
    item.mesh.visible = visible;
    if (!visible) {
      // Fully out: the emerge replays on the next entry.
      item.activeTime = 0;
      item.hover.reset(0);
      return active;
    }

    // Held while the media are fully transparent (the page's entrance), so
    // the emerge plays as they fade in instead of unseen before.
    if (opacity > 0) {
      if (item.activeTime < EMERGE_SECONDS) active = true;
      item.activeTime += dt;
    }

    const mapBefore = item.uniforms.u_map.value;
    const hasMap = this.syncMap(item);
    if (item.uniforms.u_map.value !== mapBefore) active = true;
    if (hasMap) {
      if (item.ready < 1) {
        item.ready = Math.min(1, item.ready + dt / READY_SECONDS);
        active = true;
      }
    } else if (item.ready !== 0) {
      item.ready = 0;
      active = true;
    }

    const texture = item.videoTexture;
    if (video && texture) {
      const playing = !video.paused && video.currentTime !== item.videoTime;
      item.videoTime = video.currentTime;
      const reporting = now - item.lastFrameCallback < FRAME_CALLBACK_STALE_MS;
      const advanced = item.videoFrame || (playing && !reporting);
      if (advanced) item.videoPath = item.videoFrame ? "rvfc" : "time";
      item.videoFrame = false;
      if (advanced && hasMap && item.uniforms.u_map.value === texture) {
        texture.needsUpdate = true;
        active = true;
      }
    }

    const u = item.uniforms;
    const lens = this.lens;
    if (hovered && lens) {
      // Lean toward the (eased) cursor, never past the picture's edges.
      const origin = u.u_zoomOrigin.value;
      const ox = clamp01((lens.cx - left) / item.width);
      const oy = clamp01((lens.cy - item.y) / item.height);
      if ((ox !== origin.x || oy !== origin.y) && item.hover.value !== 0) active = true;
      origin.set(ox, oy);
    }
    const hoverBefore = item.hover.value;
    item.hover.step(dt, hovered ? 1 : 0);
    item.hover.settle(1e-3); // 0.003% of zoom: far below a pixel
    if (item.hover.value !== hoverBefore) active = true;

    u.u_rect.value.set(left, item.y, item.width, item.height);
    u.u_emerge.value = expoOut(Math.min(item.activeTime / EMERGE_SECONDS, 1));
    u.u_ready.value = hasMap ? item.ready : 0;
    u.u_zoom.value = 1 + (HOVER_ZOOM - 1) * item.hover.value;
    return active;
  }

  // ---------------------------------------------------------------- debug

  private debugView() {
    return {
      items: () =>
        this.items.map((item) => ({
          id: item.source.id,
          kind: item.source.kind,
          fullscreen: item.source.fullscreen,
          owned: item.owned,
          visible: item.visible,
          activeTime: item.activeTime,
          readyRatio: item.ready,
          emerge: item.uniforms.u_emerge.value,
          hover: item.hover.value,
          texture: item.uniforms.u_map.value
            ? item.uniforms.u_map.value === item.videoTexture
              ? "video"
              : "picture"
            : null,
          videoPath: item.videoPath,
          rect: [item.x, item.y, item.width, item.height],
          radius: item.uniforms.u_radius.value,
        })),
      renders: () => ({ scene: this.sceneRenders, screen: this.screenRenders }),
      uploads: () => this.uploads,
      lastS: () => this.wave.speed,
      rawS: () => this.wave.rawSpeed,
      wave: () => ({ ...this.wave.uniforms, phase: [...this.wave.uniforms.phase] }),
      lens: () =>
        this.lens
          ? {
              inside: this.lens.inside,
              strength: this.lens.strength,
              centre: [this.lens.cx, this.lens.cy],
              drag: [this.lens.dragX, this.lens.dragY],
            }
          : null,
      memory: () =>
        this.renderer
          ? {
              geometries: this.renderer.info.memory.geometries,
              textures: this.renderer.info.memory.textures,
              programs: this.renderer.info.programs?.length ?? 0,
            }
          : null,
    };
  }
}
