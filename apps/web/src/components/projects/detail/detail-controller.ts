import type {
  DetailFrameState,
  DetailStageHandle,
  DetailStageItem,
} from "@/components/projects/detail/stage/contract";
import {
  walkHeaderPalette,
  type HeaderPaletteWalk,
} from "@/components/transition/project-zoom-colors";
import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";
import {
  compositeLayers,
  mixRgb,
  parseCssColor,
  registerHeaderToneProvider,
  requestHeaderToneSample,
  type HeaderToneProvider,
  type HeaderToneSample,
  type Rgb,
} from "@/lib/header-tone";
import { sampleImageAt, sampleVideoAt } from "@/lib/header-tone-probe";
import { scrollPageTo } from "@/lib/page-scroll";
import { PROJECT_THEMES, type ProjectPalette } from "@/lib/project-themes";
import type { ProjectThemeId } from "@/lib/project-cms";
import {
  markProjectPageReady,
  setDetailHandoffActive,
  waitForProjectReveal,
} from "@/lib/project-transition";
import { motionAllowed, onReducedMotion } from "@/lib/reduced-motion";
import { waitForRouteReveal } from "@/lib/route-reveal";
import { acquireScrollLock, isScrollLocked, releaseScrollLock } from "@/lib/scroll-lock";

import { clamp, expoInOut, expoOut, fit, mix, quintInOut } from "./detail-math";
import { dismissScrollHint, isScrollHintDismissed } from "./detail-session";

/**
 * Everything on the project detail page that moves every frame, kept out
 * of React: the horizontal track, the meta parallax, the entrance, the
 * next-project accumulator and hand-off, and the DOM media's emerge,
 * scroll-speed response and playback. Markup and data stay in
 * `project-detail.tsx`; this class only reads layout and writes styles.
 *
 * Scrolling is the document's own. In the horizontal layout a spacer gives
 * the page the track's length, the stage is fixed, and the track is moved
 * to translateX(-scrollY) in the frame loop's "scroll" phase (after Lenis,
 * when it runs). The WebGL stage reads the same value in the "render"
 * phase, so DOM and canvas always agree.
 */

/** The stacked (vertical) layout, lusion's switch width. */
// Lusion switches on width alone. A short window (a phone turned sideways,
// a small browser window) also stacks: the horizontal band and the meta
// block need some height to breathe.
export const VERTICAL_QUERY = "(max-width: 812px), (max-height: 520px)";

// lusion's timings (its tweens are linear; the windows and eases are its own).
const ENTRANCE_SECONDS = 1.5;
const HANDOFF_SECONDS = 1;
const SCROLL_UNLOCK_AT = 0.75; // of the entrance
const META_FADE_VW = 0.25; // the meta fades over the first quarter viewport of travel
const PANEL_REST_VW = 0.75; // the next panel's left edge at the end of the track
const RISE_PX = 30;

// The next-project accumulator (per second).
const OVERSCROLL_RISE = 3;
const OVERSCROLL_DRAIN = 5;
const OVERSCROLL_DECAY = 0.2;

// Touch release momentum (lusion's friction, per second).
const FRICTION_FROM = 2.1;
const FRICTION_TO = 1.9;
const DRAG_HISTORY_MS = 100;

const WHEEL_LERP = 0.2; // Lenis lambda = 12/s, lusion's wheel ease
const MAX_WHEEL_DELTA = 200;
const ARROW_STEP = 100;
const EAGER_AHEAD_VW = 2.5;
const FONT_WAIT_MS = 1500;
const REVEAL_WAIT_SECONDS = 9;
// How long the page waits for its first screen of media before telling the
// project zoom it can reveal. Short on purpose: the entrance only fades the
// media in from about 0.75 s, and until a file decodes its frame shows the
// highlight placeholder, so a longer wait just holds a blank theme colour.
const READY_TIMEOUT_MS = 450;
const SITE_HEADER = 64;
const META_CLEARANCE = 24;
const META_MIN_FIT = 0.72;

const ENTRANCE_LOCK = "project-detail-entrance";
const HANDOFF_LOCK = "project-detail-handoff";

// Keys typed into these keep their own meaning.
const KEY_OWNERS =
  "input, textarea, select, button, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='listbox'], [role='menu'], [role='slider'], [role='tablist']";

type PartName = "desc" | "cta" | "credits" | "services" | "links";
type PartSpec = { from: number; to: number; parallax: number };

/** Entrance windows (share of the entrance) and parallax speeds. */
const PARTS: Record<PartName, PartSpec> = {
  desc: { from: 0.4, to: 0.85, parallax: 1 / 3 },
  cta: { from: 0.45, to: 0.9, parallax: 0 },
  credits: { from: 0.5, to: 0.95, parallax: 1 / 3 },
  services: { from: 0.5, to: 0.95, parallax: 1 / 5 },
  links: { from: 0.55, to: 1, parallax: 1 / 4 },
};

export type DetailElements = {
  stage: HTMLElement;
  gl: HTMLElement;
  spacer: HTMLElement;
  track: HTMLElement;
  meta: HTMLElement;
  body: HTMLElement | null;
  title: HTMLElement;
  hint: HTMLElement | null;
  panel: HTMLElement | null;
  panelTitle: HTMLElement | null;
  panelFooter: HTMLElement | null;
  bar: HTMLElement | null;
  wipe: HTMLElement | null;
  wipeTitle: HTMLElement | null;
};

export type DetailControllerOptions = {
  slug: string;
  elements: DetailElements;
  /** Entered from the previous project's hand-off (see detail-session.ts). */
  arrived: boolean;
  palette: ProjectPalette;
  /** The next project's theme: the header walks to its palette during the hand-off. */
  nextThemeId?: ProjectThemeId;
  /** Plays the navigation once the hand-off has covered the screen. */
  onNavigateNext(): void;
  onPrefetchNext(): void;
};

type Item = {
  id: string;
  el: HTMLElement;
  frame: HTMLElement;
  full: boolean;
  kind: "image" | "video";
  img: HTMLImageElement | null;
  video: HTMLVideoElement | null;
  left: number;
  width: number;
  visible: boolean;
  pendingEmerge: boolean;
  owned: boolean;
  transformed: boolean;
};

