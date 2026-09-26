import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";

import {
  clamp,
  easeSettle,
  expoInOut,
  expoOut,
  fit,
  mix,
  pinOffset,
  quadInOut,
  saturate,
  smoothstep,
  stepSpring,
} from "@/components/reel/reel-math";
import { lineHalfWidth, linePath, reelLine } from "@/components/reel/reel-line";
import { ReelTestCard } from "@/components/reel/reel-test-card";
import { finePointer, onPointer, pointer } from "@/lib/motion/pointer";
import { random, randomInt, randomPick } from "@/lib/random";
import { motionAllowed, onReducedMotion } from "@/lib/reduced-motion";
import { isReelPlayerOpen, onReelPlayerClosed, openReelPlayer } from "@/lib/reel-player";
import { isScrollLocked } from "@/lib/scroll-lock";

/**
 * The reel section's brain (reel-section.tsx renders the markup).
 *
 * Every frame it reads ONE rect (the section's top on screen) and derives
 * the rest from layout offsets cached on resize:
 * - `w`, the morph progress from the thumbnail to the big video, from the
 *   scroll position on screen (the smoothed one on the homepage);
 * - `c`, the pin: how far the big video lags the page (reel-math.ts);
 * - the rect the picture morphs from (the thumbnail, held at the centre of
 *   the screen once it gets there) and to (the big frame plus `c`);
 * - how much of the ribbon is drawn.
 * The DOM version and the WebGL layer both draw from that one state.
 *
 * The snap: while the morph is half done and the visitor stops giving
 * input, the page keeps going in the direction of their last wheel, key or
 * drag, ramping to one viewport height per second over a second, and stops
 * exactly at the start or the end of the morph. It drives the NATIVE scroll
 * position (the smoother follows it) and is gated on the native position
 * too: the smoothed one lags by hundreds of pixels at that speed, so
 * stopping on what is on screen would glide straight through the hold.
 * Scrolls the page makes by itself (a scrollIntoView, ScrollSmoother's
 * scrollTo, focus) disarm it, so scripted scrolls are never hijacked.
 */

type Rect = { x: number; y: number; w: number; h: number };

export type ReelFrameState = {
  vw: number;
  vh: number;
  diag: number;
  /** Seconds since the controller started (the ribbon's idle clock). */
  time: number;
  mobile: boolean;
  reduced: boolean;
  /** Section top on screen, px. */
  secY: number;
  /** Morph progress on screen, 0 thumbnail to 1 big video. */
  w: number;
  /** The rect the picture morphs from and to, viewport px, y down. */
  from: Rect;
  to: Rect;
  /** Corner radius, px. */
  radius: number;
  /** Ribbon draw ratio 0..1 and its half width, px. */
  lineReveal: number;
  lineHalfWidth: number;
  /** Radial hover on the picture: amount 0..1 and centre in the picture's uv (0..1, y down). */
  hover: number;
  hoverU: number;
  hoverV: number;
  /** Whether the section is near the viewport (the WebGL layer draws only then). */
  near: boolean;
};

const KEY_DIRECTION: Record<string, number> = {
  ArrowDown: 1,
  PageDown: 1,
  End: 1,
  ArrowUp: -1,
  PageUp: -1,
  Home: -1,
};

/**
 * The stacked layout (no thumbnail, no morph, no pin): phones, and tablets
 * held upright, where a 10vw title and a half-width description would
 * crowd each other. Keep in step with the same query in reel.module.css.
 */
export const REEL_COMPACT_QUERY =
  "(max-width: 812px), (orientation: portrait) and (max-width: 1100px)";

function compactLayout() {
  return window.matchMedia(REEL_COMPACT_QUERY).matches;
}

type MarkKind = "plus" | "x" | "circle" | "triangle" | "half";
const MARK_KINDS: MarkKind[] = ["plus", "x", "circle", "triangle", "half"];

type ReelElements = {
  lineSvg: SVGSVGElement | null;
  linePath: SVGPathElement | null;
  title: HTMLElement | null;
  titleInner: HTMLElement | null;
  titleWords: HTMLElement[];
  content: HTMLElement | null;
  desc: HTMLElement | null;
  descWords: HTMLElement[];
  ctaLift: HTMLElement | null;
  thumb: HTMLElement | null;
  pin: HTMLElement | null;
  frame: HTMLElement | null;
  visual: HTMLElement | null;
  media: HTMLElement | null;
  markSlots: HTMLElement[];
  markEmerges: HTMLElement[];
  markSwaps: HTMLElement[];
  strips: HTMLElement[];
  stripItems: HTMLElement[];
  stripTexts: HTMLElement[][];
  /** Per word, its letters (the element that leans). */
  words: HTMLElement[][];
  /** Per word, each letter's rising track. */
  charTracks: HTMLElement[][];
  watch: HTMLButtonElement | null;
  caption: HTMLElement | null;
  hoverTarget: HTMLElement | null;
  readout: HTMLElement | null;
  readoutLines: HTMLElement[];
};

const q = <T extends Element = HTMLElement>(root: ParentNode, name: string) =>
  root.querySelector<T>(`[data-reel="${name}"]`);
const qa = <T extends Element = HTMLElement>(root: ParentNode, name: string) =>
  Array.from(root.querySelectorAll<T>(`[data-reel="${name}"]`));

/** Writes a style only when it changed (most values rest most frames). */
type Styled = HTMLElement | SVGElement;

class StyleWriter {
  private readonly last = new WeakMap<Styled, Map<string, string>>();
  set(el: Styled | null | undefined, prop: string, value: string) {
    if (!el) return;
    let map = this.last.get(el);
    if (!map) {
      map = new Map();
      this.last.set(el, map);
    }
    if (map.get(prop) === value) return;
    map.set(prop, value);
    el.style.setProperty(prop, value);
  }
  clear(el: Styled | null | undefined, prop: string) {
    if (!el) return;
    this.last.get(el)?.delete(prop);
    el.style.removeProperty(prop);
  }
}

function editableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Solves the projective map from the unit square to a quad (corners TL, TR, BR, BL). */
function quadMatrix(
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
) {
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let a: number, b: number, d: number, e: number, g: number, h: number;
  const den = dx1 * dy2 - dx2 * dy1;
  if ((Math.abs(dx3) < 1e-6 && Math.abs(dy3) < 1e-6) || Math.abs(den) < 1e-9) {
    g = 0;
    h = 0;
    a = x1 - x0;
    b = x3 - x0;
    d = y1 - y0;
    e = y3 - y0;
  } else {
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + h * x3;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + h * y3;
  }
  const f = (n: number) => (Math.abs(n) < 1e-9 ? "0" : n.toFixed(6));
  return `matrix3d(${f(a / width)},${f(d / width)},0,${f(g / width)},${f(b / height)},${f(e / height)},0,${f(h / height)},0,0,1,0,${f(x0)},${f(y0)},0,1)`;
}

