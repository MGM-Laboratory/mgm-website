import gsap from "gsap";
import {
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  type Group,
  type WebGLRenderer,
} from "three";

import { CARD_FRAGMENT, CARD_VERTEX } from "@/components/articles/world/cards/card-shaders";
import {
  DecodeQueue,
  coverUv,
  drawTextAtlas,
  loadCover,
  measureTextStrip,
  textStripSignature,
  whenStripFontsReady,
  type TextAtlas,
  type TextStripLayout,
} from "@/components/articles/world/cards/card-textures";
import { WORLD_PALETTE } from "@/components/articles/world/palette";
import type { CardsLayerApi, WorldCard } from "@/components/articles/world/world-api";
import type { WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The list's cards, drawn by the world on top of their DOM frames.
 *
 * Every card the list registers keeps its DOM `<a>` (links, focus, screen
 * readers, find-in-page); the world draws one sheet per card where the DOM
 * card rests (cover, gap and text strip in a single mesh, card-shaders.ts)
 * and bends it with the river. Only cards near the viewport own GPU
 * resources: a card gets its mesh and queues its cover decode once it comes
 * within `WAKE_*` viewports of the screen, and gives everything back once
 * it is `SLEEP_*` viewports away (at most `MAX_AWAKE` at once, the farthest
 * going first), so a list of two hundred articles costs about as much as
 * the two dozen near the screen.
 *
 * DOM offsets are cached (document space) and re-measured on resize, font
 * load and list changes, never per frame; each frame only subtracts the
 * live scroll position. Sleeping cards measure only their slot (a cheap
 * rect that `content-visibility` never skips); awake ones also measure
 * their text pieces for the atlas.
 *
 * Interaction lives here too: the hover (zoom, lift, lean, light sweep,
 * accent rule, title roll, arrow swap and the cursor's ripples), the press
 * (a squash and a ripple burst), the filter swap and the intro. Hover never
 * starts mid-scroll (docs/animation-system.md gotcha #20): it waits for the
 * list to settle, then plays if the pointer is still on the card.
 */

/** Viewports above/below the screen where a card is woken (mesh, textures). */
const WAKE_ABOVE = 1;
const WAKE_BELOW = 2.1;
/** Beyond these it is put to sleep again (hysteresis against thrashing). */
const SLEEP_ABOVE = 1.8;
const SLEEP_BELOW = 3.1;
/** Most cards drawn at once (one mesh each). */
const MAX_AWAKE = 28;

const HOVER_ZOOM = 1.1;
const HOVER_LIFT = 38;
const SWELL = 24;
/** Quad margin around each sheet (antialiased edges, the rule on the bottom edge). */
const SHEET_PAD = 3;
/** Mesh resolution: enough for the fold's curl and the cursor's ripples. */
const SEGMENTS_X = 36;
const SEGMENTS_Y = 18;
/** Lean toward the cursor, radians (about x and about y). */
const LEAN_X = 0.045;
const LEAN_Y = 0.06;
const RIPPLE_REST = 3.5;
const RIPPLE_MOVING = 9;
const BURST = 15;
/** The filter's recede/rise and the intro's depth, CSS px. */
const FILTER_DEPTH = 200;
const FILTER_STAGGER = 0.035;
const INTRO_DEPTH = 760;
const INTRO_RISE = 70;
/** Scroll counts as settled once it hasn't moved for this long, seconds. */
const SCROLL_SETTLE = 0.14;

type Rect = { left: number; top: number; width: number; height: number };

type CardState = {
  inner: number;
  hover: number;
  hoverLift: number;
  sweep: number;
  rule: number;
  roll: number;
  arrow: number;
  reveal: number;
  textReveal: number;
  filterLift: number;
  filterOpacity: number;
  introLift: number;
  introRise: number;
  introOpacity: number;
  tiltX: number;
  tiltY: number;
  lean: number;
  pointX: number;
  pointY: number;
  pointAmp: number;
  squash: number;
  burstX: number;
  burstY: number;
  burstAge: number;
  burstAmp: number;
};

type Entry = {
  card: WorldCard;
  /** Set when the DOM card went: the entry is released a frame later unless it comes back. */
  detached: boolean;
  /** The card's document-space rects: its slot, the sheet (cover to rule), cover and strip. */
  slot: Rect;
  sheet: Rect;
  cover: Rect;
  meta: Rect;
  /** Offsets of the sheet inside the slot, from the last full measure (shared layout). */
  inset: { left: number; top: number; coverHeight: number; metaTop: number; metaHeight: number };
  layout: TextStripLayout | null;
  atlas: TextAtlas | null;
  textSignature: string;
  textPending: boolean;
  awake: boolean;
  mesh?: Mesh;
  material?: ShaderMaterial;
  coverTexture?: Texture;
  textTexture?: CanvasTexture;
  textCanvas?: HTMLCanvasElement;
  cancelDecode?: () => void;
  loadToken: number;
  state: CardState;
  tweens: Set<gsap.core.Tween>;
};

type FoldZones = { push: [number, number]; pull: [number, number] };

/**
 * Where the fold starts below the head's bottom, as a share of the viewport
 * height. unseen.co's fold sits about 11 % of the viewport under its thin
 * filter bar, which leaves the rolled-over sheets room to show; our head is
 * taller (it carries the search), so a slightly smaller gap keeps the first
 * row high while the roll still reads (articles.css starts the grid just
 * under this line, so nothing rests folded).
 */
const FOLD_GAP = 0.085;
/** The band over which sheets fade out under the head, a share of the viewport height. */
const HEAD_FADE = 0.045;

function ease(k: number, dt: number) {
  return 1 - (1 - k) ** (60 * dt);
}

/**
 * Fold zones (CSS px above the viewport centre), after unseen.co's bend
 * points but starting just under our fixed head (unseen's 31.8 % sits just
 * under its filter bar): the push starts 3.5 % of the viewport below the
 * head's bottom and every other point keeps unseen's distance from it.
 * Desktop scales with the viewport height as unseen's does; tablets and
 * phones use its fixed pixel zones.
 */
function foldZones(width: number, height: number, head: number): FoldZones {
  const start = height / 2 - (head + height * FOLD_GAP);
  if (width >= 1024) {
    return {
      push: [start, start + 1.091 * height],
      pull: [start + 0.018 * height, start + 0.709 * height],
    };
  }
  if (width >= 768) return { push: [start, start + 800], pull: [start + 20, start + 500] };
  return { push: [start, start + 1000], pull: [start + 20, start + 640] };
}

function docRect(element: Element, scrollY: number): Rect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top + scrollY, width: rect.width, height: rect.height };
}

function freshState(): CardState {
  return {
    inner: 1,
    hover: 0,
    hoverLift: 0,
    sweep: 0,
    rule: 0,
    roll: 0,
    arrow: 0,
    reveal: 0,
    textReveal: 0,
    filterLift: 0,
    filterOpacity: 1,
    introLift: 0,
    introRise: 0,
    introOpacity: 1,
    tiltX: 0,
    tiltY: 0,
    lean: 0,
    pointX: 0,
    pointY: 0,
    pointAmp: 0,
    squash: 0,
    burstX: 0,
    burstY: 0,
    burstAge: 9,
    burstAmp: 0,
  };
}

export type CardsLayerOptions = {
  group: Group;
  renderer: WebGLRenderer;
  world: WorldUniforms;
  pixelRatio: () => number;
  viewport: () => { width: number; height: number };
};

export class CardsLayer implements CardsLayerApi {
  private readonly entries = new Map<string, Entry>();
  private readonly geometry = new PlaneGeometry(1, 1, SEGMENTS_X, SEGMENTS_Y);
  private readonly colors = {
    paperLight: new Color(WORLD_PALETTE.light.paper),
    paperDark: new Color(WORLD_PALETTE.dark.paper),
    inkLight: new Color(WORLD_PALETTE.light.ink),
    inkDark: new Color(WORLD_PALETTE.dark.ink),
    softLight: new Color(WORLD_PALETTE.light.inkSoft),
    softDark: new Color(WORLD_PALETTE.dark.inkSoft),
    accentLight: new Color(WORLD_PALETTE.light.accent),
    accentDark: new Color(WORLD_PALETTE.dark.accent),
  };
  private readonly decodes = new DecodeQueue(3);
  private visible = true;
  private holds = 0;
  private heldScroll = 0;
  /** Cards whose DOM went while a hold was active: drawn until the hold ends. */
  private readonly orphans = new Set<Entry>();
  private lastScroll = 0;
  private lastTime = -1;
  private time = 0;
  private lastScrollMove = -10;
  private head = 0;
  private headMeasured = false;
  private measureQueued = true;
  private pointerSlug: string | null = null;
  private pendingPointer: string | null = null;
  private focusSlug: string | null = null;
  private hovered: Entry | null = null;
  private pointer: { x: number; y: number; speed: number; t: number } | null = null;
  private pressed: Entry | null = null;
  private introPending = false;
  private filterHidden = false;
  private fontsReady = false;
  private readonly resizeObserver: ResizeObserver;
  private disposed = false;

  constructor(private readonly options: CardsLayerOptions) {
    this.resizeObserver = new ResizeObserver(() => this.queueMeasure());
    this.resizeObserver.observe(document.body);
    window.addEventListener("resize", this.queueMeasure);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp, { passive: true });
    window.addEventListener("pointercancel", this.onPointerUp, { passive: true });
    window.addEventListener("keydown", this.onKeyDown);
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    void document.fonts?.ready.then(() => this.queueMeasure());
    this.lastScroll = window.scrollY;
  }

  // ---------------------------------------------------------------- api

  register(card: WorldCard) {
    let entry = this.entries.get(card.slug);
    if (entry && entry.card.element !== card.element && !entry.detached) {
      // A second live card with the same slug (never in practice): the newest wins.
      this.release(entry);
      entry = undefined;
    }
    if (entry) {
      // The same card re-registering (its index moved, or React re-ran its
      // effect): keep its GPU state, just take the fresh DOM references.
      const coverChanged = entry.card.coverUrl !== card.coverUrl;
      entry.card = card;
      entry.detached = false;
      this.orphans.delete(entry);
      if (entry.mesh) entry.mesh.renderOrder = 10 + card.index;
      if (coverChanged && entry.awake) {
        this.sleep(entry);
      }
    } else {
      entry = {
        card,
        detached: false,
        slot: { left: 0, top: 0, width: 0, height: 0 },
        sheet: { left: 0, top: 0, width: 0, height: 0 },
        cover: { left: 0, top: 0, width: 0, height: 0 },
        meta: { left: 0, top: 0, width: 0, height: 0 },
        inset: { left: 0, top: 0, coverHeight: 0, metaTop: 0, metaHeight: 0 },
        layout: null,
        atlas: null,
        textSignature: "",
        textPending: false,
        awake: false,
        loadToken: 0,
        state: freshState(),
        tweens: new Set(),
      };
      const s = entry.state;
      if (this.introPending) {
        s.introOpacity = 0;
        s.introLift = -INTRO_DEPTH;
        s.introRise = INTRO_RISE;
      }
      if (this.filterHidden) {
        s.filterOpacity = 0;
        s.filterLift = FILTER_DEPTH;
      }
      this.entries.set(card.slug, entry);
      this.measureEntry(entry, window.scrollY, true);
    }
    this.queueMeasure();
    const registered = entry;
    const registeredCard = card;
    return () => {
      if (registered.card !== registeredCard || registered.detached) return;
      registered.detached = true;
    };
  }

  hold() {
    if (this.holds === 0) this.heldScroll = this.lastScroll;
    this.holds += 1;
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.holds -= 1;
      if (this.holds > 0) return;
      for (const entry of this.orphans) this.release(entry);
      this.orphans.clear();
    };
  }

  rectOf(slug: string) {
    const entry =
      this.entries.get(slug) ?? [...this.orphans].find((item) => item.card.slug === slug);
    if (!entry) return null;
    const scroll = this.holds > 0 ? this.heldScroll : this.lastScroll;
    return new DOMRect(
      entry.cover.left,
      entry.cover.top - scroll,
      entry.cover.width,
      entry.cover.height,
    );
  }

  setHovered(slug: string | null, source: "pointer" | "focus") {
    if (source === "focus") {
      this.focusSlug = slug;
    } else {
      this.pointerSlug = slug;
      this.pendingPointer = null;
      // A card sliding under a resting cursor while the list scrolls must
      // not light up: the hover waits for the scroll to settle.
      if (slug && this.isScrolling()) {
        this.pendingPointer = slug;
        this.pointerSlug = null;
      }
    }
    this.applyHover();
  }

  measure() {
    // Held cards keep the rects they had: their DOM may be gone or moving.
    if (this.holds > 0) return;
    this.measureQueued = false;
    const scrollY = window.scrollY;
    this.readHead();
    for (const entry of this.entries.values()) {
      if (entry.detached) continue;
      this.measureEntry(entry, scrollY, entry.awake || entry.inset.coverHeight === 0);
    }
  }

  async playFilterOut() {
    this.filterHidden = true;
    this.measureNow();
    const { onScreen, offScreen } = this.splitByScreen();
    for (const entry of offScreen) {
      this.killTweens(entry, "filter");
      entry.state.filterOpacity = 0;
      entry.state.filterLift = -FILTER_DEPTH;
    }
    let last = 0;
    onScreen.forEach((entry, index) => {
      const delay = index * FILTER_STAGGER;
      last = Math.max(last, delay + 0.3);
      this.tween(entry, "filter", {
        filterLift: -FILTER_DEPTH,
        duration: 0.5,
        delay,
        ease: "power2.out",
      });
      this.tween(entry, "filter-fade", {
        filterOpacity: 0,
        duration: 0.3,
        delay,
        ease: "power2.out",
      });
    });
    // A newer swap may take over meanwhile: the list checks its own token.
    await new Promise<void>((resolve) => {
      gsap.delayedCall(last, resolve);
    });
  }

  playFilterIn() {
    this.filterHidden = false;
    this.measureNow();
    const { onScreen, offScreen } = this.splitByScreen();
    for (const entry of offScreen) {
      this.killTweens(entry, "filter");
      this.killTweens(entry, "filter-fade");
      entry.state.filterOpacity = 1;
      entry.state.filterLift = 0;
    }
    onScreen.forEach((entry, index) => {
      const delay = index * FILTER_STAGGER;
      entry.state.filterLift = FILTER_DEPTH;
      entry.state.filterOpacity = 0;
      this.tween(entry, "filter", { filterLift: 0, duration: 0.5, delay, ease: "power2.out" });
      this.tween(entry, "filter-fade", {
        filterOpacity: 1,
        duration: 0.5,
        delay,
        ease: "power2.out",
      });
    });
  }

  prepareIntro() {
    this.introPending = true;
    for (const entry of this.entries.values()) {
      this.killTweens(entry, "intro");
      const s = entry.state;
      s.introOpacity = 0;
      s.introLift = -INTRO_DEPTH;
      s.introRise = INTRO_RISE;
    }
  }

  playIntro() {
    this.introPending = false;
    this.measureNow();
    const { onScreen, offScreen } = this.splitByScreen();
    for (const entry of offScreen) {
      this.killTweens(entry, "intro");
      const s = entry.state;
      s.introOpacity = 1;
      s.introLift = 0;
      s.introRise = 0;
    }
    // Row by row out of the fog, each row's right card a beat after its left.
    const rows: number[] = [];
    for (const entry of onScreen) {
      const top = Math.round(entry.sheet.top);
      if (!rows.some((row) => Math.abs(row - top) < 8)) rows.push(top);
    }
    rows.sort((a, b) => a - b);
    for (const entry of onScreen) {
      const row = rows.findIndex((top) => Math.abs(top - entry.sheet.top) < 8);
      const column = entry.sheet.left + entry.sheet.width / 2 > window.innerWidth / 2 ? 1 : 0;
      const delay = 0.1 + Math.max(0, row) * 0.13 + column * 0.07;
      const s = entry.state;
      s.introOpacity = 0;
      s.introLift = -INTRO_DEPTH;
      s.introRise = INTRO_RISE;
      this.tween(entry, "intro", {
        introLift: 0,
        introRise: 0,
        duration: 1.7,
        delay,
        ease: "expo.out",
      });
      this.tween(entry, "intro-fade", {
        introOpacity: 1,
        duration: 1.1,
        delay,
        ease: "power2.out",
      });
    }
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    for (const entry of this.entries.values()) {
      if (entry.mesh) entry.mesh.visible = visible;
    }
    for (const entry of this.orphans) {
      if (entry.mesh) entry.mesh.visible = visible;
    }
  }

  /** Awake cards (meshes) right now, for probes and budgets. */
  liveCount() {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.awake) count += 1;
    for (const entry of this.orphans) if (entry.awake) count += 1;
    return count;
  }

  /** Per frame, after the scroll step: wake, sleep and place every card. */
  update(liveScrollY: number) {
    if (this.disposed) return;
    const now = this.options.world.uTime.value;
    const dt = this.lastTime < 0 ? 1 / 60 : Math.min(0.05, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    this.time += dt;
    if (Math.abs(liveScrollY - this.lastScroll) > 0.25) this.lastScrollMove = this.time;
    this.lastScroll = liveScrollY;
    // While held (a transition carries the list away), the cards stay where
    // they were, whatever the page underneath does with its scroll.
    const scrollY = this.holds > 0 ? this.heldScroll : liveScrollY;

    // Cards whose DOM went (and didn't come straight back) are released.
    for (const entry of [...this.entries.values()]) {
      if (!entry.detached) continue;
      this.entries.delete(entry.card.slug);
      if (this.hovered === entry) this.hovered = null;
      if (this.holds > 0) this.orphans.add(entry);
      else this.release(entry);
    }
    if (this.measureQueued && this.holds === 0) this.measure();
    if (!this.headMeasured) this.readHead();
    if (this.pendingPointer && !this.isScrolling()) this.resolvePendingHover();

    const { width, height } = this.options.viewport();
    const zones = foldZones(width, height, this.head || height * 0.27);

    // Wake and sleep by distance to the screen, nearest first under the cap.
    let awake = 0;
    const candidates: { entry: Entry; distance: number }[] = [];
    for (const entry of this.entries.values()) {
      const top = entry.sheet.top - scrollY;
      const bottom = top + entry.sheet.height;
      const distance = top > height ? top - height : bottom < 0 ? -bottom : 0;
      const inWake = bottom > -WAKE_ABOVE * height && top < (1 + WAKE_BELOW) * height;
      const inKeep = bottom > -SLEEP_ABOVE * height && top < (1 + SLEEP_BELOW) * height;
      if (entry.awake && !inKeep) this.sleep(entry);
      else if (entry.awake || inWake) candidates.push({ entry, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const { entry } of candidates) {
      if (awake >= MAX_AWAKE) {
        if (entry.awake) this.sleep(entry);
        continue;
      }
      if (!entry.awake) this.wake(entry);
      awake += 1;
    }

    this.stepInteraction(dt, scrollY);
    for (const entry of this.orphans) this.place(entry, this.heldScroll, zones);
    for (const { entry } of candidates) if (entry.awake) this.place(entry, scrollY, zones);
  }

  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.queueMeasure);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    this.decodes.clear();
    for (const entry of this.entries.values()) this.release(entry);
    for (const entry of this.orphans) this.release(entry);
    this.entries.clear();
    this.orphans.clear();
    this.geometry.dispose();
  }

  // ---------------------------------------------------------------- measuring

  private readonly queueMeasure = () => {
    this.measureQueued = true;
    this.headMeasured = false;
  };

  private measureNow() {
    if (this.holds === 0) this.measure();
  }

  /** The fixed head's bottom, as the list's head publishes it (`--articles-head`). */
  private readHead() {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--articles-head");
    const head = Number.parseFloat(value);
    this.headMeasured = Number.isFinite(head);
    if (Number.isFinite(head)) this.head = head;
  }

  /**
   * Updates an entry's rects. `full` measures the pieces inside the card
   * (the sheet's insets and the text strip); otherwise only the slot is
   * read and the last insets are reused, so a sleeping card's subtree (which
   * content-visibility may skip) is never forced through layout.
   */
  private measureEntry(entry: Entry, scrollY: number, full: boolean) {
    const { card } = entry;
    const slotElement = card.slot ?? card.element;
    const slot = docRect(slotElement, scrollY);
    entry.slot = slot;
    if (full || entry.inset.coverHeight === 0) {
      const cover = docRect(card.cover, scrollY);
      const meta = docRect(card.meta, scrollY);
      entry.inset = {
        left: cover.left - slot.left,
        top: cover.top - slot.top,
        coverHeight: cover.height,
        metaTop: meta.top - cover.top,
        metaHeight: meta.height,
      };
    }
    const inset = entry.inset;
    const width = slot.width - inset.left * 2;
    entry.cover = {
      left: slot.left + inset.left,
      top: slot.top + inset.top,
      width,
      height: inset.coverHeight,
    };
    entry.meta = {
      left: entry.cover.left,
      top: entry.cover.top + inset.metaTop,
      width,
      height: inset.metaHeight,
    };
    entry.sheet = {
      left: entry.cover.left,
      top: entry.cover.top,
      width,
      height: inset.metaTop + inset.metaHeight,
    };
    if (full && entry.awake) this.redrawText(entry);
  }

  private splitByScreen() {
    const scrollY = window.scrollY;
    const height = window.innerHeight;
    const onScreen: Entry[] = [];
    const offScreen: Entry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.detached) continue;
      const top = entry.sheet.top - scrollY;
      if (top < height && top + entry.sheet.height > 0) onScreen.push(entry);
      else offScreen.push(entry);
    }
    onScreen.sort((a, b) => a.sheet.top - b.sheet.top || a.sheet.left - b.sheet.left);
    return { onScreen, offScreen };
  }

  // ---------------------------------------------------------------- gpu

  private material() {
    const { world } = this.options;
    const c = this.colors;
    return new ShaderMaterial({
      uniforms: {
        ...world,
        uCardRect: { value: new Vector4() },
        uCardFold: { value: new Vector4() },
        uCardPull: { value: 0 },
        uCardSwell: { value: SWELL },
        uCardLift: { value: 0 },
        uCardShift: { value: new Vector2() },
        uCardTilt: { value: new Vector2() },
        uCardPoint: { value: new Vector3() },
        uCardBurst: { value: new Vector4(0, 0, 9, 0) },
        uCardSquash: { value: 0 },
        uCardPad: { value: SHEET_PAD },
        uCardCover: { value: null as Texture | null },
        uCardHasCover: { value: 0 },
        uCardCoverUv: { value: new Vector4(0, 0, 1, 1) },
        uCardText: { value: null as Texture | null },
        uCardHasText: { value: 0 },
        uCardAtlas: { value: new Vector3(1, 1, 0) },
        uCardLayout: { value: new Vector3() },
        uCardTitle: { value: new Vector4() },
        uCardArrow: { value: new Vector4() },
        uCardRuleY: { value: 0 },
        uCardArrowAtlasX: { value: 0 },
        uCardInner: { value: 1 },
        uCardOpacity: { value: 1 },
        uCardReveal: { value: 0 },
        uCardTextReveal: { value: 0 },
        uCardHover: { value: 0 },
        uCardSweep: { value: 0 },
        uCardRule: { value: 0 },
        uCardRoll: { value: 0 },
        uCardArrowShift: { value: 0 },
        uCardPlaceholder: { value: 0 },
        uCardHead: { value: new Vector2() },
        uCardPaperLight: { value: c.paperLight },
        uCardPaperDark: { value: c.paperDark },
        uCardInkLight: { value: c.inkLight },
        uCardInkDark: { value: c.inkDark },
        uCardSoftLight: { value: c.softLight },
        uCardSoftDark: { value: c.softDark },
        uCardAccentLight: { value: c.accentLight },
        uCardAccentDark: { value: c.accentDark },
      },
      vertexShader: CARD_VERTEX,
      fragmentShader: CARD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      forceSinglePass: true,
    });
  }

  private wake(entry: Entry) {
    entry.awake = true;
    const material = this.material();
    const mesh = new Mesh(this.geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10 + entry.card.index;
    mesh.visible = this.visible;
    this.options.group.add(mesh);
    entry.mesh = mesh;
    entry.material = material;
    material.uniforms.uCardPlaceholder.value = entry.card.placeholder ? 1 : 0;
    this.measureEntry(entry, window.scrollY, true);
    this.queueCover(entry);
  }

  private sleep(entry: Entry) {
    if (!entry.awake) return;
    entry.awake = false;
    entry.loadToken += 1;
    entry.cancelDecode?.();
    entry.cancelDecode = undefined;
    if (entry.mesh) this.options.group.remove(entry.mesh);
    entry.material?.dispose();
    entry.coverTexture?.dispose();
    entry.textTexture?.dispose();
    entry.mesh = undefined;
    entry.material = undefined;
    entry.coverTexture = undefined;
    entry.textTexture = undefined;
    entry.textCanvas = undefined;
    entry.textSignature = "";
    entry.textPending = false;
    entry.state.reveal = 0;
    entry.state.textReveal = 0;
    this.killTweens(entry, "reveal");
    this.killTweens(entry, "text");
  }

  /** Lets an entry go for good: GPU resources and every tween on it. */
  private release(entry: Entry) {
    this.sleep(entry);
    for (const tween of entry.tweens) tween.kill();
    entry.tweens.clear();
    if (this.hovered === entry) this.hovered = null;
    if (this.pressed === entry) this.pressed = null;
    if (this.pointerSlug === entry.card.slug) this.pointerSlug = null;
    if (this.focusSlug === entry.card.slug) this.focusSlug = null;
  }

  private queueCover(entry: Entry) {
    const url = entry.card.coverUrl;
    if (!url || entry.card.placeholder) return;
    const token = entry.loadToken;
    entry.cancelDecode = this.decodes.add(
      () => this.loadCover(entry, url, token),
      () => {
        const top = entry.sheet.top - this.lastScroll;
        const height = window.innerHeight;
        return top > height ? top - height : top + entry.sheet.height < 0 ? -top : -1;
      },
    );
  }

  private async loadCover(entry: Entry, url: string, token: number) {
    const material = entry.material;
    if (!material || token !== entry.loadToken) return;
    const { renderer } = this.options;
    const loaded = await loadCover(
      url,
      entry.cover.width,
      entry.cover.height,
      this.options.pixelRatio(),
      renderer.capabilities.maxTextureSize,
    );
    if (!loaded || token !== entry.loadToken || !entry.awake || this.disposed) {
      loaded?.bitmap.close();
      return;
    }
    const texture = new Texture(loaded.bitmap);
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    entry.coverTexture = texture;
    material.uniforms.uCardCover.value = texture;
    material.uniforms.uCardHasCover.value = 1;
    const [ox, oy, sx, sy] = coverUv(
      loaded.width,
      loaded.height,
      entry.cover.width,
      entry.cover.height,
    );
    (material.uniforms.uCardCoverUv.value as Vector4).set(ox, oy, sx, sy);
    // Upload now rather than on the frame it first draws (no hitch mid-scroll).
    renderer.initTexture(texture);
    this.tween(entry, "reveal", { reveal: 1, duration: 0.65, ease: "power2.out" });
  }

  /** Text pixels per CSS px: supersampled (and mipmapped), so it stays crisp as the sheet sways. */
  private textPixelRatio() {
    return Math.min(2.6, Math.max(1.5, this.options.pixelRatio() * 1.5));
  }

  private redrawText(entry: Entry) {
    const material = entry.material;
    if (!material) return;
    const { card } = entry;
    const layout = measureTextStrip(
      card.meta,
      card.titleElement,
      card.subtitleElement,
      card.arrowElement,
    );
    entry.layout = layout;
    const u = material.uniforms;
    (u.uCardLayout.value as Vector3).set(
      entry.inset.coverHeight,
      entry.inset.metaTop,
      entry.inset.metaHeight,
    );
    (u.uCardTitle.value as Vector4).set(
      layout.title.left,
      layout.title.top,
      layout.title.width,
      layout.title.height,
    );
    (u.uCardArrow.value as Vector4).set(
      layout.arrow.left,
      layout.arrow.top,
      layout.arrow.width,
      layout.arrow.height,
    );
    u.uCardRuleY.value = layout.ruleY;
    if (card.placeholder) {
      u.uCardHasText.value = 1;
      this.tween(entry, "text", { textReveal: 1, duration: 0.4, ease: "power2.out" });
      return;
    }

    // Glyphs are drawn only once their faces are loaded, never in a fallback.
    if (!this.fontsReady) {
      if (entry.textPending) return;
      entry.textPending = true;
      void whenStripFontsReady(layout).then(() => {
        this.fontsReady = true;
        entry.textPending = false;
        if (entry.awake && !this.disposed) this.redrawText(entry);
      });
      return;
    }

    const pixelRatio = this.textPixelRatio();
    const text = { title: card.title, subtitle: card.subtitle };
    const signature = textStripSignature(layout, text, pixelRatio);
    if (signature === entry.textSignature && entry.textTexture) return;
    entry.textSignature = signature;
    entry.textCanvas ??= document.createElement("canvas");
    const atlas = drawTextAtlas(entry.textCanvas, layout, text, pixelRatio);
    entry.atlas = atlas;
    (u.uCardAtlas.value as Vector3).set(atlas.width, atlas.height, atlas.titleRowY);
    u.uCardArrowAtlasX.value = atlas.arrowX;
    const { renderer } = this.options;
    if (entry.textTexture && entry.textTexture.image === entry.textCanvas) {
      // Same canvas, new size: three needs a fresh texture for a resized source.
      entry.textTexture.dispose();
      entry.textTexture = undefined;
    }
    const texture = new CanvasTexture(entry.textCanvas);
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.premultiplyAlpha = false;
    texture.needsUpdate = true;
    entry.textTexture = texture;
    u.uCardText.value = texture;
    u.uCardHasText.value = 1;
    renderer.initTexture(texture);
    if (entry.state.textReveal < 1) {
      this.tween(entry, "text", { textReveal: 1, duration: 0.35, ease: "power2.out" });
    }
  }

  // ---------------------------------------------------------------- motion

  private tween(entry: Entry, key: string, vars: gsap.TweenVars) {
    this.killTweens(entry, key);
    const tween = gsap.to(entry.state, {
      ...vars,
      onComplete: () => {
        entry.tweens.delete(tween);
      },
    });
    (tween as gsap.core.Tween & { __key?: string }).__key = key;
    entry.tweens.add(tween);
    return tween;
  }

  private killTweens(entry: Entry, key: string) {
    for (const tween of entry.tweens) {
      if ((tween as gsap.core.Tween & { __key?: string }).__key === key) {
        tween.kill();
        entry.tweens.delete(tween);
      }
    }
  }

  private isScrolling() {
    return this.time - this.lastScrollMove < SCROLL_SETTLE;
  }

  private resolvePendingHover() {
    const slug = this.pendingPointer;
    this.pendingPointer = null;
    const entry = slug ? this.entries.get(slug) : undefined;
    if (!entry || !entry.card.element.matches(":hover")) return;
    this.pointerSlug = slug;
    this.applyHover();
  }

  private applyHover() {
    const slug = this.pointerSlug ?? this.focusSlug;
    const next = slug ? (this.entries.get(slug) ?? null) : null;
    const byPointer = Boolean(this.pointerSlug && next?.card.slug === this.pointerSlug);
    if (next === this.hovered) {
      if (next) next.state.lean = byPointer ? 1 : 0;
      return;
    }
    const previous = this.hovered;
    this.hovered = next;
    if (previous) this.animateHover(previous, false);
    if (next) {
      next.state.lean = byPointer ? 1 : 0;
      this.animateHover(next, true);
    }
  }

  private animateHover(entry: Entry, on: boolean) {
    const s = entry.state;
    if (on) {
      this.tween(entry, "zoom", { inner: HOVER_ZOOM, duration: 0.3, ease: "power2.out" });
      this.tween(entry, "hover", { hover: 1, duration: 0.45, ease: "power2.out" });
      this.tween(entry, "lift", { hoverLift: HOVER_LIFT, duration: 0.7, ease: "power3.out" });
      s.sweep = 0;
      this.tween(entry, "sweep", { sweep: 1, duration: 1.1, ease: "power2.inOut" });
      this.tween(entry, "rule", { rule: 1, duration: 0.65, ease: "power3.out" });
      this.tween(entry, "roll", { roll: 1, duration: 0.55, ease: "power3.inOut" });
      this.tween(entry, "arrow", { arrow: 1, duration: 0.5, ease: "power3.inOut" });
    } else {
      s.lean = 0;
      this.tween(entry, "zoom", { inner: 1, duration: 0.3, ease: "power2.out" });
      this.tween(entry, "hover", { hover: 0, duration: 0.45, ease: "power2.out" });
      this.tween(entry, "lift", { hoverLift: 0, duration: 0.6, ease: "power2.out" });
      this.tween(entry, "rule", { rule: 0, duration: 0.45, ease: "power2.inOut" });
      this.tween(entry, "roll", { roll: 0, duration: 0.45, ease: "power3.inOut" });
      this.tween(entry, "arrow", { arrow: 0, duration: 0.45, ease: "power3.inOut" });
    }
  }

  private stepInteraction(dt: number, scrollY: number) {
    const hovered = this.hovered;
    const pointer = this.pointer;
    for (const entry of this.entries.values()) {
      const s = entry.state;
      if (s.burstAmp > 0) {
        s.burstAge += dt;
        if (s.burstAge > 2.4) s.burstAmp = 0;
      }
      let tiltX = 0;
      let tiltY = 0;
      let amp = 0;
      if (entry === hovered && s.lean > 0 && pointer) {
        const localX = pointer.x - entry.sheet.left;
        const localY = pointer.y - (entry.sheet.top - scrollY);
        const nx = Math.max(-1, Math.min(1, (localX / entry.sheet.width) * 2 - 1));
        const ny = Math.max(-1, Math.min(1, (localY / entry.sheet.height) * 2 - 1));
        tiltX = ny * LEAN_X;
        tiltY = nx * LEAN_Y;
        const k = ease(0.3, dt);
        s.pointX += (localX - s.pointX) * k;
        s.pointY += (localY - s.pointY) * k;
        amp = RIPPLE_REST + Math.min(1, pointer.speed / 1400) * (RIPPLE_MOVING - RIPPLE_REST);
      }
      const k = ease(0.08, dt);
      s.tiltX += (tiltX - s.tiltX) * k;
      s.tiltY += (tiltY - s.tiltY) * k;
      s.pointAmp += (amp - s.pointAmp) * ease(amp > s.pointAmp ? 0.12 : 0.05, dt);
    }
    if (pointer) pointer.speed *= 1 - ease(0.08, dt);
  }

  private place(entry: Entry, scrollY: number, zones: FoldZones) {
    const { material } = entry;
    if (!material) return;
    const { height } = this.options.viewport();
    const s = entry.state;
    const u = material.uniforms;
    const sheet = entry.sheet;
    (u.uCardRect.value as Vector4).set(sheet.left, sheet.top - scrollY, sheet.width, sheet.height);
    (u.uCardFold.value as Vector4).set(zones.push[0], zones.push[1], zones.pull[0], zones.pull[1]);
    const head = this.head || height * 0.27;
    (u.uCardHead.value as Vector2).set(head, height * HEAD_FADE);
    u.uCardPull.value = entry.inset.coverHeight;
    u.uCardLift.value = s.hoverLift + s.filterLift + s.introLift;
    (u.uCardShift.value as Vector2).set(0, s.introRise);
    (u.uCardTilt.value as Vector2).set(s.tiltX, s.tiltY);
    (u.uCardPoint.value as Vector3).set(s.pointX, s.pointY, s.pointAmp);
    (u.uCardBurst.value as Vector4).set(s.burstX, s.burstY, s.burstAge, s.burstAmp);
    u.uCardSquash.value = s.squash;
    u.uCardOpacity.value = s.filterOpacity * s.introOpacity;
    u.uCardInner.value = s.inner;
    u.uCardReveal.value = s.reveal;
    u.uCardTextReveal.value = s.textReveal;
    u.uCardHover.value = s.hover;
    u.uCardSweep.value = s.sweep;
    u.uCardRule.value = s.rule;
    u.uCardRoll.value = s.roll;
    u.uCardArrowShift.value = s.arrow;
  }

  // ---------------------------------------------------------------- input

  private entryAt(target: EventTarget | null) {
    const element = target instanceof Element ? target.closest("[data-article-card]") : null;
    const slug = element?.getAttribute("data-article-slug");
    const entry = slug ? this.entries.get(slug) : undefined;
    return entry && entry.card.element === element ? entry : undefined;
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      this.pointer = null;
      return;
    }
    const now = performance.now();
    const previous = this.pointer;
    let speed = previous?.speed ?? 0;
    if (previous) {
      const elapsed = Math.max(1, now - previous.t) / 1000;
      const moved = Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
      speed += (moved / elapsed - speed) * 0.35;
    }
    this.pointer = { x: event.clientX, y: event.clientY, speed, t: now };
  };

  private readonly onPointerLeave = () => {
    this.pointer = null;
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const entry = this.entryAt(event.target);
    if (!entry) return;
    this.press(entry, event.clientX, event.clientY);
  };

  private readonly onPointerUp = () => {
    const entry = this.pressed;
    this.pressed = null;
    if (!entry) return;
    this.tween(entry, "squash", { squash: 0, duration: 0.7, ease: "elastic.out(1, 0.45)" });
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.repeat) return;
    const entry = this.entryAt(event.target);
    if (!entry) return;
    const rect = entry.card.element.getBoundingClientRect();
    this.press(entry, rect.left + rect.width / 2, rect.top + entry.inset.coverHeight / 2);
    window.setTimeout(this.onPointerUp, 140);
  };

  private press(entry: Entry, x: number, y: number) {
    const s = entry.state;
    const scrollY = this.holds > 0 ? this.heldScroll : window.scrollY;
    s.burstX = x - entry.sheet.left;
    s.burstY = y - (entry.sheet.top - scrollY);
    s.burstAge = 0;
    s.burstAmp = BURST;
    this.pressed = entry;
    this.tween(entry, "squash", { squash: 1, duration: 0.14, ease: "power2.out" });
  }
}