type Handoff = {
  time: number;
  /** Panel edge (x on desktop, y when stacked) when it started. */
  from: number;
  titleFrom: number;
  titleTo: number;
  done: boolean;
};

type Drag = {
  x0: number;
  y0: number;
  x: number;
  y: number;
  axis: "x" | "y" | null;
  history: { t: number; d: number }[];
};

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function videoReady(video: HTMLVideoElement) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise<void>((resolve) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => resolve(), { once: true });
  });
}

export class DetailController {
  private readonly o: DetailControllerOptions;
  private readonly e: DetailElements;
  private disposed = false;
  private vertical = false;
  private vw = 1;
  private vh = 1;
  private maxTravel = 0;
  private travel = 0;
  private lastTravel = 0;
  private velocity = 0;
  private firstFrame = true;
  private reduced = false;

  private entrance: "waiting" | "running" | "done" = "waiting";
  private entranceTime = 0;
  private csr = 0;
  private entranceLocked = false;

  private overscroll = 0;
  private inputForward = false;
  private inputBack = false;
  private handoff: Handoff | null = null;
  /** Walks the header's colours to the next palette during the hand-off. */
  private headerWalk: HeaderPaletteWalk | null = null;
  private prefetched = false;

  private hintGone = false;
  private hintFade = 0;

  private items: Item[] = [];
  private itemIds = "";
  private readonly byElement = new Map<Element, Item>();
  private parts: { el: HTMLElement; spec: PartSpec }[] = [];
  private centerOffset = 0;
  /** Keeps the visitor's place through a layout change: a fixed pixel offset
   *  (a media size arriving) or a share of the item (a resize, where every
   *  item's width scales with the band height). */
  private anchor: { id: string; offset: number } | { id: string; share: number } | null = null;
  private itemsOpacity = 0;

  private speed = 0;
  private speedActive = false;
  private momentum = 0;
  private drag: Drag | null = null;
  private keyTarget: number | null = null;
  private keyTimer = 0;

  private stage: DetailStageHandle | null = null;
  private stageState: "off" | "starting" | "on" | "failed" = "off";
  /** Bumped by every start and stop: a start that finds it changed was superseded. */
  private stageAttempt = 0;
  private palette: ProjectPalette;

  private frames = 0;
  private videosDirty = true;
  private relayoutQueued = 0;
  private observedSizes = "";
  private readonly transforms = new Map<HTMLElement, string>();
  private readonly opacities = new Map<HTMLElement, string>();
  private readonly timers: { remaining: number; resolve: () => void }[] = [];
  private readonly cleanups: (() => void)[] = [];
  private offFrame: (() => void) | null = null;
  private stopLenis: (() => void) | null = null;
  private lenisOn = false;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;

  constructor(options: DetailControllerOptions) {
    this.o = options;
    this.e = options.elements;
    this.palette = options.palette;
  }

  // ------------------------------------------------------------ lifecycle