export type ReelControllerOptions = {
  src?: string;
  /** Called when the GL layer should consider starting (the section is getting close). */
  onApproach?: () => void;
};

export class ReelController {
  readonly root: HTMLElement;
  readonly src?: string;
  readonly hasVideo: boolean;
  readonly state: ReelFrameState;
  readonly video: HTMLVideoElement | null;
  readonly card: ReelTestCard | null;

  private readonly options: ReelControllerOptions;
  private readonly styles = new StyleWriter();
  private readonly offs: Array<() => void> = [];
  private disposed = false;
  private reduced: boolean;
  private fine: boolean;
  private glMode = false;
  private syncedFrame = -1;
  private clock = 0;

  // Elements.
  private readonly el: ReelElements;
  private readonly tints: HTMLElement[];

  // Layout, cached on resize (section-relative y, viewport x).
  private thumbRel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private frameRel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private titleRel = 0;
  private contentRel = 0;
  private marginTop = 0;
  private cross = 14;
  private stripHalf = 0;
  private lineDiag = 0;
  private lineHeight = 0;
  private indent = 0;
  /** The pin offset: computed this frame, and the one on the element now. */
  private pinC = 0;
  private pinApplied = 0;
  private measured = false;

  // Scroll positions this frame.
  private p = 0;
  private g = 1;

  // Entrance and decoration timers (seconds, as in the section's timing).
  private titleT = 0;
  private descT = 0;
  private ctaR = 0;
  private decoT = 0;
  private showT = 0;
  private hov2 = 0;
  private hov3 = 0;
  private hoverTime = 0;
  private stripTime = 0;
  private rollTime = 0;
  private rollChars: [number, number] = [0, 0];
  private titleStarted = false;
  private contentStarted = false;
  private near = false;

  // Hover and press.
  private buttonHover = false;
  private hoverWas = false;
  private hoverCount = 0;
  private buttonFocus = false;
  private hoverSince = 0;
  private readonly press: [number, number] = [0, 0];
  private pressTarget = 0;
  private readonly leans: Array<Array<[number, number]>> = [];
  private readonly radial: [number, number] = [0, 0];
  private radialU = 0.5;
  private radialV = 0.5;

  // Snap.
  private snapDir = 0;
  private armed = false;
  private lastInputAt = -1e9;
  private inputThisFrame = false;
  private touching = false;
  private lastTouchY = 0;
  private scrollbarDrag = false;
  private lastNativeY = 0;
  private autoWrittenY = Number.NaN;
  private stillFrames = 0;
  private ramp = 0;

  // Idle variations.
  private nextSwapAt = 3;
  private nextStripAt = 3.5;
  private stripIndex = 0;
  private stripFront = 0;
  private readoutState = 2;
  private readoutFront = 0;
  private nextReadoutAt = 3.2;
  private lastTimecode: string | null = null;
  private loops = 1;
  private lastVideoTime = 0;
  private readonly stripLines: readonly string[];
  private playerOpen = false;
  private io: IntersectionObserver | null = null;
  private approachIo: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly coordinates: string;

  constructor(
    root: HTMLElement,
    options: ReelControllerOptions & { stripLines: readonly string[]; coordinates: string },
  ) {
    this.root = root;
    this.options = options;
    this.src = options.src;
    this.hasVideo = Boolean(options.src);
    this.stripLines = options.stripLines;
    this.coordinates = options.coordinates;
    this.reduced = !motionAllowed();
    this.fine = finePointer();

    const words = qa(root, "play-word");
    this.el = {
      lineSvg: root.querySelector("[data-reel='line-svg']"),
      linePath: root.querySelector("[data-reel='line-path']"),
      title: q(root, "title"),
      titleInner: q(root, "title-inner"),
      titleWords: qa(root, "title-word"),
      content: q(root, "content"),
      desc: q(root, "desc"),
      descWords: qa(root, "desc-word"),
      ctaLift: q(root, "cta-lift"),
      thumb: q(root, "thumb"),
      pin: q(root, "pin"),
      frame: q(root, "frame"),
      visual: q(root, "visual"),
      media: q(root, "media"),
      markSlots: qa(root, "mark-slot"),
      markEmerges: qa(root, "mark-emerge"),
      markSwaps: qa(root, "mark-swap"),
      strips: qa(root, "strip"),
      stripItems: qa(root, "strip-item"),
      stripTexts: qa(root, "strip-item").map((item) => qa(item, "strip-text")),
      words: words.map((word) => qa(word, "char")),
      charTracks: words.map((word) => qa(word, "char-track")),
      watch: q<HTMLButtonElement>(root, "watch"),
      caption: q(root, "caption"),
      hoverTarget: q(root, "watch") ?? q(root, "frame"),
      readout: q(root, "readout"),
      readoutLines: qa(root, "readout-line"),
    };
    this.tints = qa(root, "tint");
    // The incoming halves of the rolling texts wait below their masks.
    for (const pair of this.el.stripTexts) if (pair[1]) gsap.set(pair[1], { yPercent: 110 });
    if (this.el.readoutLines[1]) gsap.set(this.el.readoutLines[1], { yPercent: 110 });
    for (const chars of this.el.words) {
      this.leans.push(chars.map(() => [0, 0] as [number, number]));
    }

    this.video = root.querySelector("video[data-reel='video']");
    const cardCanvas = root.querySelector<HTMLCanvasElement>("canvas[data-reel='card']");
    this.card = cardCanvas ? new ReelTestCard(cardCanvas) : null;

    this.state = {
      vw: window.innerWidth,
      vh: window.innerHeight,
      diag: Math.hypot(window.innerWidth, window.innerHeight),
      time: 0,
      mobile: compactLayout(),
      reduced: this.reduced,
      secY: 0,
      w: 0,
      from: { x: 0, y: 0, w: 0, h: 0 },
      to: { x: 0, y: 0, w: 0, h: 0 },
      radius: 20,
      lineReveal: 0,
      lineHalfWidth: 10,
      hover: 0,
      hoverU: 0.5,
      hoverV: 0.5,
      near: false,
    };

    this.lastNativeY = window.scrollY;
    this.measure();
    this.bind();
    this.startIdleState();
    if (this.reduced) this.applyStatic();
    this.sync(true);
    this.render(0);
    gsap.ticker.add(this.tick);
    this.offs.push(() => gsap.ticker.remove(this.tick));
  }

