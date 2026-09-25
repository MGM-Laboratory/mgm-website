/**
 * The cover without the world (DOM mode, touch, a failed WebGL texture):
 *
 * - Emergence: a wave-shaped mask sweeps across the picture while a band of
 *   foam rides its edge and the picture settles from a wet, slightly
 *   swollen state (CSS keyframes in detail.css, started by `data-emerge`).
 * - Ripples: a small 2D canvas over the frame draws rings of light where
 *   the pointer passes or a finger taps, so the water stays interactive.
 *   It only draws while a ring is alive.
 */

const MAX_RINGS = 10;
const RING_SECONDS = 1.5;
const RING_SPEED = 260;
const MOVE_EVERY_MS = 90;
const MOVE_TRAVEL = 26;

type Ring = { x: number; y: number; born: number; strength: number };

export class DomCover {
  private readonly canvas: HTMLCanvasElement | null = null;
  private readonly context: CanvasRenderingContext2D | null = null;
  private rings: Ring[] = [];
  private raf = 0;
  private lastMove = { x: 0, y: 0, at: 0 };
  private readonly cleanups: (() => void)[] = [];
  private width = 1;
  private height = 1;
  private ratio = 1;
  private disposed = false;

  constructor(
    private readonly figure: HTMLElement,
    private readonly frame: HTMLElement,
    interactive: boolean,
  ) {
    if (!interactive) return;
    const canvas = document.createElement("canvas");
    canvas.className = "ad-cover-ripples";
    canvas.setAttribute("aria-hidden", "true");
    frame.appendChild(canvas);
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    const resize = () => this.resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(frame);
    resize();
    const onMove = (event: PointerEvent) => this.onMove(event);
    const onDown = (event: PointerEvent) => this.onDown(event);
    frame.addEventListener("pointermove", onMove);
    frame.addEventListener("pointerdown", onDown);
    this.cleanups.push(() => {
      observer?.disconnect();
      frame.removeEventListener("pointermove", onMove);
      frame.removeEventListener("pointerdown", onDown);
      canvas.remove();
    });
  }

  /** Starts the emergence; `instant` shows the picture settled. */
  emerge(instant = false) {
    this.figure.dataset.emerge = instant ? "instant" : "";
  }

  dispose() {
    this.disposed = true;
    window.cancelAnimationFrame(this.raf);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  private resize() {
    const canvas = this.canvas;
    if (!canvas) return;
    const rect = this.frame.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(this.width * this.ratio);
    canvas.height = Math.round(this.height * this.ratio);
  }

  private local(event: PointerEvent) {
    const rect = this.frame.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onMove(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    const { x, y } = this.local(event);
    const now = performance.now();
    const travel = Math.hypot(x - this.lastMove.x, y - this.lastMove.y);
    if (travel < MOVE_TRAVEL || now - this.lastMove.at < MOVE_EVERY_MS) return;
    this.lastMove = { x, y, at: now };
    this.add(x, y, 0.45);
  }

  private onDown(event: PointerEvent) {
    const { x, y } = this.local(event);
    this.add(x, y, 1);
    window.setTimeout(() => this.add(x, y, 0.55), 150);
  }

  private add(x: number, y: number, strength: number) {
    if (!this.context || this.disposed) return;
    this.rings.push({ x, y, born: performance.now(), strength });
    if (this.rings.length > MAX_RINGS) this.rings.shift();
    if (!this.raf) this.raf = window.requestAnimationFrame(this.draw);
  }

  private readonly draw = () => {
    this.raf = 0;
    const context = this.context;
    if (!context) return;
    const now = performance.now();
    this.rings = this.rings.filter((ring) => (now - ring.born) / 1000 < RING_SECONDS);
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    for (const ring of this.rings) {
      const age = (now - ring.born) / 1000;
      const t = age / RING_SECONDS;
      const radius = 8 + age * RING_SPEED;
      const alpha = (1 - t) * (1 - t) * ring.strength;
      // A bright crest with a faint shadow just inside it: light on water.
      context.lineWidth = 2.2 + ring.strength * 2.4 * (1 - t);
      context.strokeStyle = `rgba(255,255,255,${(0.55 * alpha).toFixed(3)})`;
      context.beginPath();
      context.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
      context.stroke();
      context.lineWidth = 1.2;
      context.strokeStyle = `rgba(0,0,0,${(0.12 * alpha).toFixed(3)})`;
      context.beginPath();
      context.arc(ring.x, ring.y, Math.max(1, radius - 5), 0, Math.PI * 2);
      context.stroke();
    }
    if (this.rings.length) this.raf = window.requestAnimationFrame(this.draw);
  };
}
