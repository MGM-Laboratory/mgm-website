import gsap from "gsap";

import { ease, lerp, saturate } from "./springs";

export type IrisElements = {
  /** The player's fixed root; faded instead of irised under reduced motion. */
  root: HTMLElement;
  /** The DOM stage (video and controls): transparent while the iris draws. */
  stage: HTMLElement;
  /** The iris itself: ink disc, video frame and ring, drawn in 2D. */
  canvas: HTMLCanvasElement;
};

export type IrisPoint = { x: number; y: number; r: number };
type Box = { x: number; y: number; width: number; height: number };

const OPEN_SECONDS = 0.72;
const RING_LEAD = 0.05;
const CLOSE_SECONDS = 0.62;
const FADE_SECONDS = 0.15;
/** Share of a close spent on the real stage while its controls fade. */
const HANDOVER = 0.16;
const INK = "#0e1116";
const MAX_DENSITY = 1.5;

/**
 * The player's open and close: a Bauhaus iris. A circle of ink opens from
 * the Play button, the video already playing inside it, with a yellow ring
 * racing just ahead of its edge. It closes by shrinking onto a point (the
 * cursor that was clicked, or the Play button again), the ring leading it
 * inwards.
 *
 * The circle is drawn in a 2D canvas, the current video frame clipped
 * inside it, rather than clipping the live DOM: a playing video (and any
 * other composited layer) is not reliably masked by a rounded clip, which
 * showed as black rectangles beside the circle mid-transition. The DOM
 * stage is transparent while the iris draws and takes over once it lands.
 *
 * Closing mid-open reverses from wherever the iris is: the close starts
 * from the current centre and radius.
 */
export class Iris {
  private width = 0;
  private height = 0;
  private density = 1;
  private cx = 0;
  private cy = 0;
  private r = 0;
  private ringR = 0;
  private ringWidth = 0;
  private ringAlpha = 0;
  private opacity = 1;
  private drawing = false;
  private state: "idle" | "opening" | "open" | "closing" | "closed" = "idle";
  private progress = { open: 0, ring: 0, close: 0 };
  private tweens: gsap.core.Tween[] = [];
  private from: IrisPoint = { x: 0, y: 0, r: 0 };
  private to: IrisPoint = { x: 0, y: 0, r: 0 };
  private concentric = false;
  private tracking = false;
  private readonly context: CanvasRenderingContext2D | null;
  ringColor = "#f7bf33";