  start() {
    this.reduced = !motionAllowed();
    this.hintGone = isScrollHintDismissed();
    this.hintFade = this.hintGone ? 1 : 0;
    this.parts = [...this.e.meta.querySelectorAll<HTMLElement>("[data-part]")].flatMap((el) => {
      const spec = PARTS[el.dataset.part as PartName];
      return spec ? [{ el, spec }] : [];
    });

    this.io = new IntersectionObserver(this.onIntersect);
    this.ro = new ResizeObserver(() => this.queueRelayout());
    this.ro.observe(this.e.meta);
    this.ro.observe(this.e.track);
    this.relayout();
    if (!this.reduced) for (const item of this.items) item.el.dataset.emerge = "out";

    this.offFrame = addFrameCallback("scroll", this.tick);
    this.listen();
    void this.startLenis();
    void this.runEntrance();
    void this.signalReady();
    this.cleanups.push(onReducedMotion(() => this.toReduced()));
    this.cleanups.push(registerHeaderToneProvider(this.headerTone));
    this.maybeStartStage();

    if (process.env.NODE_ENV !== "production") {
      // Dev-only probe for verification scripts.
      const probe = () => ({
        slug: this.o.slug,
        vertical: this.vertical,
        entrance: this.entrance,
        csr: this.csr,
        travel: this.travel,
        maxTravel: this.maxTravel,
        overscroll: this.overscroll,
        handoff: this.handoff ? clamp(this.handoff.time / HANDOFF_SECONDS) : 0,
        stage: this.stageState,
        owned: this.items.filter((item) => item.owned).length,
        lenis: this.lenisOn,
        arrived: this.o.arrived,
      });
      Object.assign(window, { __projectDetail: probe });
      this.cleanups.push(() => {
        const target = window as { __projectDetail?: unknown };
        if (target.__projectDetail === probe) delete target.__projectDetail;
      });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame?.();
    this.stopLenis?.();
    this.io?.disconnect();
    this.ro?.disconnect();
    window.cancelAnimationFrame(this.relayoutQueued);
    window.clearTimeout(this.keyTimer);
    for (const off of this.cleanups) off();
    this.stopStage("off");
    releaseScrollLock(ENTRANCE_LOCK);
    releaseScrollLock(HANDOFF_LOCK);
    if (this.handoff) setDetailHandoffActive(false);
    // By now the next page's own theme style carries the same colours.
    this.headerWalk?.release();
    this.headerWalk = null;
  }

  /** The palette the stage tints its placeholders with (light/dark switch). */
  setPalette(palette: ProjectPalette) {
    this.palette = palette;
    this.stage?.setPalette(palette);
  }

  /** Remember where the visitor is, before a layout change (a media size arriving). */
  captureAnchor() {
    if (this.vertical || !this.items.length || this.travel <= 0) return;
    const item =
      this.items.find((entry) => entry.left + entry.width > this.travel) ?? this.items[0];
    this.anchor = { id: item.id, offset: item.left - this.travel };
  }

  /** The stage's per-frame read (render phase). */
  readonly frameState = (): DetailFrameState => ({
    scroll: this.travel,
    scrollDelta: this.reduced ? 0 : this.velocity / this.vw,
    viewportWidth: this.vw,
    viewportHeight: this.vh,
    itemsOpacity: this.itemsOpacity,
  });

  /** The ambient background's per-frame read. */
  readonly motion = () => ({ scroll: this.travel, velocity: this.reduced ? 0 : this.velocity });

  /**
   * What the media show behind the site header (lib/header-tone.ts). The
   * WebGL stage draws the items it owns while their DOM frames are hidden,
   * which DOM probing can't see, so points over an item are answered here:
   * the item's own picture (the DOM <img>, or a video's poster, read at
   * that point), its placeholder colour until the file has loaded, faded
   * with the track over the page background. Everything else (the meta
   * block, the next project's panel in its own colours) is left to the DOM
   * probe.
   */
  private readonly headerTone: HeaderToneProvider = (zones) => {
    if (this.disposed || !this.items.length) return undefined;
    const opacity = this.itemsOpacity;
    // Still fading in or out: look again shortly.
    if (opacity > 0.001 && opacity < 0.999) requestHeaderToneSample();
    const bg: Rgb = parseCssColor(this.palette.bg)?.rgb ?? [255, 255, 255];
    const placeholder: Rgb = parseCssColor(this.palette.highlight)?.rgb ?? bg;
    const boxes = this.items.map((item) => ({ item, rect: item.el.getBoundingClientRect() }));
    return zones.map((zone) =>
      zone.points.map(({ x, y }): HeaderToneSample | undefined => {
        const hit = boxes.find(
          ({ rect }) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom,
        );
        if (!hit) return undefined;
        const { item } = hit;
        const loaded = opacity > 0.001 && item.el.hasAttribute("data-loaded");
        const picture = !loaded
          ? null
          : item.img
            ? sampleImageAt(item.img, x, y)
            : item.video
              ? sampleVideoAt(item.video, x, y)
              : null;
        const shown = picture ? compositeLayers(placeholder, [picture]) : placeholder;
        return { color: mixRgb(bg, shown, opacity), media: Boolean(picture) };
      }),
    );
  };

  // ------------------------------------------------------------ layout

  private queueRelayout() {
    if (this.relayoutQueued) return;
    this.relayoutQueued = window.requestAnimationFrame(() => {
      this.relayoutQueued = 0;
      const sizes = this.sizeKey();
      if (sizes !== this.observedSizes) this.relayout();
    });
  }

  private sizeKey() {
    const { meta, track } = this.e;
    return `${window.innerWidth}x${window.innerHeight}:${meta.offsetWidth}x${meta.offsetHeight}:${track.offsetWidth}x${track.offsetHeight}`;
  }

  relayout() {
    if (this.disposed) return;
    const { spacer, track, meta, title } = this.e;
    const wasVertical = this.vertical;
    // Crossing between the stacked and the horizontal layout keeps the item
    // the visitor was looking at (stacked: the first one on screen, which
    // the intersection observer tracks; horizontal: the one at the left
    // edge). CSS has already switched the layout by now, so both come from
    // what was recorded before.
    const flipTo = this.items.length
      ? this.flipAnchor(wasVertical, window.matchMedia(VERTICAL_QUERY).matches)
      : undefined;
    // A resize (a tablet's toolbar collapsing, a window drag) rescales every
    // item before the visitor's place: keep the same part of the item at
    // the left edge that was there, measured on the old layout.
    if (!wasVertical && !this.anchor && this.travel > 0) {
      const item = this.items.find((entry) => entry.left + entry.width > this.travel);
      if (item && item.width > 0) {
        this.anchor = { id: item.id, share: (this.travel - item.left) / item.width };
      }
    }
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.vertical = window.matchMedia(VERTICAL_QUERY).matches;
    this.scanItems();

    if (this.vertical) {
      // The stylesheet hides the spacer here; its height stays so a switch
      // back doesn't briefly shorten the page (and clamp the scroll to 0).
      meta.style.removeProperty("--fit");
      delete meta.dataset.top;
      this.maxTravel = 0;
      this.centerOffset = 0;
      this.anchor = null;
      this.clearTransforms();
    } else {
      this.fitMeta();
      this.maxTravel = Math.max(0, Math.round(track.offsetWidth - this.vw));
      spacer.style.height = `${this.maxTravel + this.vh}px`;
      for (const item of this.items) {
        item.left = item.el.offsetLeft;
        item.width = item.el.offsetWidth;
      }
      // Where the title would sit centred on the viewport, relative to its
      // slot: the entrance (and the next-project hand-off) starts it there.
      const metaTop = meta.getBoundingClientRect().top;
      this.centerOffset = this.vh / 2 - (metaTop + title.offsetTop + title.offsetHeight / 2);
      this.applyAnchor();
    }

    if (wasVertical !== this.vertical) {
      if (this.vertical) this.stopStage("off");
      else this.maybeStartStage();
      if (flipTo) this.restoreFlipAnchor(flipTo);
    }
    this.observedSizes = this.sizeKey();
    this.stage?.measure();
  }

  /** Legacy records can carry long lists: shrink the copy under the title
   *  (never the title itself) until the block fits between header and
   *  bottom edge, and pin it under the header if even that isn't enough. */
  private fitMeta() {
    const { meta, body } = this.e;
    meta.style.setProperty("--fit", "1");
    delete meta.dataset.top;
    if (!body) return;
    const room = this.vh - 2 * (SITE_HEADER + META_CLEARANCE);
    const height = meta.offsetHeight;
    if (height <= room) return;
    const bodyHeight = body.offsetHeight;
    const scale = clamp((room - (height - bodyHeight)) / Math.max(1, bodyHeight), META_MIN_FIT, 1);
    meta.style.setProperty("--fit", scale.toFixed(3));
    if (meta.offsetHeight > this.vh - SITE_HEADER - 2 * META_CLEARANCE) {
      // Still too tall at the smallest type: pinned under the header and
      // scrollable on its own (the smoother leaves wheel input inside it alone).
      meta.dataset.top = "";
    }
    meta.toggleAttribute("data-lenis-prevent", meta.dataset.top !== undefined);
  }

  private scanItems() {
    const elements = [...this.e.track.querySelectorAll<HTMLElement>("[data-detail-item]")];
    const ids = elements.map((el) => el.dataset.id).join("|");
    if (ids === this.itemIds) return;
    const changed = this.itemIds !== "";
    const previousIds = this.itemIds ? this.itemIds.split("|") : [];
    this.itemIds = ids;
    const previous = new Map(this.items.map((item) => [item.el, item]));
    this.items = elements.map((el) => {
      const kept = previous.get(el);
      if (kept) {
        previous.delete(el);
        return kept;
      }
      const item: Item = {
        id: el.dataset.id ?? "",
        el,
        frame: el.querySelector<HTMLElement>("[data-frame]") ?? el,
        full: el.hasAttribute("data-full"),
        kind: el.dataset.kind === "video" ? "video" : "image",
        img: el.querySelector("img"),
        video: el.querySelector("video"),
        left: 0,
        width: 0,
        visible: false,
        pendingEmerge: false,
        owned: false,
        transformed: false,
      };
      if (changed && !this.reduced) el.dataset.emerge = "out";
      this.byElement.set(el, item);
      this.io?.observe(el);
      return item;
    });
    for (const gone of previous.values()) {
      this.byElement.delete(gone.el);
      this.io?.unobserve(gone.el);
    }
    this.videosDirty = true;
    if (!changed) return;
    // Only removals (media that failed to load): the running stage drops
    // those items and every other one stays exactly as it is on screen.
    const kept = new Set(this.items.map((item) => item.id));
    const gone = previousIds.filter((id) => !kept.has(id));
    const onlyRemoved = gone.length > 0 && gone.length + kept.size === previousIds.length;
    if (onlyRemoved && this.stageState === "on" && this.stage) {
      this.stage.remove(gone);
      this.stage.measure();
      return;
    }
    // Anything else changed the stage's list of placeholders: start it over.
    if (this.stageState === "on" || this.stageState === "starting") {
      this.stopStage("off");
      this.maybeStartStage();
    }
  }

  private flipAnchor(wasVertical: boolean, nowVertical: boolean) {
    if (wasVertical === nowVertical) return undefined;
    if (wasVertical) return this.items.find((item) => item.visible && window.scrollY > 0);
    return this.travel > 0
      ? this.items.find((item) => item.left + item.width > this.travel)
      : undefined;
  }

  private restoreFlipAnchor(item: Item) {
    if (!this.items.includes(item)) return;
    let target: number;
    if (this.vertical) {
      target = item.el.getBoundingClientRect().top + window.scrollY - SITE_HEADER - 16;
    } else {
      target = clamp(item.left - Math.max(0, this.vw - item.width) / 2, 0, this.maxTravel);
    }
    window.scrollTo(0, Math.max(0, target));
    this.travel = this.lastTravel = this.vertical ? 0 : Math.max(0, target);
  }

  private applyAnchor() {
    const anchor = this.anchor;
    this.anchor = null;
    if (!anchor) return;
    const item = this.items.find((entry) => entry.id === anchor.id);
    if (!item) return;
    const place =
      "share" in anchor ? item.left + anchor.share * item.width : item.left - anchor.offset;
    const target = clamp(place, 0, this.maxTravel);
    if (Math.abs(target - this.travel) < 0.5) return;
    scrollPageTo(target, { duration: 0 });
    // The jump isn't motion: keep it out of the speed response.
    this.travel = this.lastTravel = target;
  }

  // ------------------------------------------------------------ frame

  private readonly tick = (_time: number, dt: number) => {
    if (this.disposed) return;
    this.frames += 1;
    this.stepTimers(dt);
    if (this.momentum) this.stepMomentum(dt);

    const scrollY = window.scrollY;
    const travel = this.vertical ? scrollY : clamp(scrollY, 0, this.maxTravel);
    this.velocity = this.firstFrame ? 0 : travel - this.lastTravel;
    this.firstFrame = false;
    this.lastTravel = travel;
    this.travel = travel;
    if (!this.vertical) this.setTransform(this.e.track, `translate3d(${-travel}px,0,0)`);
    if (Math.abs(this.velocity) > 0.5 && this.entrance === "done") this.dismissHint();

    this.stepEntrance(dt);
    const npr = this.stepHandoff(dt);
    this.writeMeta(npr, dt);
    this.itemsOpacity = (this.reduced ? 1 : fit(this.csr, 0.5, 1, 0, 1)) * fit(npr, 0, 0.5, 1, 0);
    this.setOpacity(this.e.track, this.itemsOpacity);
    this.writeNext(npr);
    this.stepOverscroll(dt);
    this.stepMedia(dt);
    if (this.videosDirty || this.frames % 20 === 0) this.syncVideos();
    this.inputForward = false;
    this.inputBack = false;
  };

  private stepTimers(dt: number) {
    for (let index = this.timers.length - 1; index >= 0; index -= 1) {
      const timer = this.timers[index];
      timer.remaining -= dt;
      if (timer.remaining <= 0) {
        this.timers.splice(index, 1);
        timer.resolve();
      }
    }
  }

  /** Resolves after `seconds` of visible time (animation frames stop in a hidden tab). */
  private visibleDelay(seconds: number) {
    return new Promise<void>((resolve) => this.timers.push({ remaining: seconds, resolve }));
  }

  private setTransform(el: HTMLElement, value: string) {
    if (this.transforms.get(el) === value) return;
    this.transforms.set(el, value);
    el.style.transform = value;
  }

  private setOpacity(el: HTMLElement, value: number) {
    const text = value >= 0.999 ? "1" : value <= 0.001 ? "0" : value.toFixed(3);
    if (this.opacities.get(el) === text) return;
    this.opacities.set(el, text);
    el.style.opacity = text;
  }

  private clearTransforms() {
    this.setTransform(this.e.track, "");
    if (this.e.panel) this.setTransform(this.e.panel, "");
    for (const item of this.items) this.clearFrame(item);
  }

  // ------------------------------------------------------------ entrance

  private async runEntrance() {
    if (this.reduced) {
      this.finishEntrance();
      return;
    }
    this.entranceLocked = true;
    acquireScrollLock(ENTRANCE_LOCK);
    if (!this.o.arrived) {
      const fonts = document.fonts
        ? Promise.race([document.fonts.ready.then(() => undefined), delay(FONT_WAIT_MS)])
        : Promise.resolve();
      await Promise.race([
        Promise.all([fonts, waitForRouteReveal(), waitForProjectReveal()]),
        this.visibleDelay(REVEAL_WAIT_SECONDS),
      ]);
    }
    if (this.disposed || this.entrance !== "waiting") return;
    // Fonts may have changed the title's metrics while we waited.
    this.relayout();
    this.entrance = "running";
    this.entranceTime = 0;
  }

  private stepEntrance(dt: number) {
    if (this.entrance !== "running") return;
    const before = this.csr;
    this.entranceTime += dt;
    this.csr = clamp(this.entranceTime / ENTRANCE_SECONDS);
    if (this.csr >= SCROLL_UNLOCK_AT) this.releaseEntranceLock();
    if (before < 0.4 && this.csr >= 0.4) this.videosDirty = true;
    // The media start fading in: the header samples along (headerTone).
    if (before < 0.55 && this.csr >= 0.55) requestHeaderToneSample();
    if (this.csr >= 1) this.entrance = "done";
  }

  private finishEntrance() {
    this.csr = 1;
    this.entrance = "done";
    this.releaseEntranceLock();
    this.videosDirty = true;
  }

  private releaseEntranceLock() {
    if (!this.entranceLocked) return;
    this.entranceLocked = false;
    releaseScrollLock(ENTRANCE_LOCK);
  }

  private async signalReady() {
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (this.disposed) return;
    const first = this.items
      .filter((item) =>
        this.vertical ? item.el.getBoundingClientRect().top < this.vh : item.left < this.vw,
      )
      .slice(0, 3);
    const loads = first.map((item) =>
      item.img
        ? item.img.decode().catch(() => undefined)
        : item.video
          ? videoReady(item.video)
          : undefined,
    );
    await Promise.race([Promise.all(loads), delay(READY_TIMEOUT_MS)]);
    if (!this.disposed) markProjectPageReady(this.o.slug);
  }

  // ------------------------------------------------------------ meta

  private writeMeta(npr: number, dt: number) {
    const { title, meta, hint } = this.e;
    const horizontal = !this.vertical;
    const travel = this.travel;
    const scrollFade = horizontal ? fit(travel, 0, META_FADE_VW * this.vw, 1, 0) : 1;
    const visible = Math.min(1 - npr, scrollFade) * fit(npr, 0, 0.3, 1, 0);
    // Parallax: each piece slides at its own fraction of the travel. Under
    // reduced motion the block simply moves with the track.
    const shift = (share: number) => {
      if (!horizontal) return 0;
      return this.reduced ? -travel : -travel * share;
    };

    const rise =
      horizontal && !this.reduced ? fit(this.csr, 0, 0.65, this.centerOffset, 0, expoInOut) : 0;
    // Stacked, the title doesn't move (as on lusion's phones): it is there
    // from the first paint, which is also the page's largest paint.
    const titleIn = this.o.arrived || this.reduced || !horizontal ? 1 : fit(this.csr, 0, 0.2, 0, 1);
    this.setTransform(title, `translate3d(${shift(0.5).toFixed(1)}px,${rise.toFixed(1)}px,0)`);
    this.setOpacity(title, Math.min(visible, titleIn));

    for (const part of this.parts) {
      const reveal = this.reduced ? 1 : fit(this.csr, part.spec.from, part.spec.to, 0, 1, expoOut);
      const x = part.spec.parallax || this.reduced ? shift(part.spec.parallax) : 0;
      this.setTransform(
        part.el,
        `translate3d(${x.toFixed(1)}px,${((1 - reveal) * RISE_PX).toFixed(1)}px,0)`,
      );
      this.setOpacity(part.el, Math.min(visible, reveal));
    }

    const idle = horizontal && visible < 0.5;
    if (idle !== meta.hasAttribute("data-idle")) meta.toggleAttribute("data-idle", idle);

    if (hint) {
      if (this.hintGone) this.hintFade = Math.min(1, this.hintFade + dt);
      const linksIn = this.reduced ? 1 : fit(this.csr, 0.55, 1, 0, 1, expoOut);
      this.setOpacity(hint, Math.max(0, linksIn - expoOut(this.hintFade)) * fit(npr, 0, 0.3, 1, 0));
    }
  }

  private dismissHint() {
    if (this.hintGone) return;
    this.hintGone = true;
    dismissScrollHint();
  }

  // ------------------------------------------------------------ next project

  private panelRest() {
    return Math.min(this.maxTravel + PANEL_REST_VW * this.vw - this.travel, this.vw);
  }

  private titleColor(npr: number) {
    // The resting title is the next palette's text at 55% (see .nextTitle);
    // it reaches full text colour over the last quarter of the wipe.
    const share = 55 + 45 * fit(npr, 0.75, 1, 0, 1);
    return `color-mix(in srgb, var(--project-text) ${share.toFixed(1)}%, var(--project-bg))`;
  }

  private writeNext(npr: number) {
    const { panel, panelTitle, panelFooter, bar, wipe, wipeTitle } = this.e;
    if (!panel) return;
    if (bar) this.setTransform(bar, `scaleX(${this.overscroll.toFixed(4)})`);
    if (panelFooter) {
      const footerIn = this.reduced ? 1 : fit(this.csr, 0.6, 1, 0, 1);
      this.setOpacity(panelFooter, expoInOut(footerIn * fit(npr, 0, 0.5, 1, 0)));
    }
    if (!this.vertical) {
      const x = this.handoff ? mix(this.handoff.from, 0, quintInOut(npr)) : this.panelRest();
      this.setTransform(panel, `translate3d(${x.toFixed(2)}px,0,0)`);
      if (this.handoff && panelTitle) panelTitle.style.color = this.titleColor(npr);
    } else if (this.handoff && wipe && wipeTitle) {
      const y = mix(this.handoff.from, 0, quintInOut(npr));
      this.setTransform(wipe, `translate3d(0,${y.toFixed(2)}px,0)`);
      const titleY = mix(this.handoff.titleFrom, this.handoff.titleTo, npr);
      this.setTransform(wipeTitle, `translate3d(0,${titleY.toFixed(2)}px,0)`);
      wipeTitle.style.color = this.titleColor(npr);
    }
  }

  private atEnd() {
    if (!this.vertical) return this.travel >= this.maxTravel - 1;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return window.scrollY >= max - 1;
  }

  private nearEnd() {
    if (!this.vertical) return this.travel >= this.maxTravel - 0.5 * this.vw;
    const panel = this.e.panel;
    return Boolean(panel && panel.getBoundingClientRect().top < this.vh * 1.5);
  }

  private stepOverscroll(dt: number) {
    if (!this.e.panel || this.handoff) return;
    if (this.reduced || this.csr < SCROLL_UNLOCK_AT) {
      this.overscroll = 0;
      return;
    }
    if (!this.prefetched && this.frames % 15 === 0 && this.nearEnd()) {
      this.prefetched = true;
      this.o.onPrefetchNext();
    }
    const rate =
      this.inputForward && this.atEnd()
        ? OVERSCROLL_RISE
        : this.inputBack
          ? -OVERSCROLL_DRAIN
          : -OVERSCROLL_DECAY;
    this.overscroll = clamp(this.overscroll + rate * dt);
    if (this.overscroll >= 1) this.startHandoff();
  }

  private startHandoff() {
    const { panel, panelTitle, title, wipe, wipeTitle } = this.e;
    if (this.handoff || !panel) return;
    if (this.reduced) {
      this.o.onNavigateNext();
      return;
    }
    this.o.onPrefetchNext();
    this.overscroll = 1;
    this.momentum = 0;
    acquireScrollLock(HANDOFF_LOCK);
    setDetailHandoffActive(true);
    // The header sits above the wipe and would otherwise keep this page's
    // colours until the next page's theme lands at navigation.
    // The scheme is read now, not when the page mounted: the visitor may
    // have switched light and dark since.
    if (this.o.nextThemeId) {
      const scheme = document.documentElement.classList.contains("dark") ? "dark" : "light";
      this.headerWalk = walkHeaderPalette(PROJECT_THEMES[this.o.nextThemeId][scheme]);
    }
    if (!this.vertical) {
      this.handoff = { time: 0, from: this.panelRest(), titleFrom: 0, titleTo: 0, done: false };
    } else {
      const panelTop = clamp(panel.getBoundingClientRect().top, 0, this.vh);
      const titleTop = panelTitle?.getBoundingClientRect().top ?? panelTop;
      // The title's place on the next page: the same layout, scrolled to the top.
      const slot = title.getBoundingClientRect().top + window.scrollY;
      this.handoff = {
        time: 0,
        from: panelTop,
        titleFrom: titleTop - panelTop,
        titleTo: slot,
        done: false,
      };
      if (wipe && wipeTitle) {
        this.setTransform(wipe, `translate3d(0,${panelTop}px,0)`);
        this.setTransform(wipeTitle, `translate3d(0,${titleTop - panelTop}px,0)`);
        wipe.style.visibility = "visible";
      }
    }
    this.videosDirty = true;
  }

  private stepHandoff(dt: number) {
    const handoff = this.handoff;
    if (!handoff) return 0;
    handoff.time += dt;
    const npr = clamp(handoff.time / HANDOFF_SECONDS);
    // Lands a little before the navigation: the header's own CSS colour
    // transition trails what we write.
    this.headerWalk?.set(fit(npr, 0.45, 0.85, 0, 1));
    if (npr >= 1 && !handoff.done) {
      handoff.done = true;
      this.o.onNavigateNext();
    }
    return npr;
  }

  // ------------------------------------------------------------ media

  private readonly onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const item = this.byElement.get(entry.target);
      if (!item) continue;
      item.visible = entry.isIntersecting;
      if (this.reduced) continue;
      if (!entry.isIntersecting) {
        // Fully out: the emerge replays on the next entry.
        item.el.dataset.emerge = "out";
        item.pendingEmerge = false;
      } else if (item.el.dataset.emerge !== "in") {
        item.pendingEmerge = true;
      }
    }
    this.videosDirty = true;
  };

  private stepMedia(dt: number) {
    if (!this.reduced && this.itemsOpacity > 0.05) {
      for (const item of this.items) {
        if (!item.pendingEmerge) continue;
        item.pendingEmerge = false;
        item.el.dataset.emerge = "in";
      }
    }
    if (!this.vertical) {
      for (const item of this.items) {
        const img = item.img;
        if (img && img.loading === "lazy" && item.left - this.travel < this.vw * EAGER_AHEAD_VW) {
          img.loading = "eager";
        }
      }
    }
    if (this.reduced) return;

    // Scroll-speed response for DOM media (the stage has its own): a lean
    // with the motion plus lusion's arch (edges down, centre up), both from
    // the per-frame speed, springing back to exactly nothing at rest.
    const size = this.vertical ? this.vh : this.vw;
    const target = clamp((this.velocity / size) * 60, -5, 5);
    this.speed += (target - this.speed) * (1 - Math.exp(-12 * dt));
    if (Math.abs(this.speed) < 0.02 && Math.abs(target) < 0.02) {
      this.speed = 0;
      if (this.speedActive) {
        this.speedActive = false;
        for (const item of this.items) this.clearFrame(item);
      }
      return;
    }
    this.speedActive = true;
    const amplitude = Math.min(28, this.speed * this.speed * 1.2);
    for (const item of this.items) {
      if (item.owned || !item.visible) {
        this.clearFrame(item);
        continue;
      }
      let value: string;
      if (this.vertical) {
        value = `skewY(${(this.speed * 0.5).toFixed(3)}deg)`;
      } else {
        const centre = (item.left - this.travel + item.width / 2) / this.vw;
        const arch = amplitude * Math.cos(centre * Math.PI * 2);
        value = `translate3d(0,${arch.toFixed(2)}px,0) skewX(${this.speed.toFixed(3)}deg)`;
      }
      item.transformed = true;
      this.setTransform(item.frame, value);
    }
  }

  private clearFrame(item: Item) {
    if (!item.transformed) return;
    item.transformed = false;
    this.setTransform(item.frame, "");
  }

  private syncVideos() {
    this.videosDirty = false;
    const hidden = document.visibilityState !== "visible";
    for (const item of this.items) {
      const video = item.video;
      if (!video) continue;
      const chosen = this.reduced
        ? "userPlayed" in video.dataset
        : !("userPaused" in video.dataset);
      const play = item.visible && !hidden && !this.handoff && this.csr >= 0.4 && chosen;
      if (play && video.paused) void video.play().catch(() => undefined);
      else if (!play && !video.paused) video.pause();
    }
  }

  // ------------------------------------------------------------ stage

  private maybeStartStage() {
    if (this.vertical || this.reduced || this.stageState !== "off" || !this.items.length) return;
    // Started at once, before the entrance: items the stage claims while
    // already on screen still open from its own emerge. It resolves null
    // without hardware WebGL2, and the DOM media stay.
    this.stageState = "starting";
    const attempt = ++this.stageAttempt;
    const superseded = () =>
      attempt !== this.stageAttempt || this.disposed || this.vertical || this.reduced;
    void (async () => {
      try {
        const { startDetailStage } = await import("./stage/detail-stage");
        if (superseded()) return;
        const handle = await startDetailStage({
          container: this.e.gl,
          items: this.stageItems(),
          palette: this.palette,
          getFrame: this.frameState,
          // Only the current attempt may change ownership: a superseded
          // engine handing its items back must not strip the live one's.
          onOwnershipChange: (id, owned) => {
            if (attempt === this.stageAttempt) this.onOwnership(id, owned);
          },
          onFailure: this.onStageFailure,
        });
        if (!handle) {
          if (!superseded()) this.stageState = "failed";
          return;
        }
        // Resolved after this page (or this layout) let go of it, or after a
        // newer start took over: nothing may keep drawing, and the newer
        // stage's ownership must stay as it is.
        if (superseded()) {
          handle.dispose();
          return;
        }
        this.stage = handle;
        this.stageState = "on";
      } catch {
        if (!superseded()) this.stopStage("failed");
      }
    })();
  }

  private stageItems(): DetailStageItem[] {
    return this.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      fullscreen: item.full,
      element: item.el,
      src: item.img?.src || item.video?.poster || undefined,
      video: item.video ?? undefined,
    }));
  }

  private readonly onOwnership = (id: string, owned: boolean) => {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return;
    item.owned = owned;
    item.el.toggleAttribute("data-owned", owned);
    if (owned) this.clearFrame(item);
  };

  private readonly onStageFailure = () => this.stopStage("failed");

  private releaseOwnership() {
    for (const item of this.items) {
      item.owned = false;
      item.el.removeAttribute("data-owned");
    }
  }

  private stopStage(state: "off" | "failed") {
    this.stageAttempt += 1;
    this.stage?.dispose();
    this.stage = null;
    this.releaseOwnership();
    this.stageState = state;
  }

  // ------------------------------------------------------------ input

  private async startLenis() {
    if (this.reduced || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const stop = await startSmoothScroll({
      lerp: WHEEL_LERP,
      gestureOrientation: "both",
      maxWheelDelta: MAX_WHEEL_DELTA,
      pageStep: () => (this.vertical ? window.innerHeight * 0.85 : window.innerWidth),
      horizontalArrows: () => !this.vertical,
    });
    if (this.disposed || this.reduced) {
      stop();
      return;
    }
    this.stopLenis = stop;
    this.lenisOn = true;
    // Re-join the scroll phase behind Lenis, so the track reads the scroll
    // position Lenis has just written this frame.
    this.offFrame?.();
    this.offFrame = addFrameCallback("scroll", this.tick);
  }

  private toReduced() {
    if (this.disposed) return;
    this.reduced = true;
    this.finishEntrance();
    this.momentum = 0;
    this.overscroll = 0;
    this.stopLenis?.();
    this.stopLenis = null;
    this.lenisOn = false;
    this.stopStage("off");
    this.speed = 0;
    for (const item of this.items) {
      item.el.removeAttribute("data-emerge");
      item.pendingEmerge = false;
      this.clearFrame(item);
    }
  }

  private listen() {
    const { stage } = this.e;
    const add = <K extends keyof WindowEventMap>(
      type: K,
      listener: (event: WindowEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      window.addEventListener(type, listener, options);
      this.cleanups.push(() => window.removeEventListener(type, listener, options));
    };
    add("wheel", this.onWheel, { passive: true });
    add("keydown", this.onKey);
    add("resize", () => this.queueRelayout());
    // Before the route curtain's document-level listener: the next project
    // link plays its own hand-off instead.
    add("click", this.onClickCapture, { capture: true });
    add("touchstart", this.onTouchStart, { passive: true });
    add("touchmove", this.onTouchMove, { passive: true });
    add("touchend", this.onTouchEnd, { passive: true });
    add("touchcancel", this.onTouchEnd, { passive: true });

    stage.addEventListener("focusin", this.onFocus);
    this.cleanups.push(() => stage.removeEventListener("focusin", this.onFocus));

    // Straight away: a hidden tab gets no animation frames, so waiting for
    // the next tick would leave videos playing in the background.
    const onVisibility = () => this.syncVideos();
    document.addEventListener("visibilitychange", onVisibility);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

    const layoutQuery = window.matchMedia(VERTICAL_QUERY);
    const onLayout = () => this.relayout();
    layoutQuery.addEventListener("change", onLayout);
    this.cleanups.push(() => layoutQuery.removeEventListener("change", onLayout));
  }

  private readonly onWheel = (event: WheelEvent) => {
    // Another owner (the nav menu) holds the page, or our own entrance or
    // hand-off does: the strip takes no input, native or smoothed.
    if (event.ctrlKey || isScrollLocked()) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta > 0) this.inputForward = true;
    else if (delta < 0) this.inputBack = true;
    if (delta !== 0) this.dismissHint();
    // Sideways swipes scroll the strip even without Lenis.
    if (
      !this.vertical &&
      !this.lenisOn &&
      !this.entranceLocked &&
      !this.handoff &&
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ) {
      window.scrollTo(0, clamp(window.scrollY + event.deltaX, 0, this.maxTravel));
    }
  };

  private readonly onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isScrollLocked()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(KEY_OWNERS)) return;
    const page = this.vertical ? window.innerHeight * 0.85 : window.innerWidth;
    let step: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        step = ARROW_STEP;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        step = -ARROW_STEP;
        break;
      case "PageDown":
        step = page;
        break;
      case "PageUp":
        step = -page;
        break;
      case " ":
        step = event.shiftKey ? -page : page;
        break;
      case "Home":
        step = -Infinity;
        break;
      case "End":
        step = Infinity;
        break;
      default:
        return;
    }
    if (step > 0) this.inputForward = true;
    else this.inputBack = true;
    this.dismissHint();
    // Native scrolling (stacked layout) and Lenis handle the keys themselves.
    if (this.vertical || this.lenisOn) return;
    event.preventDefault();
    if (this.entranceLocked || this.handoff) return;
    const base = this.keyTarget ?? window.scrollY;
    const next = clamp(base + step, 0, this.maxTravel);
    this.keyTarget = next;
    window.clearTimeout(this.keyTimer);
    this.keyTimer = window.setTimeout(() => {
      this.keyTarget = null;
    }, 450);
    scrollPageTo(next, { duration: this.reduced ? 0 : 0.45 });
  };

  private readonly onClickCapture = (event: MouseEvent) => {
    const panel = this.e.panel;
    if (!panel || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Node) || !panel.contains(event.target)) return;
    // Reduced motion keeps the plain link.
    if (this.reduced) return;
    event.preventDefault();
    this.startHandoff();
  };

  private readonly onFocus = (event: FocusEvent) => {
    if (this.vertical || this.handoff || !(event.target instanceof Element)) return;
    const target = event.target;
    const duration = this.reduced ? 0 : 0.8;
    if (this.e.panel?.contains(target)) {
      if (this.travel < this.maxTravel - 1) scrollPageTo(this.maxTravel, { duration });
      return;
    }
    const figure = target.closest("[data-detail-item]");
    const item = figure ? this.byElement.get(figure) : undefined;
    if (item) {
      if (item.width <= this.vw) {
        const left = item.left - this.travel;
        if (left < 0 || left + item.width > this.vw) {
          const centred = item.left - (this.vw - item.width) / 2;
          scrollPageTo(clamp(centred, 0, this.maxTravel), { duration });
        }
        return;
      }
      // A figure wider than the screen (a full item): bring the focused
      // control itself into view, with a little room for its focus ring.
      const rect = target.getBoundingClientRect();
      const margin = 24;
      if (rect.left < margin) {
        scrollPageTo(clamp(this.travel + rect.left - margin, 0, this.maxTravel), { duration });
      } else if (rect.right > this.vw - margin) {
        scrollPageTo(clamp(this.travel + rect.right - this.vw + margin, 0, this.maxTravel), {
          duration,
        });
      }
      return;
    }
    if (this.e.meta.contains(target) && this.travel > 1) scrollPageTo(0, { duration });
  };

  private readonly onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      this.drag = null;
      return;
    }
    const touch = event.touches[0];
    this.momentum = 0;
    this.drag = {
      x0: touch.clientX,
      y0: touch.clientY,
      x: touch.clientX,
      y: touch.clientY,
      axis: null,
      history: [],
    };
  };

  private readonly onTouchMove = (event: TouchEvent) => {
    const drag = this.drag;
    if (!drag || event.touches.length !== 1 || isScrollLocked()) return;
    const touch = event.touches[0];
    const dx = touch.clientX - drag.x;
    const dy = touch.clientY - drag.y;
    drag.x = touch.clientX;
    drag.y = touch.clientY;
    if (!drag.axis) {
      const tx = touch.clientX - drag.x0;
      const ty = touch.clientY - drag.y0;
      if (Math.hypot(tx, ty) < 8) return;
      drag.axis = Math.abs(tx) > Math.abs(ty) ? "x" : "y";
    }
    this.dismissHint();
    if (drag.axis === "y") {
      // The browser pans the page; at the end, pulling on still counts.
      if (-dy > 0 && this.atEnd()) this.inputForward = true;
      else if (-dy < 0) this.inputBack = true;
      return;
    }
    if (this.vertical) return;
    const delta = -dx;
    if (delta > 0) this.inputForward = true;
    else if (delta < 0) this.inputBack = true;
    if (this.entranceLocked || this.handoff) return;
    window.scrollTo(0, clamp(window.scrollY + delta, 0, this.maxTravel));
    const now = performance.now();
    drag.history.push({ t: now, d: delta });
    while (drag.history.length && now - drag.history[0].t > DRAG_HISTORY_MS) drag.history.shift();
  };

  private readonly onTouchEnd = () => {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.axis !== "x" || this.vertical || this.handoff) return;
    const now = performance.now();
    const recent = drag.history.filter((entry) => now - entry.t <= DRAG_HISTORY_MS);
    if (recent.length < 2) return;
    const span = Math.max(0.016, (recent[recent.length - 1].t - recent[0].t) / 1000);
    const velocity = recent.reduce((sum, entry) => sum + entry.d, 0) / span;
    this.momentum = Math.abs(velocity) > 40 ? velocity : 0;
  };

  private stepMomentum(dt: number) {
    const velocity = this.momentum;
    const next = clamp(window.scrollY + velocity * dt, 0, this.maxTravel);
    window.scrollTo(0, next);
    const friction = mix(FRICTION_FROM, FRICTION_TO, clamp(Math.abs(velocity / this.vw / 5)));
    const slowed = velocity - friction * velocity * dt;
    const stopped = Math.abs(slowed) < 8 || next <= 0 || next >= this.maxTravel;
    this.momentum = stopped ? 0 : slowed;
  }
}