  // ------------------------------------------------------------ public

  /** The GL layer took over the picture and the ribbon (or gave them back). */
  setGlMode(on: boolean) {
    this.glMode = on;
    if (on) this.root.dataset.reelMode = "gl";
    else delete this.root.dataset.reelMode;
  }

  /** Whether motion (and so the WebGL layer) is allowed right now. */
  get motion() {
    return !this.reduced;
  }

  /**
   * Brings the frame state up to date for this ticker frame (idempotent
   * within a frame). The WebGL layer calls it from its host's frame
   * callback, which may run before or after this controller's own tick.
   */
  sync(force = false) {
    const frame = gsap.ticker.frame;
    if (!force && frame === this.syncedFrame) return this.state;
    this.syncedFrame = frame;
    const s = this.state;
    const section = this.root.getBoundingClientRect();
    const vh = s.vh;
    const secY = section.top;
    s.secY = secY;
    s.time = this.clock;
    s.near = this.near;

    const smoother = ScrollSmoother.get();
    const visible = smoother ? smoother.scrollTop() : window.scrollY;
    const secDoc = secY + visible;

    const thumbDoc = secDoc + this.thumbRel.y;
    const frameDoc = secDoc + this.frameRel.y;
    const frameH = this.frameRel.h;
    const heldY = (vh - frameH) / 2 + this.marginTop;
    this.p = thumbDoc - (vh - this.thumbRel.h) / 2;
    this.g = frameDoc + frameH / 2 - this.marginTop / 2;

    const still = s.mobile || this.reduced;
    s.w = still ? 1 : fit(visible, this.p, this.g, 0, 1);
    const c = still ? 0 : pinOffset(visible - frameDoc + heldY, vh);
    this.pinC = c;

    const thumbY = secY + this.thumbRel.y;
    s.from.x = this.thumbRel.x;
    s.from.y = Math.max(thumbY, (vh - this.thumbRel.h) / 2);
    s.from.w = this.thumbRel.w;
    s.from.h = this.thumbRel.h;
    s.to.x = this.frameRel.x;
    s.to.y = secY + this.frameRel.y + c;
    s.to.w = this.frameRel.w;
    s.to.h = frameH;
    if (still) {
      s.from.x = s.to.x;
      s.from.y = s.to.y;
      s.from.w = s.to.w;
      s.from.h = s.to.h;
    }

    s.lineReveal = this.reduced ? 1 : quadInOut(saturate((0.4 * vh - secY) / (1.3 * vh)));
    s.lineHalfWidth = lineHalfWidth(s.vw, s.diag);
    return s;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.io?.disconnect();
    this.approachIo?.disconnect();
    this.resizeObserver?.disconnect();
    this.card?.dispose();
    gsap.killTweensOf([
      ...this.el.markSwaps,
      ...this.el.stripTexts.flat(),
      ...this.el.readoutLines,
    ]);
    // Pause only: React owns the element and its src (Strict Mode remounts
    // this controller on the same element in development).
    this.video?.pause();
  }

  // ------------------------------------------------------------ setup

  private bind() {
    const listen = <K extends keyof WindowEventMap>(
      type: K,
      handler: (event: WindowEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      window.addEventListener(type, handler, options);
      this.offs.push(() => window.removeEventListener(type, handler, options));
    };

    listen("resize", () => this.measure());
    listen("wheel", (event) => this.onWheel(event), { passive: true });
    listen("keydown", (event) => this.onKey(event));
    listen("touchstart", (event) => this.onTouchStart(event), { passive: true });
    listen("touchmove", (event) => this.onTouchMove(event), { passive: true });
    listen("touchend", () => this.onTouchEnd(), { passive: true });
    listen("touchcancel", () => this.onTouchEnd(), { passive: true });
    listen("pointerdown", (event) => this.onPointerDown(event), { passive: true });
    listen("pointerup", () => this.onPointerUp(), { passive: true });
    listen("scroll", () => this.onScroll(), { passive: true });

    const onVisibility = () => this.updatePlayback();
    document.addEventListener("visibilitychange", onVisibility);
    this.offs.push(() => document.removeEventListener("visibilitychange", onVisibility));

    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(this.root);
    void document.fonts?.ready.then(() => {
      if (!this.disposed) this.measure();
    });

    // Near: the section is within about half a screen of the viewport.
    this.io = new IntersectionObserver(
      ([entry]) => {
        this.near = entry.isIntersecting;
        if (!entry.isIntersecting && entry.boundingClientRect.top > 0) this.resetEntrance();
        this.updatePlayback();
        if (this.near && !this.reduced) this.card?.start();
        else this.card?.stop();
      },
      { rootMargin: "50% 0px 50% 0px" },
    );
    this.io.observe(this.root);

    // Approach: a screen and a half away, early enough to warm the GL layer
    // and to start buffering the video.
    this.approachIo = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        this.approachIo?.disconnect();
        this.approachIo = null;
        if (this.video && this.src) {
          this.video.preload = this.reduced ? "metadata" : "auto";
          if (this.reduced) this.showStill();
        }
        this.options.onApproach?.();
      },
      { rootMargin: "150% 0px 150% 0px" },
    );
    this.approachIo.observe(this.root);

    if (this.fine) this.offs.push(onPointer(() => {}));

    this.offs.push(
      onReducedMotion(() => {
        this.reduced = true;
        this.state.reduced = true;
        this.card?.stop();
        this.applyStatic();
        this.updatePlayback();
      }),
    );

    this.offs.push(
      onReelPlayerClosed((result) => {
        this.playerOpen = false;
        const video = this.video;
        if (video && Number.isFinite(result.currentTime)) {
          try {
            video.currentTime = result.finished ? 0 : result.currentTime;
          } catch {
            // Seeking before metadata throws in some engines; the loop just carries on.
          }
        }
        this.updatePlayback();
      }),
    );

