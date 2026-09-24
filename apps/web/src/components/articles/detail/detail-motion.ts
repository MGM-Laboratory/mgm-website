import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import { requestHeaderToneSample } from "@/lib/header-tone";

/**
 * What moves with the scroll on the article page, every frame (the shared
 * frame loop's "render" phase, after the smooth scroller has moved the
 * page), and only for what is near the screen:
 *
 * - Pictures "peel" into place, after unseen.co's contained media: a
 *   picture entering from below starts nearer the reader and tipped toward
 *   them, and flattens as it rises until its bottom reaches 70% of the
 *   viewport. Full-bleed pictures get an inner parallax instead (the image
 *   drifts and settles inside its frame).
 * - A picture under a resting pointer leans a hair toward it.
 * - The rail (wide screens) fills its progress line, lights the section
 *   being read, and steps aside while a picture passes behind it.
 * - The slim progress bar (narrow screens) fills.
 *
 * Offsets are cached in document space and re-measured on resize, font and
 * image loads, never per frame; each frame only subtracts the scroll.
 */

type Figure = {
  frame: HTMLElement;
  media: HTMLElement;
  figure: HTMLElement;
  variant: string;
  top: number;
  height: number;
  left: number;
  width: number;
  visible: boolean;
  tiltX: number;
  tiltY: number;
  targetX: number;
  targetY: number;
  written: string;
  mediaWritten: string;
};

type Section = { number: number; top: number; link: HTMLElement | null };

const PEEL_DEPTH = 300;
const PEEL_TIP_DEG = 9;
const PERSPECTIVE = 1600;
const TILT_DEG = 2.2;
// The picture never shows its edge: the drift stays inside what the zoom overscans.
const PARALLAX_FROM = -6;
const PARALLAX_TO = 4;
const PARALLAX_SCALE = 1.17;
const PARALLAX_REST_SCALE = 1.12;