  constructor(
    private readonly el: IrisElements,
    private readonly reduced: () => boolean,
  ) {
    this.context = el.canvas.getContext("2d");
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.density = Math.min(window.devicePixelRatio || 1, MAX_DENSITY);
    const { canvas } = this.el;
    canvas.width = Math.max(1, Math.round(width * this.density));
    canvas.height = Math.max(1, Math.round(height * this.density));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  /** 0 while closed, rising to 1 as the iris opens; the cursor keys off it. */
  get openness() {
    if (this.state === "open") return 1;
    if (this.state === "opening") return this.reduced() ? 1 : this.progress.open;
    if (this.state === "closing") return 1 - this.progress.close;
    return 0;
  }

  /** Whether the iris stands in for the stage this frame (its controls wait). */
  get busy() {
    return this.state !== "open";
  }

  /** How far a circle centred at (x, y) must reach to cover the stage. */
  private cover(x: number, y: number) {
    const dx = Math.max(x, this.width - x);
    const dy = Math.max(y, this.height - y);
    return Math.hypot(dx, dy) + 2;
  }

  open(origin: IrisPoint, instant: boolean, done: () => void) {
    this.kill();
    this.state = "opening";
    this.from = origin;
    if (instant || this.reduced()) {
      this.drawing = false;
      this.opacity = instant ? 1 : 0;
      this.progress.open = 1;
      this.tweens.push(
        gsap.to(this, {
          opacity: 1,
          duration: instant ? 0 : FADE_SECONDS,
          ease: "none",
          onComplete: () => this.finishOpen(done),
        }),
      );
      return;
    }
    this.drawing = true;
    this.opacity = 1;
    this.progress.open = 0;
    this.progress.ring = 0;
    this.tweens.push(
      gsap.to(this.progress, { ring: 1, duration: OPEN_SECONDS, ease: "none" }),
      gsap.to(this.progress, {
        open: 1,
        duration: OPEN_SECONDS,
        delay: RING_LEAD,
        ease: "none",
        onComplete: () => this.finishOpen(done),
      }),
    );
  }

  private finishOpen(done: () => void) {
    this.state = "open";
    this.drawing = false;
    this.opacity = 1;
    done();
  }

  close(target: IrisPoint, done: () => void) {
    const wasOpen = this.state === "open" || !this.drawing;
    const current: IrisPoint = { x: this.cx, y: this.cy, r: this.r };
    this.kill();
    this.state = "closing";
    this.tracking = false;
    this.progress.close = 0;
    if (this.reduced()) {
      this.drawing = false;
      this.tweens.push(
        gsap.to(this, {
          opacity: 0,
          duration: FADE_SECONDS,
          ease: "none",
          onComplete: () => this.finishClose(done),
        }),
      );
      return;
    }
    // Fully open: a circle centred on the target, just big enough to still
    // cover the stage, shrinks concentrically onto it. Mid-open: shrink from
    // where the circle is, drifting its centre onto the target.
    this.concentric = wasOpen;
    this.from = wasOpen ? { x: target.x, y: target.y, r: this.cover(target.x, target.y) } : current;
    this.to = target;
    this.drawing = true;
    this.tweens.push(
      gsap.to(this.progress, {
        close: 1,
        duration: CLOSE_SECONDS,
        ease: "none",
        onComplete: () => this.finishClose(done),
      }),
    );
  }

  /** Keeps a close glued to a moving, shrinking point (the cursor it collapses into). */
  retarget(x: number, y: number, r: number) {
    if (this.state !== "closing") return;
    this.to = { x, y, r };
    this.tracking = true;
  }

  private finishClose(done: () => void) {
    this.state = "closed";
    this.opacity = 0;
    done();
  }

  /**
   * Draws the current frame: the circle, the video frame inside it (in
   * `box`, the picture's rectangle on the stage) and the ring.
   */
  render(video: HTMLVideoElement, box: Box) {
    const { root, stage, canvas } = this.el;
    let fillCircle = this.drawing;
    if (this.state === "opening" && this.drawing) {
      const origin = this.from;
      const full = this.cover(origin.x, origin.y);
      const p = saturate(this.progress.open);
      this.cx = origin.x;
      this.cy = origin.y;
      this.r = lerp(origin.r * 0.85, full, ease.iris(p));
      // The ring rides just ahead of the edge; the gap opens mid-flight and
      // closes again as the iris lands.
      const ringP = saturate(this.progress.ring);
      this.ringR = this.r + 6 + 58 * Math.sin(Math.PI * Math.min(1, ringP * 1.05));
      this.ringWidth = 3 + 11 * Math.sin(Math.PI * Math.min(1, ringP * 1.1));
      this.ringAlpha = 1 - saturate((ringP - 0.74) / 0.26);
    } else if (this.state === "closing" && this.drawing) {
      const p = saturate(this.progress.close);
      const t = ease.cubicInOut(p);
      const move = this.concentric ? 1 : ease.quadInOut(p);
      this.cx = lerp(this.from.x, this.to.x, move);
      this.cy = lerp(this.from.y, this.to.y, move);
      this.r = lerp(this.from.r, this.to.r, t);
      // Collapsing into the cursor: the disc on top hides the last of the
      // circle, and once there the circle shrinks with the disc as it pops.
      if (this.tracking && p > 0.8) this.r = Math.min(this.r, this.to.r);
      const lead = 46 * Math.sin(Math.PI * p);
      this.ringR = Math.max(0, this.r - lead);
      this.ringWidth = 2 + 9 * Math.sin(Math.PI * Math.min(1, p * 1.15));
      this.ringAlpha = saturate(p / 0.12) * (1 - saturate((p - 0.82) / 0.18));
      this.opacity = this.tracking
        ? 1 - saturate((p - 0.96) / 0.04)
        : 1 - saturate((p - 0.9) / 0.1);
      // A fully open close starts on the real stage while its controls fade,
      // then hands over to the drawn circle, which is identical there.
      if (this.concentric && p < HANDOVER) fillCircle = false;
    }

    root.style.opacity = this.opacity.toFixed(3);
    stage.style.opacity = this.drawing && fillCircle ? "0" : "1";
    canvas.style.display = this.drawing ? "block" : "none";
    if (!this.drawing || !this.context) return;

    const ctx = this.context;
    const d = this.density;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (fillCircle && this.r > 0.5) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, this.width, this.height);
      if (video.readyState >= 2) {
        try {
          ctx.drawImage(video, box.x, box.y, box.width, box.height);
        } catch {
          // A frame that can't be drawn this tick is drawn on the next.
        }
      }
      ctx.restore();
    }
    if (this.ringAlpha > 0.001 && this.ringR > 0.5) {
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.ringR, 0, Math.PI * 2);
      ctx.globalAlpha = this.ringAlpha;
      ctx.lineWidth = this.ringWidth;
      ctx.strokeStyle = this.ringColor;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  kill() {
    for (const tween of this.tweens) tween.kill();
    this.tweens = [];
  }
}