    const watch = this.el.watch;
    const target = this.el.hoverTarget;
    if (target) {
      const enter = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
        this.buttonHover = true;
        this.hoverSince = this.clock;
      };
      const leave = () => {
        this.buttonHover = false;
        this.pressTarget = 0;
      };
      target.addEventListener("pointerenter", enter);
      target.addEventListener("pointerleave", leave);
      this.offs.push(() => {
        target.removeEventListener("pointerenter", enter);
        target.removeEventListener("pointerleave", leave);
      });
    }
    if (watch) {
      const down = () => {
        this.pressTarget = 1;
      };
      const up = () => {
        this.pressTarget = 0;
      };
      const focus = () => {
        this.buttonFocus = watch.matches(":focus-visible");
        if (this.buttonFocus) this.hoverSince = this.clock;
      };
      const blur = () => {
        this.buttonFocus = false;
      };
      const click = () => this.openPlayer();
      watch.addEventListener("pointerdown", down);
      watch.addEventListener("pointerup", up);
      watch.addEventListener("pointercancel", up);
      watch.addEventListener("focus", focus);
      watch.addEventListener("blur", blur);
      watch.addEventListener("click", click);
      this.offs.push(() => {
        watch.removeEventListener("pointerdown", down);
        watch.removeEventListener("pointerup", up);
        watch.removeEventListener("pointercancel", up);
        watch.removeEventListener("focus", focus);
        watch.removeEventListener("blur", blur);
        watch.removeEventListener("click", click);
      });
    }
  }

  private measure() {
    if (this.disposed) return;
    const s = this.state;
    s.vw = window.innerWidth;
    s.vh = window.innerHeight;
    s.diag = Math.hypot(s.vw, s.vh);
    s.mobile = compactLayout();
    const section = this.root.getBoundingClientRect();
    const thumb = this.el.thumb?.getBoundingClientRect();
    const frame = this.el.frame?.getBoundingClientRect();
    if (thumb) {
      this.thumbRel = {
        x: thumb.left,
        y: thumb.top - section.top,
        w: thumb.width,
        h: thumb.height,
      };
    }
    if (frame) {
      this.frameRel = {
        x: frame.left,
        y: frame.top - section.top - this.pinApplied,
        w: frame.width,
        h: frame.height,
      };
    }
    if (this.el.title) this.titleRel = this.el.title.getBoundingClientRect().top - section.top;
    if (this.el.content)
      this.contentRel = this.el.content.getBoundingClientRect().top - section.top;
    if (this.el.pin)
      this.marginTop = Number.parseFloat(getComputedStyle(this.el.pin).marginTop) || 0;
    const firstLine = this.el.titleWords[0]?.closest<HTMLElement>("[data-reel='title-line']");
    this.indent = firstLine ? Number.parseFloat(getComputedStyle(firstLine).paddingLeft) || 0 : 0;
    const style = getComputedStyle(this.root);
    s.radius = Number.parseFloat(style.getPropertyValue("--reel-radius")) || 20;
    const slot = this.el.markSlots[0] ?? this.el.stripItems[0];
    this.cross = slot?.offsetHeight || 14;
    this.stripHalf = (this.el.strips[0]?.offsetWidth ?? 0) / 2;

    // The DOM ribbon: rebuilt for a new diagonal.
    const height = section.height;
    if (
      this.el.lineSvg &&
      this.el.linePath &&
      (s.diag !== this.lineDiag || height !== this.lineHeight)
    ) {
      this.lineDiag = s.diag;
      this.lineHeight = height;
      this.el.lineSvg.setAttribute(
        "viewBox",
        `0 0 ${Math.round(section.width)} ${Math.round(height)}`,
      );
      this.el.linePath.setAttribute("d", linePath(reelLine(), s.diag));
      this.el.linePath.style.strokeWidth = `${lineHalfWidth(s.vw, s.diag) * 2}px`;
    }
    if (this.card && frame) this.card.resize(frame.width, frame.height);
    this.fitReadout(this.el.readoutLines[this.readoutFront]);
    this.measured = true;
  }

  /** Entrance hidden states, applied while the section waits below the fold. */
  private startIdleState() {
    const secTop = this.root.getBoundingClientRect().top;
    const vh = window.innerHeight;
    // Already on screen (a reload further down): skip the entrances.
    if (this.reduced || secTop + this.titleRel < vh) {
      this.titleT = 2;
      this.titleStarted = true;
    }
    if (this.reduced || secTop + this.contentRel < vh) {
      this.descT = 2;
      this.ctaR = 1;
      this.contentStarted = true;
    }
  }

  private resetEntrance() {
    if (this.reduced || this.state.mobile) return;
    this.titleT = 0;
    this.descT = 0;
    this.ctaR = 0;
    this.titleStarted = false;
    this.contentStarted = false;
    this.decoT = 0;
    this.showT = 0;
    this.render(0);
  }

  // ------------------------------------------------------------ input

  private markInput() {
    this.inputThisFrame = true;
    this.lastInputAt = performance.now();
    this.ramp = 0;
  }

  private onWheel(event: WheelEvent) {
    if (event.ctrlKey || !event.deltaY) return;
    this.snapDir = Math.sign(event.deltaY);
    this.armed = true;
    this.markInput();
  }

  private onKey(event: KeyboardEvent) {
    if (editableTarget(event.target) || event.metaKey || event.altKey || event.ctrlKey) return;
    let direction = KEY_DIRECTION[event.key] ?? 0;
    if (event.key === " " || event.key === "Spacebar") direction = event.shiftKey ? -1 : 1;
    if (direction) {
      // Space on a button presses it, it doesn't scroll.
      if (direction && (event.key === " " || event.key === "Spacebar")) {
        const target = event.target;
        if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
      }
      this.snapDir = direction;
      this.armed = true;
      this.markInput();
      return;
    }
    // Any other key (Tab moves focus, and focus may scroll): input, but it
    // gives no direction, so the snap stands down.
    this.armed = false;
    this.markInput();
  }

  private onTouchStart(event: TouchEvent) {
    this.touching = true;
    this.lastTouchY = event.touches[0]?.clientY ?? 0;
    this.markInput();
  }

  private onTouchMove(event: TouchEvent) {
    const y = event.touches[0]?.clientY ?? this.lastTouchY;
    const dy = this.lastTouchY - y;
    this.lastTouchY = y;
    if (Math.abs(dy) > 0.5) {
      this.snapDir = Math.sign(dy);
      this.armed = true;
    }
    this.markInput();
  }

  private onTouchEnd() {
    this.touching = false;
    this.markInput();
  }

  private onPointerDown(event: PointerEvent) {
    // A press on the classic scrollbar (outside the page's client area).
    if (event.pointerType === "mouse" && event.clientX >= document.documentElement.clientWidth) {
      this.scrollbarDrag = true;
      this.markInput();
    }
  }

  private onPointerUp() {
    if (!this.scrollbarDrag) return;
    this.scrollbarDrag = false;
    this.markInput();
  }

  private onScroll() {
    const y = window.scrollY;
    if (this.scrollbarDrag) {
      const dy = y - this.lastNativeY;
      if (Math.abs(dy) > 0.5) {
        this.snapDir = Math.sign(dy);
        this.armed = true;
      }
      this.markInput();
      return;
    }
    // A scroll nobody asked for with the wheel, keys or a finger (a script,
    // focus, an anchor): never carry it on.
    const ours = Number.isFinite(this.autoWrittenY) && Math.abs(y - this.autoWrittenY) < 1.5;
    if (!ours && performance.now() - this.lastInputAt > 600) this.armed = false;
  }

  // ------------------------------------------------------------ frame

  private tick = (_time: number, deltaMs: number) => {
    if (this.disposed) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.clock += dt;
    if (!this.measured) this.measure();
    if (!this.near) {
      this.inputThisFrame = false;
      this.lastNativeY = window.scrollY;
      return;
    }
    this.sync();
    this.snap(dt);
    this.render(dt);
    this.card?.tick(dt);
  };

  private snap(dt: number) {
    const s = this.state;
    const nativeY = window.scrollY;
    const moved =
      Math.abs(nativeY - this.lastNativeY) > 0.5 &&
      !(Number.isFinite(this.autoWrittenY) && Math.abs(nativeY - this.autoWrittenY) < 1.5);
    this.lastNativeY = nativeY;
    const input = this.inputThisFrame || this.touching || this.scrollbarDrag || moved;
    this.inputThisFrame = false;

    const enabled =
      this.armed &&
      this.fine &&
      !this.reduced &&
      !s.mobile &&
      !isScrollLocked() &&
      !isReelPlayerOpen() &&
      this.near;
    if (!enabled || input) {
      this.ramp = 0;
      this.stillFrames = 0;
      return;
    }
    this.stillFrames += 1;
    const span = this.g - this.p;
    if (span <= 1) return;
    const target = (nativeY - this.p) / span;
    const done = this.snapDir > 0 ? this.g - nativeY < 1 : nativeY - this.p < 1;
    if (target <= 0 || target >= 1 || done || this.stillFrames < 2) {
      this.ramp = 0;
      return;
    }
    this.ramp = Math.min(1, this.ramp + dt);
    let next = nativeY + this.snapDir * s.vh * dt * this.ramp;
    if (this.snapDir > 0 && next >= this.g) next = Math.ceil(this.g);
    if (this.snapDir < 0 && next <= this.p) next = Math.floor(this.p);
    window.scrollTo({ top: next, behavior: "instant" });
    this.autoWrittenY = window.scrollY;
    this.lastNativeY = this.autoWrittenY;
  }

  // ------------------------------------------------------------ drawing

  private render(dt: number) {
    const s = this.state;
    const reduced = this.reduced;
    const mobile = s.mobile;
    const vh = s.vh;
    const put = this.styles;

    // The pin.
    put.set(
      this.el.pin,
      "transform",
      this.pinC ? `translate3d(0,${this.pinC.toFixed(2)}px,0)` : "none",
    );
    this.pinApplied = this.pinC;

    this.renderPicture(dt);
    this.renderLine();
    if (reduced) return;

    // Entrances (desktop only) and parallax.
    const titleY = s.secY + this.titleRel;
    const contentY = s.secY + this.contentRel;
    if (!this.titleStarted && titleY < vh) this.titleStarted = true;
    if (!this.contentStarted && contentY < vh) this.contentStarted = true;
    if (this.titleStarted) this.titleT = Math.min(2, this.titleT + dt);
    if (this.contentStarted) {
      this.descT = Math.min(2, this.descT + dt);
      this.ctaR = Math.min(1, this.ctaR + dt);
    }

    if (mobile) {
      for (const word of this.el.titleWords) put.set(word, "transform", "none");
      for (const word of this.el.descWords) {
        put.set(word, "transform", "none");
        put.set(word, "opacity", "1");
      }
      put.set(this.el.titleInner, "transform", "none");
      put.set(this.el.desc, "transform", "none");
      put.set(this.el.ctaLift, "transform", "none");
      put.set(this.el.ctaLift, "opacity", "1");
    } else {
      const titleOffset = this.titleStarted ? (vh - titleY) / vh : 0;
      const contentOffset = this.contentStarted ? (vh - contentY) / vh : 0;
      put.set(
        this.el.titleInner,
        "transform",
        `translate3d(0,${(-0.05 * vh * titleOffset).toFixed(2)}px,0)`,
      );
      put.set(
        this.el.desc,
        "transform",
        `translate3d(0,${(-0.15 * vh * contentOffset).toFixed(2)}px,0)`,
      );

      const indent = this.indent;
      this.el.titleWords.forEach((word, index) => {
        const firstLine = index < 2;
        const x = firstLine
          ? fit(this.titleT - Math.abs(2 - index) / 10, 0.5, 1.2, -indent, 0, easeSettle)
          : 0;
        const y = fit(this.titleT - index / 10, 0, 1, firstLine ? 100 : -100, 0, easeSettle);
        put.set(
          word,
          "transform",
          x === 0 && y === 0 ? "none" : `translate3d(${x.toFixed(2)}px,${y.toFixed(3)}%,0)`,
        );
      });
      this.el.descWords.forEach((word, index) => {
        const k = this.descT - index / 100;
        const y = fit(k, 0, 1, 100, 0, expoOut);
        put.set(word, "opacity", fit(k, 0, 1, 0.1, 1, expoOut).toFixed(3));
        put.set(word, "transform", y === 0 ? "none" : `translate3d(0,${y.toFixed(3)}%,0)`);
      });
      const r = this.ctaR;
      const lift = fit(r, 0, 1, 150, 0, easeSettle);
      const tilt = fit(r, 0, 1, 10, 0, easeSettle);
      put.set(
        this.el.ctaLift,
        "transform",
        `translate3d(0,${(-0.125 * vh * contentOffset).toFixed(2)}px,0) translate3d(0,${lift.toFixed(3)}%,0) rotate(${tilt.toFixed(3)}deg)`,
      );
      put.set(this.el.ctaLift, "opacity", easeSettle(r).toFixed(3));
    }

    this.renderDecor(dt);
  }

  /** The DOM picture: mapped from the thumbnail to the frame like cloth pulled into place. */
  private renderPicture(dt: number) {
    const s = this.state;
    const put = this.styles;
    const visual = this.el.visual;
    if (!visual) return;
    const W = this.frameRel.w || 1;
    const H = this.frameRel.h || 1;
    const w = s.w;

    // The radial hover follows the pointer over the picture wherever it is.
    const approx = this.pictureRect();
    const pt = pointer();
    const overPicture =
      this.fine &&
      !this.reduced &&
      pt.inside &&
      pt.type !== "touch" &&
      pt.x >= approx.x &&
      pt.x <= approx.x + approx.w &&
      pt.y >= approx.y &&
      pt.y <= approx.y + approx.h;
    const targetU = overPicture ? (pt.x - approx.x) / approx.w : this.radialU;
    const targetV = overPicture ? (pt.y - approx.y) / approx.h : this.radialV;
    const k = 1 - Math.exp(-12 * dt);
    this.radialU = mix(this.radialU, targetU, this.state.hover < 0.02 ? 1 : k);
    this.radialV = mix(this.radialV, targetV, this.state.hover < 0.02 ? 1 : k);
    const hover = this.reduced ? 0 : stepSpring(this.radial, overPicture ? 1 : 0, dt, 60, 12);
    s.hover = clamp(hover, 0, 1.2);
    s.hoverU = this.radialU;
    s.hoverV = this.radialV;

    if (this.reduced || s.mobile || w >= 1) {
      put.set(visual, "transform", "none");
      put.set(visual, "border-radius", `${s.radius}px`);
    } else {
      // The four corners, each on its own delay: the top right leads, the
      // bottom left trails (the same weights as the WebGL plane's vertices).
      const corner = (cx: number, cy: number) => {
        const weight = 1 - (Math.pow(cx * cx, 0.75) + Math.pow(cy, 1.5)) / 2;
        const v = smoothstep(weight * 0.3, 0.7 + weight * 0.3, w);
        const x = mix(s.from.x, s.to.x, v);
        const y = mix(s.from.y, s.to.y, v);
        const cw = mix(s.from.w, s.to.w, v);
        const ch = mix(s.from.h, s.to.h, v);
        const bump = cw * 0.1 * Math.pow(Math.sin(Math.PI * v), 2);
        const pivotX = s.to.w * 0.5;
        const pivotY = s.to.h * 0.5;
        const bx = cx * cw - pivotX;
        const by = (1 - cy) * ch - pivotY;
        const angle = (smoothstep(0, 1, v) - v) * -1;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [
          bx * cos - by * sin + pivotX + x + bump - s.to.x,
          bx * sin + by * cos + pivotY + y - s.to.y,
        ] as const;
      };
      // Corners in (x right, y up-from-bottom) weights: TL (0,1), TR (1,1), BR (1,0), BL (0,0).
      const tl = corner(0, 1);
      const tr = corner(1, 1);
      const br = corner(1, 0);
      const bl = corner(0, 0);
      put.set(
        visual,
        "transform",
        quadMatrix(W, H, tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1]),
      );
      const sx = Math.max(0.05, Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) / W);
      const sy = Math.max(0.05, Math.hypot(bl[0] - tl[0], bl[1] - tl[1]) / H);
      put.set(
        visual,
        "border-radius",
        `${(s.radius / sx).toFixed(2)}px / ${(s.radius / sy).toFixed(2)}px`,
      );
    }

    // The blue: full on the thumbnail, swept off from the top right corner
    // as the picture grows, gone on the big video.
    const sweep = this.reduced || s.mobile ? 1 : smoothstep(0.05, 0.92, w);
    put.set(visual, "--reel-sweep", sweep.toFixed(4));
    for (const layer of this.tints) put.set(layer, "display", sweep >= 1 ? "none" : "block");
    // The hover lens: a soft window of true colour and a slight zoom where
    // the pointer is (in the picture's own, untransformed px).
    const radiusPx = Math.max(1, s.hover * (0.3 * Math.min(W, H) + 60));
    put.set(visual, "--reel-hover-r", `${radiusPx.toFixed(1)}px`);
    put.set(visual, "--reel-hover-x", `${(s.hoverU * 100).toFixed(2)}%`);
    put.set(visual, "--reel-hover-y", `${(s.hoverV * 100).toFixed(2)}%`);
    const zoom = 1 + 0.035 * Math.max(0, s.hover);
    put.set(
      this.el.media,
      "transform-origin",
      `${(s.hoverU * 100).toFixed(2)}% ${(s.hoverV * 100).toFixed(2)}%`,
    );
    put.set(this.el.media, "transform", zoom > 1.0005 ? `scale(${zoom.toFixed(4)})` : "none");
  }

  /** Roughly where the picture is on screen (its bounding box mid-morph). */
  private pictureRect(): Rect {
    const s = this.state;
    const v = smoothstep(0.15, 0.85, s.w);
    return {
      x: mix(s.from.x, s.to.x, v),
      y: mix(s.from.y, s.to.y, v),
      w: mix(s.from.w, s.to.w, v),
      h: mix(s.from.h, s.to.h, v),
    };
  }

  private renderLine() {
    const path = this.el.linePath;
    if (!path) return;
    const reveal = this.state.lineReveal;
    // display, not visibility: an inline "visible" would show through the
    // hidden SVG while the WebGL ribbon draws.
    this.styles.set(path, "display", reveal > 0.001 ? "inline" : "none");
    this.styles.set(path, "stroke-dasharray", reveal >= 0.9999 ? "none" : `${reveal.toFixed(4)} 2`);
  }

  private renderDecor(dt: number) {
    const s = this.state;
    const put = this.styles;
    const mobile = s.mobile;
    const w = s.w;
    const full = w >= 1;
    const btnR = mobile ? 1 : fit(w, 0.3, 1, 0, 1);

    const hovered = (this.buttonHover || this.buttonFocus) && (full || mobile);
    // Each new hover brings the next line to the strips (the first shows the first).
    if (hovered && !this.hoverWas) {
      if (this.hoverCount > 0 && this.hov2 < 0.2) this.cycleStrip(true);
      else this.nextStripAt = this.clock + 3.6;
      this.hoverCount += 1;
    }
    this.hoverWas = hovered;
    this.hov2 = saturate(this.hov2 + (hovered ? dt : -dt) * 1.5);
    this.hov3 = saturate(this.hov3 + (hovered ? dt : -dt) * 3);
    if (hovered) this.hoverTime += dt * 2;
    if (this.near) this.stripTime += dt;
    this.decoT = clamp(this.decoT + (btnR >= 1 ? dt : -2 * dt), 0, 1.4);

    // Marks: emerge with a spin once the video is complete; slide out of
    // their band while the button is hovered.
    const slots = this.el.markSlots;
    for (let i = 0; i < slots.length; i += 1) {
      const column = i % 5;
      const slide = fit(this.hov2 - column / 10, 0, 0.7, 0, 1, expoInOut);
      put.set(
        slots[i],
        "transform",
        slide ? `translate3d(0,${(slide * this.cross).toFixed(2)}px,0)` : "none",
      );
      const grow = fit(this.decoT - column / 10, 0, 0.6, 0, 1, easeSettle);
      put.set(
        this.el.markEmerges[i],
        "transform",
        grow >= 1 ? "none" : `scale(${grow.toFixed(4)}) rotate(${(grow * 180).toFixed(2)}deg)`,
      );
    }

    // The strips: rise in on hover (always shown on phones), and run as a
    // marquee while hovered (always on phones).
    const items = this.el.stripItems;
    for (let i = 0; i < items.length; i += 1) {
      const index = i % 8;
      const y = mobile ? 0 : fit(this.hov2 - index / 25, 0.2, 1, 1.2, 0, expoInOut);
      put.set(
        items[i],
        "transform",
        y ? `translate3d(0,${(y * this.cross).toFixed(2)}px,0)` : "none",
      );
    }
    const T = mobile ? this.stripTime : this.hoverTime;
    const phase = (T % 15) / 15;
    this.el.strips.forEach((strip, index) => {
      const x = index === 0 ? -phase * this.stripHalf : -(1 - phase) * this.stripHalf;
      put.set(strip, "transform", `translate3d(${x.toFixed(2)}px,0,0)`);
    });

    // The button (or the caption): grows in over the last part of the
    // morph, a little bigger while hovered, squashed while pressed.
    const shown = this.buttonFocus ? 1 : btnR;
    const pressed = stepSpring(this.press, this.pressTarget, dt, 520, 22);
    const scale = expoInOut(shown) + 0.1 * expoInOut(this.hov3);
    const sx = scale * (1 + 0.08 * pressed);
    const sy = scale * (1 - 0.1 * pressed);
    const reveal = this.el.watch ?? this.el.caption;
    if (reveal) {
      put.set(reveal, "opacity", expoInOut(shown).toFixed(3));
      put.set(
        reveal,
        "transform",
        Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4
          ? "none"
          : `scale(${sx.toFixed(4)},${sy.toFixed(4)})`,
      );
    }
    if (this.el.watch) {
      const hoverOn = hovered ? "true" : "false";
      if (this.el.watch.dataset.hover !== hoverOn) this.el.watch.dataset.hover = hoverOn;
    }

    // "Play" and "Video": rise in letter by letter at the complete state,
    // roll a letter every two seconds, and lean toward the button on hover.
    this.showT = full ? Math.min(2, this.showT + dt) : Math.max(0, this.showT - dt * 2);
    this.rollTime += dt;
    if (this.rollTime >= 2) {
      this.rollTime -= 2;
      this.rollChars = [
        randomInt(0, Math.max(0, (this.el.charTracks[0]?.length ?? 1) - 1)),
        randomInt(0, Math.max(0, (this.el.charTracks[1]?.length ?? 1) - 1)),
      ];
    }
    const hoverAge = this.clock - this.hoverSince;
    this.el.charTracks.forEach((tracks, wordIndex) => {
      const chars = this.el.words[wordIndex];
      const count = tracks.length;
      tracks.forEach((track, charIndex) => {
        const rise = fit(this.showT - wordIndex / 4 - charIndex / 20, 0, 0.6, 200, 0, easeSettle);
        const roll =
          charIndex === this.rollChars[wordIndex]
            ? fit(this.rollTime - wordIndex / 10, 0.5, 1.3, 0, -100, easeSettle)
            : 0;
        const y = rise + roll;
        put.set(track, "transform", y === 0 ? "none" : `translate3d(0,${(y / 2).toFixed(3)}%,0)`);
        // Nearest the button leans first and most.
        const fromButton = wordIndex === 0 ? count - 1 - charIndex : charIndex;
        const target = hovered && hoverAge > fromButton * 0.035 ? 1 : 0;
        const lean = stepSpring(this.leans[wordIndex][charIndex], target, dt, 190, 11);
        const amount = lean * (1 - fromButton * 0.14);
        const sign = wordIndex === 0 ? 1 : -1;
        put.set(
          chars[charIndex],
          "transform",
          Math.abs(amount) < 0.001
            ? "none"
            : `translate3d(${(sign * amount * 0.04).toFixed(4)}em,0,0) rotate(${(sign * amount * 7).toFixed(3)}deg)`,
        );
      });
    });

    // Readout: shows at the complete state, rolls between its lines.
    if (this.el.readout) {
      put.set(this.el.readout, "opacity", fit(this.decoT, 0.3, 0.9, 0, 1).toFixed(3));
      this.updateReadout();
    }

    // Idle variations while the big video is up.
    if (btnR >= 1 && this.decoT >= 1.4) {
      if (this.clock >= this.nextSwapAt) this.swapMarks();
      if ((hovered || mobile) && this.clock >= this.nextStripAt) this.cycleStrip(false);
      if (this.clock >= this.nextReadoutAt) this.rollReadout();
    }
  }

  // ------------------------------------------------------------ variations

  private swapMarks() {
    this.nextSwapAt = this.clock + 2.8 + random() * 2.4;
    const swaps = this.el.markSwaps;
    if (!swaps.length) return;
    const count = random() < 0.35 ? 2 : 1;
    for (let n = 0; n < count; n += 1) {
      const column = randomInt(0, 4);
      // A column swaps on both rows, mirrored, so the frame stays balanced.
      const pair = [swaps[column], swaps[5 + (4 - column)]].filter(Boolean);
      const current = (pair[0]?.dataset.kind as MarkKind) ?? "plus";
      // Plus is home: every other swap returns there.
      const next =
        current !== "plus" && random() < 0.5
          ? "plus"
          : randomPick(MARK_KINDS.filter((kind) => kind !== current));
      for (const el of pair) {
        gsap
          .timeline()
          .to(el, { scale: 0, rotation: "+=110", duration: 0.24, ease: "power2.in" })
          .call(() => {
            el.dataset.kind = next;
          })
          .to(el, { scale: 1, rotation: "+=250", duration: 0.62, ease: "back.out(2.4)" });
      }
    }
  }

  private cycleStrip(immediate: boolean) {
    this.nextStripAt = this.clock + 3.6;
    const lines = this.stripLines;
    if (lines.length < 2) return;
    this.stripIndex = (this.stripIndex + 1) % lines.length;
    const text = lines[this.stripIndex];
    const front = this.stripFront;
    const back = 1 - front;
    this.stripFront = back;
    this.el.stripTexts.forEach((pair, index) => {
      const incoming = pair[back];
      const outgoing = pair[front];
      if (!incoming || !outgoing) return;
      incoming.textContent = text;
      const delay = immediate ? 0 : (index % 8) * 0.03;
      gsap.fromTo(
        outgoing,
        { yPercent: 0 },
        { yPercent: -110, duration: 0.45, delay, ease: "power3.inOut", overwrite: true },
      );
      gsap.fromTo(
        incoming,
        { yPercent: 110 },
        { yPercent: 0, duration: 0.55, delay: delay + 0.06, ease: "power3.out", overwrite: true },
      );
    });
  }

  private readoutText(state: number) {
    if (state === 2) return this.coordinates;
    if (!this.hasVideo) {
      return state === 0 ? "Test card" : `Standby ${this.clockText(this.clock)}`;
    }
    const video = this.video;
    if (state === 0) return `TC ${this.clockText(video?.currentTime ?? 0)}`;
    return `Loop ${String(this.loops).padStart(2, "0")}`;
  }

  private clockText(seconds: number) {
    const total = Math.max(0, seconds);
    const m = Math.floor(total / 60);
    const sec = Math.floor(total % 60);
    const tenths = Math.floor((total * 10) % 10);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${tenths}`;
  }

  /** Sizes the readout's pill to the line it shows (the width eases in CSS). */
  private fitReadout(line: HTMLElement | undefined) {
    const mask = line?.parentElement;
    if (!line || !mask) return;
    this.styles.set(mask, "width", `${Math.ceil(line.offsetWidth) + 1}px`);
  }

  private updateReadout() {
    const video = this.video;
    if (video) {
      if (video.currentTime + 0.5 < this.lastVideoTime) this.loops += 1;
      this.lastVideoTime = video.currentTime;
    }
    const line = this.el.readoutLines[this.readoutFront];
    if (!line) return;
    const text = this.readoutText(this.readoutState);
    if (text !== this.lastTimecode) {
      this.lastTimecode = text;
      line.textContent = text;
    }
  }

  private rollReadout() {
    this.nextReadoutAt = this.clock + 3.4;
    const lines = this.el.readoutLines;
    if (lines.length < 2) return;
    this.readoutState = (this.readoutState + 1) % 3;
    const front = this.readoutFront;
    const back = 1 - front;
    this.readoutFront = back;
    const text = this.readoutText(this.readoutState);
    this.lastTimecode = text;
    lines[back].textContent = text;
    this.fitReadout(lines[back]);
    gsap.fromTo(
      lines[front],
      { yPercent: 0 },
      { yPercent: -110, duration: 0.4, ease: "power3.inOut", overwrite: true },
    );
    gsap.fromTo(
      lines[back],
      { yPercent: 110 },
      { yPercent: 0, duration: 0.5, delay: 0.05, ease: "power3.out", overwrite: true },
    );
  }

  // ------------------------------------------------------------ video

  private updatePlayback() {
    const video = this.video;
    if (!video || !this.src) return;
    const play =
      this.near && !document.hidden && !this.playerOpen && !this.reduced && !isReelPlayerOpen();
    if (play) {
      video.muted = true;
      if (video.preload !== "auto") video.preload = "auto";
      if (video.paused) void video.play().catch(() => {});
    } else if (!video.paused) {
      video.pause();
    }
  }

  /** Reduced motion: no loop, but a real frame to look at. */
  private showStill() {
    const video = this.video;
    if (!video) return;
    const seek = () => {
      try {
        // A little way in: first frames are often a black fade.
        if (video.currentTime < 0.5) video.currentTime = Math.min(8, (video.duration || 2) * 0.1);
      } catch {
        // Not seekable yet: the first frame shows instead.
      }
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
  }

  private openPlayer() {
    const src = this.src;
    if (!src) return;
    const frame = this.el.frame;
    const opened = openReelPlayer({
      src,
      originRect: frame?.getBoundingClientRect() ?? null,
      startTime: this.video?.currentTime ?? 0,
      returnFocus: this.el.watch,
    });
    if (opened) {
      this.playerOpen = true;
      this.buttonHover = false;
      this.updatePlayback();
    }
  }

  // ------------------------------------------------------------ static

  /** Reduced motion: the finished state, in place, nothing moving. */
  private applyStatic() {
    const put = this.styles;
    for (const word of this.el.titleWords) put.set(word, "transform", "none");
    for (const word of this.el.descWords) {
      put.set(word, "transform", "none");
      put.set(word, "opacity", "1");
    }
    put.set(this.el.titleInner, "transform", "none");
    put.set(this.el.desc, "transform", "none");
    put.set(this.el.ctaLift, "transform", "none");
    put.set(this.el.ctaLift, "opacity", "1");
    put.set(this.el.pin, "transform", "none");
    this.pinC = 0;
    this.pinApplied = 0;
    for (const slot of this.el.markSlots) put.set(slot, "transform", "none");
    for (const emerge of this.el.markEmerges) put.set(emerge, "transform", "none");
    for (const item of this.el.stripItems) {
      put.set(
        item,
        "transform",
        this.state.mobile ? "none" : `translate3d(0,${(1.2 * this.cross).toFixed(2)}px,0)`,
      );
    }
    for (const strip of this.el.strips) put.set(strip, "transform", "none");
    for (const track of this.el.charTracks.flat()) put.set(track, "transform", "none");
    for (const char of this.el.words.flat()) put.set(char, "transform", "none");
    const reveal = this.el.watch ?? this.el.caption;
    put.set(reveal, "opacity", "1");
    put.set(reveal, "transform", "none");
    put.set(this.el.readout, "opacity", "1");
    const line = this.el.readoutLines[this.readoutFront];
    if (line) line.textContent = this.coordinates;
    this.setGlMode(false);
  }
}
