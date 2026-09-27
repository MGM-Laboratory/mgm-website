import gsap from "gsap";
import { LinearSRGBColorSpace, OrthographicCamera, Scene, WebGLRenderer } from "three";

import type { GlFrame, GlHost } from "@/lib/gl-host";

/** Highest drawing-buffer pixel ratio (the reel is soft video and a ribbon). */
const MAX_PIXEL_RATIO = 1.5;
/** Largest drawing buffer, in device pixels. */
const MAX_PIXELS = 2560 * 1440;

/**
 * The reel's own WebGL stage, for when the site's cursor-flow stage isn't
 * up (lib/gl-host.ts): one fixed, transparent canvas behind the page
 * content, in the same CSS-pixel space (x right from the viewport's left
 * edge, y up from its top edge). It has no paint field.
 *
 * The canvas is a direct child of <body> at z-index -1: above the page's
 * own background (the body's, painted on the root) and below everything
 * the page draws, with the homepage's fixed smooth-scroll wrapper or
 * without it. The articles portal carries `body > canvas` layers with the
 * page when it lifts it.
 *
 * It renders from the GSAP ticker (after ScrollSmoother has moved the page
 * in the same tick, docs/animation-system.md gotcha #17), only while some
 * layer holds frames on, plus one frame to clear when the last one lets go.
 */
export class StandaloneGlHost implements GlHost {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(0, 1, 0, -1, -1000, 1000);
  readonly paintTexture = null;
  readonly size = { width: 1, height: 1, dpr: 1 };

  private readonly canvas: HTMLCanvasElement;
  private readonly listeners = new Set<(frame: GlFrame) => void>();
  private readonly owners = new Set<string>();
  private readonly startedAt = performance.now();
  private clearPending = true;
  private disposed = false;
  private readonly onResize = () => this.resize();
  private readonly onLost: (event: Event) => void;

  constructor(options: { onContextLost: () => void }) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.reelGlCanvas = "";
    Object.assign(canvas.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "-1",
      pointerEvents: "none",
    });
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
    // Everything drawn here works in display values: no conversion on output.
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.onLost = (event: Event) => {
      event.preventDefault();
      options.onContextLost();
    };
    canvas.addEventListener("webglcontextlost", this.onLost);
    document.body.appendChild(canvas);
    this.resize();
    window.addEventListener("resize", this.onResize);
    gsap.ticker.add(this.tick);
  }

  onFrame(listener: (frame: GlFrame) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  requestFrames(owner: string, active: boolean) {
    if (active) this.owners.add(owner);
    else if (this.owners.delete(owner) && !this.owners.size) this.clearPending = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    gsap.ticker.remove(this.tick);
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.listeners.clear();
    this.owners.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const dpr = Math.min(
      MAX_PIXEL_RATIO,
      window.devicePixelRatio || 1,
      Math.sqrt(MAX_PIXELS / (width * height)),
    );
    this.size.width = width;
    this.size.height = height;
    this.size.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.right = width;
    this.camera.bottom = -height;
    this.camera.updateProjectionMatrix();
    this.clearPending = true;
  }

  private readonly tick = (_time: number, deltaMs: number) => {
    if (this.disposed || document.hidden) return;
    if (!this.owners.size && !this.clearPending) return;
    this.clearPending = false;
    const frame: GlFrame = {
      time: (performance.now() - this.startedAt) / 1000,
      dt: Math.min(deltaMs, 50) / 1000,
    };
    for (const listener of [...this.listeners]) listener(frame);
    this.renderer.render(this.scene, this.camera);
  };
}