function ease(k: number, dt: number) {
  return 1 - (1 - k) ** (60 * dt);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function sineOut(t: number) {
  return Math.sin((t * Math.PI) / 2);
}

/**
 * Fits a picture's frame to the picture once its size is known (the CMS
 * stores no dimensions): a full-bleed frame takes the picture's own shape
 * (bounded, so a panorama isn't a sliver), and a tall picture never goes
 * full bleed, it sits in the text column instead.
 */
function shapeFigure(figure: Figure, img: HTMLImageElement) {
  if (!img.naturalWidth || !img.naturalHeight) return;
  const ratio = img.naturalWidth / img.naturalHeight;
  figure.figure.style.setProperty("--ad-ratio", clamp(ratio, 1.3, 2.4).toFixed(4));
  if (ratio < 1.05) {
    figure.figure.dataset.shape = "tall";
    if (figure.variant === "wide") figure.variant = "inset";
  }
}

/** A picture that failed to load leaves the story (a pair keeps its other half). */
function dropFigure(figure: Figure) {
  figure.figure.hidden = true;
  const pair = figure.figure.closest<HTMLElement>(".ad-diptych");
  if (
    pair &&
    [...pair.querySelectorAll<HTMLElement>("[data-ad-figure]")].every((item) => item.hidden)
  ) {
    pair.hidden = true;
  }
}

export class StoryMotion {
  private figures: Figure[] = [];
  private sections: Section[] = [];
  private readonly rail: HTMLElement | null;
  private readonly progress: HTMLElement | null;
  private readonly bar: HTMLElement | null;
  private storyTop = 0;
  private storyHeight = 1;
  private railBand = { top: 0, bottom: 0, left: 0, right: 0 };
  private vh = 1;
  private vw = 1;
  private active = 0;
  private covered = false;
  private measureQueued = true;
  private offFrame: (() => void) | null = null;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly observer: IntersectionObserver | null;
  private readonly cleanups: (() => void)[] = [];
  private lastProgress = -1;
  private pointer: { x: number; y: number } | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: { animate: boolean; peel: boolean },
  ) {
    const story = root.querySelector<HTMLElement>("[data-ad-story]");
    this.rail = root.querySelector<HTMLElement>("[data-ad-rail]");
    this.progress = root.querySelector<HTMLElement>("[data-ad-progress]");
    this.bar = document.querySelector<HTMLElement>("[data-ad-read-bar]");

    for (const element of root.querySelectorAll<HTMLElement>("[data-ad-figure]")) {
      const frame = element.querySelector<HTMLElement>("[data-ad-frame]");
      const media = element.querySelector<HTMLElement>("[data-ad-media]");
      if (!frame || !media) continue;
      const figure: Figure = {
        frame,
        media,
        figure: element,
        variant: element.dataset.variant ?? "inset",
        top: 0,
        height: 0,
        left: 0,
        width: 0,
        visible: false,
        tiltX: 0,
        tiltY: 0,
        targetX: 0,
        targetY: 0,
        written: "",
        mediaWritten: "",
      };
      this.figures.push(figure);
      const img = media.querySelector("img");
      if (!img) continue;
      if (img.complete) {
        if (img.naturalWidth) shapeFigure(figure, img);
        else if (img.currentSrc) dropFigure(figure);
      } else {
        const onLoad = () => {
          shapeFigure(figure, img);
          this.queueMeasure();
        };
        const onError = () => {
          dropFigure(figure);
          this.queueMeasure();
        };
        img.addEventListener("load", onLoad);
        img.addEventListener("error", onError);
        this.cleanups.push(() => {
          img.removeEventListener("load", onLoad);
          img.removeEventListener("error", onError);
        });
      }
    }

    for (const section of root.querySelectorAll<HTMLElement>("[data-ad-section]")) {
      const number = Number(section.dataset.adSection);
      this.sections.push({
        number,
        top: 0,
        link: root.querySelector<HTMLElement>(`[data-ad-index="${number}"]`),
      });
    }

    this.resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.queueMeasure()) : null;
    if (story) this.resizeObserver?.observe(story);
    this.observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(this.onIntersect, { rootMargin: "25% 0px 25% 0px" })
        : null;
    for (const figure of this.figures) this.observer?.observe(figure.figure);

    window.addEventListener("resize", this.queueMeasure);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    void document.fonts?.ready.then(() => this.queueMeasure());
    this.offFrame = addFrameCallback("render", this.tick);
    this.measure(story);
  }

  /** Re-reads every offset on the next frame. */
  readonly queueMeasure = () => {
    this.measureQueued = true;
  };

  dispose() {
    this.offFrame?.();
    this.offFrame = null;
    this.resizeObserver?.disconnect();
    this.observer?.disconnect();
    window.removeEventListener("resize", this.queueMeasure);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  /** Drops every per-frame transform (reduced motion switched on mid-visit). */
  stopMotion() {
    this.options.animate = false;
    for (const figure of this.figures) {
      figure.frame.style.transform = "";
      figure.media.style.transform = "";
      figure.written = figure.mediaWritten = "";
    }
  }

  private readonly onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const figure = this.figures.find((item) => item.figure === entry.target);
      if (figure) figure.visible = entry.isIntersecting;
    }
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") {
      this.pointer = null;
      return;
    }
    this.pointer = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerLeave = () => {
    this.pointer = null;
  };

  private measure(story = this.root.querySelector<HTMLElement>("[data-ad-story]")) {
    this.measureQueued = false;
    this.vh = window.innerHeight || 1;
    this.vw = window.innerWidth || 1;
    const scrollY = window.scrollY;
    for (const figure of this.figures) {
      // The figure's box, not the frame's: the frame carries our own
      // transform. The figure is the frame's offset parent (detail.css).
      const rect = figure.figure.getBoundingClientRect();
      const frame = figure.frame;
      figure.top = rect.top + scrollY + frame.offsetTop;
      figure.height = frame.offsetHeight;
      figure.left = rect.left + frame.offsetLeft;
      figure.width = frame.offsetWidth;
    }
    for (const section of this.sections) {
      const element = this.root.querySelector<HTMLElement>(`[data-ad-section="${section.number}"]`);
      section.top = element ? element.getBoundingClientRect().top + scrollY : 0;
    }
    if (story) {
      const rect = story.getBoundingClientRect();
      this.storyTop = rect.top + scrollY;
      this.storyHeight = Math.max(1, rect.height);
    }
    const inner = this.rail?.firstElementChild as HTMLElement | null;
    if (inner && this.rail && getComputedStyle(this.rail).display !== "none") {
      const rect = inner.getBoundingClientRect();
      const top = Number.parseFloat(getComputedStyle(inner).top) || 0;
      this.railBand = { top, bottom: top + rect.height, left: rect.left, right: rect.right };
    } else {
      this.railBand = { top: 0, bottom: 0, left: 0, right: 0 };
    }
  }

  private readonly tick = (_time: number, dt: number) => {
    if (this.measureQueued) this.measure();
    const scrollY = window.scrollY;
    const vh = this.vh;

    if (this.options.animate) {
      for (const figure of this.figures) {
        if (!figure.visible) continue;
        this.moveFigure(figure, scrollY, dt);
      }
    }

    // Reading progress through the story (not the threshold below it).
    const progress = clamp((scrollY + vh * 0.62 - this.storyTop) / this.storyHeight);
    if (Math.abs(progress - this.lastProgress) > 0.0005) {
      this.lastProgress = progress;
      const value = progress.toFixed(4);
      if (this.progress) this.progress.style.transform = `scaleY(${value})`;
      if (this.bar) this.bar.style.transform = `scaleX(${value})`;
    }

    let active = 0;
    for (const section of this.sections) {
      if (section.top - scrollY < vh * 0.42) active = section.number;
    }
    if (active !== this.active) {
      this.active = active;
      for (const section of this.sections) {
        if (!section.link) continue;
        if (section.number === active) section.link.dataset.active = "";
        else delete section.link.dataset.active;
      }
    }

    // The rail steps aside while a picture that reaches into it passes.
    if (this.rail && this.railBand.bottom > this.railBand.top) {
      let covered = false;
      for (const figure of this.figures) {
        if (figure.variant === "inset") continue;
        const top = figure.top - scrollY;
        const bottom = top + figure.height;
        const overlapsX =
          figure.left < this.railBand.right && figure.left + figure.width > this.railBand.left;
        if (overlapsX && top < this.railBand.bottom + 24 && bottom > this.railBand.top - 24) {
          covered = true;
          break;
        }
      }
      if (covered !== this.covered) {
        this.covered = covered;
        if (covered) this.rail.dataset.covered = "";
        else delete this.rail.dataset.covered;
        requestHeaderToneSample();
      }
    }
  };

  private moveFigure(figure: Figure, scrollY: number, dt: number) {
    const vh = this.vh;
    const top = figure.top - scrollY;
    const height = figure.height;

    // Lean toward a resting pointer over the picture.
    let targetX = 0;
    let targetY = 0;
    const pointer = this.pointer;
    if (pointer && figure.variant !== "wide") {
      const inside =
        pointer.x >= figure.left &&
        pointer.x <= figure.left + figure.width &&
        pointer.y >= top &&
        pointer.y <= top + height;
      if (inside) {
        const nx = ((pointer.x - figure.left) / figure.width) * 2 - 1;
        const ny = ((pointer.y - top) / height) * 2 - 1;
        targetX = -ny * TILT_DEG;
        targetY = nx * TILT_DEG;
      }
    }
    const k = ease(0.08, dt);
    figure.tiltX += (targetX - figure.tiltX) * k;
    figure.tiltY += (targetY - figure.tiltY) * k;

    if (figure.variant === "wide") {
      // Inner parallax across the whole pass through the viewport.
      const t = clamp((vh - top) / (vh + height));
      const y = PARALLAX_FROM + (PARALLAX_TO - PARALLAX_FROM) * t;
      const scale = PARALLAX_SCALE + (PARALLAX_REST_SCALE - PARALLAX_SCALE) * clamp(t * 1.6);
      const media = `translate3d(0,${y.toFixed(2)}%,0) scale(${scale.toFixed(4)})`;
      if (media !== figure.mediaWritten) {
        figure.mediaWritten = media;
        figure.media.style.transform = media;
      }
      return;
    }

    let depth = 0;
    let tip = 0;
    // Side-by-side pictures would lean into each other: they only tilt.
    if (this.options.peel && figure.variant !== "pair") {
      // "top bottom" to "bottom 70%": flat by the time its bottom is at 70%.
      const start = vh;
      const end = vh * 0.7 - height;
      const t = clamp((start - top) / Math.max(1, start - end));
      const u = sineOut(t) * 1.5;
      depth = Math.max(0, 1.5 - u) * (PEEL_DEPTH / 1.5);
      // The tip clears from the top edge down, gone by a third of the way.
      tip = clamp(1 - u) * PEEL_TIP_DEG;
    }
    const tiltX = figure.tiltX + tip;
    const transform =
      depth < 0.05 && Math.abs(tiltX) < 0.01 && Math.abs(figure.tiltY) < 0.01
        ? ""
        : `perspective(${PERSPECTIVE}px) translate3d(0,0,${depth.toFixed(1)}px) rotateX(${tiltX.toFixed(3)}deg) rotateY(${figure.tiltY.toFixed(3)}deg)`;
    if (transform !== figure.written) {
      figure.written = transform;
      figure.frame.style.transform = transform;
    }
  }
}
