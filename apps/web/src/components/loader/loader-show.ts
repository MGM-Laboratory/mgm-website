import type { LoaderSnapshot } from "@/components/loader/loader-core";
import {
  BOX,
  CRAFTS,
  DRAW,
  PANELS,
  barText,
  starPoints,
  type NetPanel,
  type PanelId,
} from "@/components/loader/loader-net";
import { LoaderToys } from "@/components/loader/loader-toys";
import { LOADER_COPY } from "@/data/story";
import { random } from "@/lib/random";

/**
 * The deal, once the bundle runs (loader-view.tsx renders the markup and
 * the first frame's drawing). Framework free: it reads the core's snapshot
 * (`update`) and plays everything with Web Animations on transform and
 * opacity, so the motion stays on the compositor while the page hydrates
 * and the story builds behind it. Only the final reveal (a clip-path on
 * the loader) runs on the main thread.
 *
 * The beats always come in the same order, compressed rather than
 * overlapped when the bytes arrive fast:
 *
 * 1. The drawing (CSS, from the first paint). When the cards are ready
 *    before it, it plays faster.
 * 2. The deal: progress is counted in cards (52 is 100%, the counter never
 *    shows more than the core's real progress). Cards leave the front panel
 *    once its outline is drawn and land on a pressure fan around the
 *    counter; a backlog goes out as one quick spring.
 * 3. Every 13 landed cards one quarter of the net prints.
 * 4. The status line changes every 2.5 s of visible time; when no card is
 *    earned for 1.6 s the last one wobbles and the line says so.
 * 5. Leaving: every card lands and prints, 52 / 52 holds a moment, the fan
 *    squares into a deck, the net lifts and glides to the centre as it
 *    folds (walls one by one, the bottom, then the top), turns to show a
 *    side and the lid, the deck drops in, and the lid shuts. The box hops
 *    twice (after a long wait two eyes peek out first, and the lid's slam on
 *    them is the first hop), and the page opens through a star that pops
 *    out of the box's emblem.
 *
 * A reload in the same tab starts on the shut box and only hops once and
 * opens (when it has to wait for the story it says hello and hops with
 * each line); under reduced motion it goes at once.
 */

const CARDS = 52;
const FAN_SPAN = 150;
const FLIGHT_MS = 400;
/** A batch of cards is spread over at most this long (the spring), each at least `MIN_SPACING` apart. */
const BATCH_MS = 440;
/** The spring at the leave (the last cards all at once) is quicker, its cards closer together. */
const LEAVE_BATCH_MS = 240;
const LEAVE_SPACING = 36;
const MIN_SPACING = 9;
const MAX_SPACING = 70;
const STALL_MS = 1600;
/** How often the dealt cards riffle while a stall lasts. */
const RIPPLE_MS = 3000;
const STATUS_MS = 2500;
/** A line that must give way early (a stall, its end) still stays this long, so it can be read. */
const MIN_LINE_MS = 1400;
const QUARTER = 13;
const PRINT_MS = 520;
/** A print when the cards came fast or the loader is leaving, and the stagger between its panels. */
const PRINT_QUICK_MS = 380;
/** How much faster the first frame's drawing plays when the cards are ready before it. */
const DRAW_RUSH = 3;
/** The longest the outro waits for the drawing, the last cards and their prints before it folds. */
const SETTLE_MAX_MS = 1800;
/** How long 52 / 52 is on screen at least before the fold. */
const HOLD_MS = 220;
/** While leaving, a quarter starts to print as its last cards are this close to landing. */
const PRINT_LEAD = 200;
/** The counter's roll for one card. */
const ROLL_MS = 240;
/** How long before its end a print's wipe looks finished (the fold's lift covers the rest). */
const PRINT_TAIL = 240;
/** A reload that waits longer than this for the story says hello. */
const TALK_MS = 900;
/** How far the lid closes while someone inside peeks out (90 is shut), and its tuck flap's angle then. */
const PEEK_LID = 60;
const PEEK_TUCK = 24;
/** Half the box's height (artwork units): a tap squashes about the box's base, not its centre. */
const HALF_H = BOX.H / 2;

type Mode = "first" | "fast" | "still";

type Probe = {
  pivotX: number;
  pivotY: number;
  cardW: number;
  cardH: number;
  fanR: number;
  /** The front panel's centre, relative to the pivot. */
  fromX: number;
  fromY: number;
};

type Card = {
  el: HTMLElement;
  lift: HTMLElement;
  index: number;
  /** When it leaves the box and when it lands (it may be sent again before it leaves). */
  launchAt: number;
  landsAt: number;
  /** Its flight and the counter's rolls for it, until it lands. */
  flight: Animation | null;
  rolls: Animation[];
};

/** The finished box's place on screen (the front panel's centre moved to the screen's, the 3/4 turn). */
type Pose = Readonly<{ dx: number; dy: number; scale: number }>;

/** Where things stand once the box has its pose, in screen pixels. */
type Stand = Readonly<{ deck: DOMRect; foot: DOMRect; front: DOMRect }>;

/** One tap of the box: [ms, lift in px, squash across, squash up, easing to the next]. */
type TapKey = readonly [number, number, number, number, string];

const EASE = "cubic-bezier(0.35, 0, 0, 1)";
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.55, 0, 0.9, 0.4)";
const EASE_BACK = "cubic-bezier(0.34, 1.5, 0.64, 1)";
const RISE = "cubic-bezier(0.2, 0.6, 0.35, 1)";
const FALL = "cubic-bezier(0.55, 0, 0.85, 0.35)";

/**
 * The outro's clock (ms from the fold's start, scaled down when the loader
 * gave up waiting). Each step starts when the one it needs has ended: the
 * walls make a tube before the box turns, and the box has turned before the
 * deck drops in and the top closes.
 */
const FOLD = {
  /** The squared fan becomes one deck. */
  square: 280,
  lift: 150,
  walls: 130,
  wallStep: 110,
  wall: 320,
  glue: 280,
  dustBottom: 500,
  bottom: 560,
  bottomTuck: 670,
  flap: 290,
  /** The tube has formed (its last wall is settling): the box turns. */
  turn: 600,
  turnFor: 420,
  /** The deck leaves the hub and lands in the open top as the turn ends. */
  deck: 520,
  flight: 500,
  slide: 160,
  /** The top closes once the deck is most of the way in. */
  top: 1130,
  lid: 1170,
  lidFor: 400,
} as const;

/** Tap tap: an anticipation dip, a hop with a stretch, a squash on landing, and a smaller second hop. */
const TAP_TAP_KEYS: readonly TapKey[] = [
  [0, 0, 1, 1, RISE],
  [60, 0, 1.03, 0.95, RISE],
  [180, -22, 0.97, 1.05, FALL],
  [270, 0, 1, 1, "ease-out"],
  [310, 0, 1.045, 0.93, "ease-in-out"],
  [380, 0, 1, 1, RISE],
  [470, -13, 0.985, 1.03, FALL],
  [550, 0, 1, 1, "ease-out"],
  [590, 0, 1.03, 0.955, "ease-in-out"],
  [660, 0, 1, 1, "linear"],
];
/** One hop of the box and when, in ms from its start, the star pops and the page starts to open. */
type Tap = Readonly<{ keys: readonly TapKey[]; pop: number; open: number; iris: number }>;

/** The star pops out on the second landing, and the page starts to open as its spin settles. */
const TAP_TAP: Tap = { keys: TAP_TAP_KEYS, pop: 550, open: 700, iris: 540 };

/** After the peek the lid's slam is the first tap: one hop, the star on its landing. */
const SLAM_TAP: Tap = {
  keys: [
    [0, 0, 1, 1, RISE],
    [110, -18, 0.975, 1.045, FALL],
    [200, 0, 1, 1, "ease-out"],
    [240, 0, 1.04, 0.94, "ease-in-out"],
    [310, 0, 1, 1, "linear"],
  ],
  pop: 200,
  open: 360,
  iris: 540,
};

/** A reload's shut box, saying a new line while it waits: a small hop. */
const NUDGE: readonly TapKey[] = [
  [0, 0, 1, 1, RISE],
  [90, -8, 0.985, 1.025, FALL],
  [170, 0, 1, 1, "ease-out"],
  [200, 0, 1.025, 0.965, "ease-in-out"],
  [270, 0, 1, 1, "linear"],
];

/** The fast path: one hop, the star already on its way. */
const ONE_TAP: Tap = {
  keys: [
    [0, 0, 1, 1, RISE],
    [100, -16, 0.975, 1.04, FALL],
    [180, 0, 1, 1, "ease-out"],
    [215, 0, 1.035, 0.95, "ease-in-out"],
    [280, 0, 1, 1, "linear"],
  ],
  pop: 80,
  open: 210,
  iris: 360,
};

function now() {
  return performance.now();
}

/** A performance mark for each step of the outro (`ld:*` in the performance timeline). */
function mark(name: string) {
  try {
    performance.mark(`ld:${name}`);
  } catch {
    // Marks are a nicety for timing checks.
  }
}

function shuffled<T>(items: readonly T[]): T[] {
  return items
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

/** A shuffled bag: every line once before any comes back, never the same twice in a row. */
class LineBag {
  private bag: string[] = [];
  private last = "";

  constructor(private readonly lines: readonly string[]) {}

  next(avoid: string) {
    for (let tries = 0; tries < 3; tries += 1) {
      if (this.bag.length === 0) this.bag = shuffled(this.lines);
      const line = this.bag.pop() ?? this.lines.at(0) ?? "";
      if (line !== avoid && line !== this.last) {
        this.last = line;
        return line;
      }
    }
    return this.bag.pop() ?? this.lines.at(0) ?? avoid;
  }
}

function slotAngle(index: number) {
  return -FAN_SPAN / 2 + (FAN_SPAN * index) / (CARDS - 1);
}

function px(n: number) {
  return `${Math.round(n * 100) / 100}px`;
}

function r3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function cardTransform(x: number, y: number, angle: number, r: number, scale: number) {
  return `translate(${px(x)}, ${px(y)}) rotate(${Math.round(angle * 100) / 100}deg) translateY(${px(-r)}) scale(${r3(scale)})`;
}

/** The pose as one function list, so every step of the outro interpolates function by function. */
function poseTransform(dx: number, dy: number, rx: number, ry: number, scale: number) {
  return `translate(${px(dx)}, ${px(dy)}) rotateX(${rx}deg) rotateY(${ry}deg) scale(${r3(scale)})`;
}

/**
 * A panel's fold about its hinge. With `spring` it swings a little past
 * shut and settles back, like real board (90, then 96, then 88, then 90).
 */
function foldFrames(panel: NetPanel, spring: boolean, overshoot = 0.07): Keyframe[] {
  // Every hinge is one `rotateX(...deg)` or `rotateY(...deg)` (loader-net.ts).
  const axis = panel.fold.slice(0, 8);
  const angle = Number.parseFloat(panel.fold.slice(8));
  if ((axis !== "rotateX(" && axis !== "rotateY(") || !Number.isFinite(angle)) {
    return [{ transform: "none" }, { transform: panel.fold }];
  }
  const at = (f: number) => ({
    transform: `${axis}${Math.round(angle * f * 100) / 100}deg)`,
  });
  if (!spring) return [{ ...at(0), easing: EASE_OUT }, at(1)];
  return [
    { ...at(0), easing: "cubic-bezier(0.3, 0, 0.25, 1)" },
    { ...at(1 + overshoot), offset: 0.62, easing: "ease-in-out" },
    { ...at(1 - overshoot * 0.36), offset: 0.84, easing: "ease-in-out" },
    at(1),
  ];
}

function keyframeEffect(anim: Animation | null) {
  return anim?.effect instanceof KeyframeEffect ? anim.effect : null;
}

export class LoaderShow {
  private readonly mode: Mode;
  private readonly host: HTMLElement;
  private readonly q: <T extends HTMLElement = HTMLElement>(name: string) => T | null;
  private readonly panels = new Map<PanelId, HTMLElement>();
  private readonly cards: Card[] = [];
  private readonly anims = new Set<Animation>();
  private readonly timers = new Set<number>();
  private readonly toys: LoaderToys | null;
  private probe: Probe | null = null;
  private resize: ResizeObserver | null = null;
  private snapshot: LoaderSnapshot | null = null;
  /** When the first frame's drawing is done, and when the front panel's outline is (cards wait for it). */
  private drawDoneAt = 0;
  private frontAt = 0;
  private rushed = false;
  private dealTimer = 0;
  /** Cards the progress has earned, and when that last went up (the stall clock). */
  private earned = 0;
  private earnedAt = 0;
  private dealt = 0;
  private nextSlot = 0;
  private lastLaunchAt = 0;
  private printed = 0;
  private printEndsAt = 0;
  /** When each quarter's ink covers its panels (the board's grey inside must not show before). */
  private readonly inkEnds = new Map<number, number>();
  private printWaiting = false;
  private stalled = false;
  private lastRipple = 0;
  private craft = -1;
  private wobble: Animation | null = null;
  /** Lines shown so far, and the visible time the current one went up. */
  private statusIndex = 0;
  private lineElapsed = 0;
  /** A new line is due (a stall began or ended) as soon as the current one has been read. */
  private wantLine = false;
  private statusLine: string = LOADER_COPY.statuses[0];
  private readonly bags = {
    statuses: new LineBag(LOADER_COPY.statuses),
    story: new LineBag(LOADER_COPY.story),
    build: new LineBag(LOADER_COPY.build),
    stalled: new LineBag(LOADER_COPY.stalled),
    again: new LineBag(LOADER_COPY.again),
  };
  private override: { line: string; until: number } | null = null;
  private talking = false;
  /** The shut box's little hop when a reload's line changes (cancelled before the real tap). */
  private nudge: Animation | null = null;
  private leaving = false;
  private disposed = false;
  /** The outro's moving parts, kept so a resize can re-aim them. */
  private outro: {
    pose: Pose;
    poseAnim: Animation | null;
    flight: Animation | null;
    /** The outro clock's scale (1, quicker when everything came fast, 0.72 when the loader gave up). */
    k: number;
  } | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly hooks: Readonly<{ exited: () => void; revealing: () => void }>,
  ) {
    this.host = root.closest<HTMLElement>("[data-site-loader]") ?? root;
    this.q = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-ld="${name}"]`);
    const reduced = !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const fast = document.documentElement.hasAttribute("data-loader-fast");
    this.mode = reduced ? "still" : fast ? "fast" : "first";
    root.dataset.mode = this.mode;
    for (const el of root.querySelectorAll<HTMLElement>("[data-panel]")) {
      this.panels.set(el.dataset.panel as PanelId, el);
    }
    // The first frame's drawing is CSS: read where its clock started.
    const pen = this.q("pen");
    const penAnim = pen?.getAnimations()[0];
    const started = typeof penAnim?.startTime === "number" ? penAnim.startTime : null;
    const timelineNow =
      typeof document.timeline.currentTime === "number" ? document.timeline.currentTime : now();
    // Document timeline time and performance.now() share an origin.
    const origin = started ?? timelineNow;
    this.drawDoneAt = this.mode === "first" ? origin + DRAW.done * 1000 : 0;
    this.frontAt = this.mode === "first" ? origin + DRAW.front * 1000 : 0;
    this.toys =
      this.mode === "still"
        ? null
        : new LoaderToys(root, {
            pickCard: (el) => {
              this.pick(el);
            },
          });
    if (this.mode === "first") {
      this.measure();
      this.resize = new ResizeObserver(() => {
        if (this.outro) this.reaim();
        else if (!this.leaving) this.measure();
      });
      this.resize.observe(root);
    } else if (this.mode === "fast") {
      // The shut box stands on its shadow from the first frames.
      this.placeFloor(this.standNow());
      this.animate(this.q("floor"), [{ opacity: 0 }, { opacity: 1 }], {
        duration: 220,
        easing: "ease-out",
      });
      this.resize = new ResizeObserver(() => {
        if (!this.leaving) this.placeFloor(this.standNow());
      });
      this.resize.observe(root);
    }
  }

  /** The core's snapshot changed (at least every 100 ms of visible time while it shows). */
  update(state: LoaderSnapshot) {
    if (this.gone()) return;
    this.snapshot = state;
    if (this.mode === "still") {
      this.updateStill(state);
      return;
    }
    if (state.phase === "leaving") {
      if (!this.leaving) {
        this.leaving = true;
        void this.leave(state);
      }
      return;
    }
    if (state.phase !== "loading") return;
    if (this.mode === "fast") {
      this.updateFast(state);
      return;
    }
    const t = now();
    if (this.earnedAt === 0) this.earnedAt = t;
    const target = Math.min(CARDS, Math.floor(state.progress * CARDS + 1e-6));
    if (target > this.earned) {
      this.earned = target;
      this.earnedAt = t;
    }
    // Cards ready before the drawing: the drawing hurries.
    if (this.earned >= QUARTER && t < this.frontAt) this.rush();
    this.dealEarned();
    this.checkStall();
    this.checkStatus(state);
  }

  /** Disposed while an outro step was waiting (a method, so no check is narrowed away). */
  private gone() {
    return this.disposed;
  }

  dispose() {
    this.disposed = true;
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    window.clearTimeout(this.dealTimer);
    for (const anim of this.anims) anim.cancel();
    this.anims.clear();
    this.resize?.disconnect();
    this.toys?.dispose();
    for (const card of this.cards) card.el.remove();
    this.cards.length = 0;
    this.host.style.removeProperty("clip-path");
    delete this.host.dataset.revealing;
  }

  // Building blocks -------------------------------------------------------

  private animate(
    el: Element | null | undefined,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ): Animation | null {
    if (!el || this.disposed) return null;
    const anim = el.animate(keyframes, { fill: "forwards", ...options });
    this.anims.add(anim);
    // Ones that leave nothing behind need no cancelling later.
    if (options.fill === "none") {
      const drop = () => {
        this.anims.delete(anim);
      };
      void anim.finished.then(drop).catch(drop);
    }
    return anim;
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const id = window.setTimeout(
        () => {
          this.timers.delete(id);
          resolve();
        },
        Math.max(0, ms),
      );
      this.timers.add(id);
    });
  }

  private measure() {
    const hub = this.q("hub");
    const front = this.panels.get("front")?.querySelector<HTMLElement>(".ld-out");
    if (!hub || !front) return;
    const probe = document.createElement("div");
    probe.className = "ld-card";
    probe.style.visibility = "hidden";
    const radius = document.createElement("div");
    radius.style.cssText = "position:absolute;width:var(--ld-fan-r);height:0;visibility:hidden";
    hub.append(probe, radius);
    const pivot = hub.getBoundingClientRect();
    const [fx, fy] = this.frontCentre();
    this.probe = {
      pivotX: pivot.left,
      pivotY: pivot.top,
      cardW: probe.offsetWidth,
      cardH: probe.offsetHeight,
      fanR: radius.offsetWidth,
      fromX: fx - pivot.left,
      fromY: fy - pivot.top,
    };
    probe.remove();
    radius.remove();
    // Cards already in the fan follow a new size.
    for (const card of this.cards) {
      if (card.landsAt <= now()) card.el.style.transform = this.slot(card.index);
    }
  }

  /**
   * The flat front panel's centre on screen, from layout offsets: the sheet's
   * lean and any running animation do not move it.
   */
  private frontCentre(): [number, number] {
    const box = this.root.getBoundingClientRect();
    const sheet = this.q("sheet");
    const front = this.panels.get("front");
    if (!sheet || !front) return [box.left + box.width / 2, box.top + box.height / 2];
    return [
      box.left + sheet.offsetLeft + front.offsetLeft + front.offsetWidth / 2,
      box.top + sheet.offsetTop + front.offsetTop + front.offsetHeight / 2,
    ];
  }

  private slot(index: number) {
    const r = (this.probe?.fanR ?? 70) + index * 0.12;
    return cardTransform(0, 0, slotAngle(index), r, 1);
  }

  // The drawing -----------------------------------------------------------

  /**
   * The cards are ready before the drawing: its remaining CSS animations
   * (the finite ones: the glint, the breathing and the drifting keep their
   * pace) play faster, so it is still drawn before anything is dealt.
   */
  private rush() {
    if (this.rushed || this.mode !== "first") return;
    this.rushed = true;
    const t = now();
    for (const anim of this.root.getAnimations({ subtree: true })) {
      if (this.anims.has(anim) || anim.playState === "finished") continue;
      const timing = anim.effect?.getComputedTiming();
      if (!timing || timing.iterations === Infinity) continue;
      anim.updatePlaybackRate(DRAW_RUSH);
    }
    this.drawDoneAt = t + Math.max(0, this.drawDoneAt - t) / DRAW_RUSH;
    this.frontAt = t + Math.max(0, this.frontAt - t) / DRAW_RUSH;
  }

  // The deal ------------------------------------------------------------

  /** Deals what the progress has earned once the front panel is drawn (a timer covers the wait). */
  private dealEarned() {
    if (this.earned <= this.dealt) return;
    const wait = this.frontAt - now();
    if (wait <= 0) {
      this.deal(this.earned);
      return;
    }
    if (this.dealTimer !== 0) return;
    this.dealTimer = window.setTimeout(() => {
      this.dealTimer = 0;
      if (!this.gone()) this.dealEarned();
    }, wait);
  }

  /**
   * Deals up to `target` cards. Cards still waiting to leave go out again
   * with the new ones as one batch, spread over at most `BATCH_MS` (a
   * backlog is one quick spring), so the counter never falls behind the
   * progress however fast it comes.
   */
  private deal(target: number) {
    const fan = this.q("fan");
    const probe = this.probe;
    if (!fan || !probe) return;
    const fresh = target - this.dealt;
    if (fresh <= 0) return;
    const t = now();
    const waiting = this.cards.filter((card) => card.launchAt > t + 4);
    const total = waiting.length + fresh;
    const batch = this.leaving ? LEAVE_BATCH_MS : BATCH_MS;
    const spacing = Math.min(
      this.leaving ? LEAVE_SPACING : MAX_SPACING,
      Math.max(MIN_SPACING, batch / total),
    );
    const flight = total >= 12 || this.leaving ? FLIGHT_MS - 80 : FLIGHT_MS;
    let slot = waiting.length > 0 ? t : Math.max(t, this.nextSlot);
    for (const card of waiting) {
      this.fly(card, probe, slot, flight);
      slot += spacing;
    }
    for (let n = this.dealt; n < target; n += 1) {
      this.fly(this.makeCard(fan, n), probe, slot, flight);
      slot += spacing;
    }
    this.nextSlot = slot;
    this.lastLaunchAt = slot - spacing;
    this.dealt = target;
    if (this.stalled) this.endStall(true);
  }

  private makeCard(fan: HTMLElement, index: number): Card {
    const el = document.createElement("div");
    el.className = "ld-card";
    el.dataset.card = String(index);
    const lift = document.createElement("div");
    lift.className = "ld-card-lift";
    const face = document.createElement("div");
    face.className = "ld-card-face";
    lift.append(face);
    el.append(lift);
    el.style.opacity = "0";
    fan.append(el);
    const card: Card = { el, lift, index, launchAt: 0, landsAt: 0, flight: null, rolls: [] };
    this.cards.push(card);
    return card;
  }

  /** Sends a card (again, if it had not left yet) from the front panel onto its slot, leaving at `at`. */
  private fly(card: Card, probe: Probe, at: number, flight: number) {
    for (const anim of [card.flight, ...card.rolls]) {
      if (!anim) continue;
      anim.cancel();
      this.anims.delete(anim);
    }
    const { el, index } = card;
    const delay = Math.max(0, at - now());
    const angle = slotAngle(index);
    const r = probe.fanR + index * 0.12;
    // From the front panel's centre (card centred there), up in an arc, onto its slot.
    const x0 = probe.fromX;
    const y0 = probe.fromY + probe.cardH / 2;
    const spin = angle - 160 - (index % 3) * 40;
    const lift0 = Math.max(60, Math.abs(y0) * 0.35);
    const frames: Keyframe[] = [];
    const steps = 6;
    for (let k = 0; k <= steps; k += 1) {
      const f = k / steps;
      const x = x0 * (1 - f);
      const y = y0 * (1 - f) - lift0 * 4 * f * (1 - f);
      const a = spin + (angle - spin) * (1 - (1 - f) ** 2);
      const rr = r * f + (k === steps - 1 ? 7 : 0);
      const s = 0.7 + 0.3 * f + 0.18 * Math.sin(Math.PI * f);
      frames.push({
        transform: cardTransform(x, y, a, rr, s),
        opacity: k === 0 ? 0 : 1,
        offset: f,
      });
    }
    const anim = this.animate(el, frames, {
      duration: flight,
      delay,
      easing: "cubic-bezier(0.25, 0.6, 0.3, 1)",
      fill: "both",
    });
    card.flight = anim;
    card.rolls = this.roll(index + 1, delay);
    // The 52nd card: the star over the counter takes a bow as the counter shows 52.
    if (index === CARDS - 1) card.rolls.push(...this.bow(delay + ROLL_MS - 40));
    card.launchAt = now() + delay;
    card.landsAt = card.launchAt + flight;
    void anim?.finished
      .then(() => {
        if (this.gone() || card.flight !== anim) return;
        card.flight = null;
        card.rolls = [];
        el.style.opacity = "1";
        el.style.transform = this.slot(index);
        anim.cancel();
        this.anims.delete(anim);
        // Each quarter prints as its thirteenth card lands.
        this.checkPrint();
        // The landing nudges its neighbours, like a real fan settling.
        const before = index > 0 ? this.cards.at(index - 1) : undefined;
        if (before && !this.leaving) {
          this.animate(
            before.lift,
            [
              { transform: "rotate(0deg)" },
              { transform: "rotate(-2.5deg)" },
              { transform: "rotate(0deg)" },
            ],
            { duration: 260, easing: EASE, fill: "none" },
          );
        }
      })
      .catch(() => {
        // Sent again (re-timed) or cancelled on dispose.
      });
  }

  /** 52 / 52: the star over the counter turns a quarter and swells, and the counter pulses. */
  private bow(delay: number): Animation[] {
    const star = this.animate(
      this.q("hub-star"),
      [
        { transform: "scale(1) rotate(0deg)" },
        { transform: "scale(1.6) rotate(45deg)", offset: 0.4 },
        { transform: "scale(1) rotate(90deg)" },
      ],
      { duration: 520, delay, easing: EASE_OUT, fill: "none" },
    );
    const count = this.animate(
      this.q("count"),
      [{ scale: "1" }, { scale: "1.1", offset: 0.3 }, { scale: "1" }],
      { duration: 420, delay, easing: EASE_OUT, fill: "none" },
    );
    return [star, count].filter((anim): anim is Animation => anim !== null);
  }

  /** The odometer: each digit is a strip that rolls (the ones strip has a second 0 for the wrap). */
  private roll(value: number, delay: number): Animation[] {
    const tens = this.q("tens");
    const ones = this.q("ones");
    const prev = value - 1;
    const prevOnes = prev % 10;
    const curOnes = value % 10 === 0 ? 10 : value % 10;
    const rolls: Animation[] = [];
    const one = this.animate(
      ones,
      [
        { transform: `translateY(${-prevOnes * 1.2}em)` },
        { transform: `translateY(${-curOnes * 1.2}em)` },
      ],
      { duration: ROLL_MS, delay, easing: EASE_BACK },
    );
    if (one) rolls.push(one);
    const prevTens = Math.floor(prev / 10);
    const curTens = Math.floor(value / 10);
    if (curTens !== prevTens) {
      const ten = this.animate(
        tens,
        [
          { transform: `translateY(${-prevTens * 1.2}em)` },
          { transform: `translateY(${-curTens * 1.2}em)` },
        ],
        { duration: 320, delay, easing: EASE_BACK },
      );
      if (ten) rolls.push(ten);
    }
    return rolls;
  }

  // Printing ------------------------------------------------------------

  private landedCount() {
    // While leaving, the last quarter's ink chases its cards in.
    const t = now() + (this.leaving ? PRINT_LEAD : 0);
    let n = 0;
    for (const card of this.cards) if (card.landsAt <= t + 1) n += 1;
    return n;
  }

  private checkPrint() {
    if (now() < this.drawDoneAt) {
      // The quarter waits for its outline; look again when the drawing is done.
      if (!this.printWaiting && this.landedCount() >= (this.printed + 1) * QUARTER) {
        this.printWaiting = true;
        void this.wait(this.drawDoneAt - now() + 10).then(() => {
          this.printWaiting = false;
          if (!this.gone()) this.checkPrint();
        });
      }
      return;
    }
    const landed = this.landedCount();
    let delay = 0;
    const quick = this.rushed || this.leaving;
    while (this.printed < 4 && landed >= (this.printed + 1) * QUARTER) {
      this.printed += 1;
      this.print(this.printed, delay, quick ? PRINT_QUICK_MS : PRINT_MS);
      delay += quick ? 60 : 90;
    }
  }

  /** One quarter of the net takes its ink: a wipe from the bottom with a bright edge. */
  private print(group: number, delay: number, duration: number) {
    let i = 0;
    for (const panel of PANELS) {
      if (panel.print !== group) continue;
      const el = this.panels.get(panel.id);
      const ink = el?.querySelector(":scope > .ld-out .ld-ink");
      const inner = el?.querySelector(":scope > .ld-out .ld-ink-in");
      const edge = el?.querySelector(":scope > .ld-out .ld-edge");
      const d = delay + i * (duration < PRINT_MS ? 35 : 60);
      this.animate(edge, [{ opacity: 0.8 }, { opacity: 0.8, offset: 0.7 }, { opacity: 0 }], {
        duration,
        delay: d,
        easing: "linear",
        fill: "both",
      });
      this.animate(ink, [{ transform: "translateY(101%)" }, { transform: "translateY(0%)" }], {
        duration,
        delay: d,
        easing: EASE,
      });
      this.animate(inner, [{ transform: "translateY(-101%)" }, { transform: "translateY(0%)" }], {
        duration,
        delay: d,
        easing: EASE,
      });
      this.printEndsAt = Math.max(this.printEndsAt, now() + d + duration);
      this.inkEnds.set(group, Math.max(this.inkEnds.get(group) ?? 0, now() + d + duration));
      i += 1;
    }
    const swatch = this.root.querySelector(`[data-swatch="${group - 1}"] > span`);
    this.animate(swatch, [{ transform: "scale(0)" }, { transform: "scale(1)" }], {
      duration: 360,
      delay: delay + 120,
      easing: EASE_BACK,
    });
    if (group === 4) {
      const ink = this.root.querySelector(`[data-swatch="4"] > span`);
      this.animate(ink, [{ transform: "scale(0)" }, { transform: "scale(1)" }], {
        duration: 360,
        delay: delay + 260,
        easing: EASE_BACK,
      });
    }
  }

  // Waiting ---------------------------------------------------------------

  private checkStall() {
    if (this.stalled && now() - this.lastRipple > RIPPLE_MS) this.ripple();
    if (this.earned >= CARDS || this.stalled || this.earned > this.dealt) return;
    // Measured from the last card the progress earned (or the first look),
    // never before the first card could have left the box.
    const since = Math.max(this.earnedAt, this.lastLaunchAt, this.frontAt);
    if (now() - since < STALL_MS) return;
    this.stalled = true;
    const last = this.cards.at(-1);
    const target = last?.lift ?? this.q("hub-star");
    this.wobble = this.animate(
      target,
      [
        { transform: "translateY(0) rotate(0deg)" },
        { transform: "translateY(-5px) rotate(-5deg)", offset: 0.18 },
        { transform: "translateY(-2px) rotate(4deg)", offset: 0.36 },
        { transform: "translateY(-4px) rotate(-2deg)", offset: 0.54 },
        { transform: "translateY(0) rotate(0deg)", offset: 0.72 },
        { transform: "translateY(0) rotate(0deg)" },
      ],
      { duration: 1700, iterations: Infinity, easing: "ease-in-out", fill: "none" },
    );
    this.root.dataset.stalled = "";
    this.lastRipple = now();
    this.wantLine = true;
  }

  /** While nothing arrives, the dealt cards riffle now and then (the last one keeps its wobble). */
  private ripple() {
    this.lastRipple = now();
    const landed = this.cards.filter((card) => card.landsAt <= this.lastRipple).slice(0, -1);
    landed.forEach((card, i) => {
      this.animate(
        card.lift,
        [
          { transform: "translateY(0) rotate(0deg)" },
          { transform: "translateY(-7px) rotate(-2.5deg)", offset: 0.4 },
          { transform: "translateY(0) rotate(0deg)" },
        ],
        { duration: 420, delay: i * 24, easing: EASE, fill: "none" },
      );
    });
  }

  /** Cards flow again: the wobble stops and, unless the outro speaks next, a normal line comes back. */
  private endStall(nextLine: boolean) {
    if (!this.stalled) return;
    this.stalled = false;
    this.wobble?.cancel();
    this.wobble = null;
    delete this.root.dataset.stalled;
    // The stalled line gives way to a normal one once it has been read.
    if (nextLine && !this.leaving) this.wantLine = true;
  }

  /**
   * A new line every 2.5 s of visible time, sooner when one is due (a stall
   * began or ended), but never before the current one has been read.
   */
  private checkStatus(state: LoaderSnapshot) {
    if (this.override && this.override.until > now()) return;
    if (this.override) {
      this.override = null;
      this.wantLine = true;
    }
    const shown = state.elapsed - this.lineElapsed;
    if (shown < (this.wantLine ? MIN_LINE_MS : STATUS_MS)) return;
    this.wantLine = false;
    this.statusIndex += 1;
    this.changeStatus(this.pickLine(state));
  }

  private pickLine(state: LoaderSnapshot) {
    if (this.stalled) return this.bags.stalled.next(this.statusLine);
    if (state.story && state.progress >= 0.8) return this.bags.build.next(this.statusLine);
    if (state.story && this.statusIndex % 2 === 1) return this.bags.story.next(this.statusLine);
    return this.bags.statuses.next(this.statusLine);
  }

  /** The new line is dealt in letter by letter; the old one lifts away. */
  private changeStatus(line: string) {
    const status = this.q("status");
    this.lineElapsed = this.snapshot?.elapsed ?? 0;
    if (!status || line === this.statusLine) return;
    this.statusLine = line;
    for (const old of [...status.children]) {
      if (!(old instanceof HTMLElement)) continue;
      old.style.position = "absolute";
      old.style.inset = "0";
      const out = this.animate(
        old,
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(-8px)" },
        ],
        { duration: 220, easing: EASE_IN },
      );
      const drop = () => {
        old.remove();
      };
      void out?.finished.then(drop).catch(drop);
    }
    // A bare text node from the server render.
    for (const node of [...status.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
    const wrap = document.createElement("span");
    wrap.className = "ld-status-line";
    [...line].forEach((ch, i) => {
      const span = document.createElement("span");
      span.className = "ld-status-char";
      span.textContent = ch;
      wrap.append(span);
      this.animate(
        span,
        [
          { opacity: 0, transform: "translateY(0.45em) rotateX(80deg)" },
          { opacity: 1, transform: "translateY(0) rotateX(0deg)" },
        ],
        { duration: 300, delay: 60 + i * 14, easing: EASE_OUT, fill: "both" },
      );
    });
    status.append(wrap);
  }

  /** A tapped card in the fan: it rises, turns over, shows one of our crafts, and goes back. */
  private pick(el: HTMLElement) {
    if (this.leaving) return;
    const card = this.cards.find((c) => c.el === el);
    if (!card || card.landsAt > now() || card.lift.dataset.picked !== undefined) return;
    card.lift.dataset.picked = "";
    // The four crafts in turn, from a random start: never the same twice in a row.
    this.craft = this.craft < 0 ? Math.floor(random() * CRAFTS.length) : this.craft + 1;
    const craft = CRAFTS.at(this.craft % CRAFTS.length);
    let front = card.lift.querySelector<HTMLElement>(".ld-card-front");
    if (!front) {
      front = document.createElement("div");
      front.className = "ld-card-face ld-card-front";
      card.lift.append(front);
    }
    front.replaceChildren(...this.cardFace(craft?.letter ?? "W", craft?.shapes ?? []));
    const back = card.lift.querySelector(".ld-card-face:not(.ld-card-front)");
    const duration = 1500;
    this.animate(
      card.lift,
      // Eased per step, so the turns are edge on exactly halfway (0.23 and 0.89).
      [
        { transform: "translateY(0) rotateY(0deg) scale(1)", easing: "ease-in-out" },
        {
          transform: "translateY(-34px) rotateY(0deg) scale(1.5)",
          offset: 0.16,
          easing: "ease-in-out",
        },
        { transform: "translateY(-34px) rotateY(180deg) scale(1.5)", offset: 0.3 },
        {
          transform: "translateY(-34px) rotateY(180deg) scale(1.5)",
          offset: 0.78,
          easing: "ease-in-out",
        },
        { transform: "translateY(0) rotateY(360deg) scale(1)" },
      ],
      { duration, fill: "none" },
    );
    // Faces swap by opacity when the card is edge on, so it reads right even
    // where 3D is flattened.
    // The steps are per keyframe: an animation wide step would hold the
    // first keyframe for the whole turn.
    const swap = (from: number, to: number): Keyframe[] => [
      { opacity: from, easing: "step-end" },
      { opacity: to, offset: 0.23, easing: "step-end" },
      { opacity: from, offset: 0.89 },
      { opacity: from, offset: 1 },
    ];
    this.animate(back, swap(1, 0), { duration, fill: "none" });
    const show = this.animate(front, swap(0, 1), { duration, fill: "none" });
    this.override = { line: LOADER_COPY.pick, until: now() + duration };
    this.changeStatus(LOADER_COPY.pick);
    void show?.finished
      .then(() => {
        delete card.lift.dataset.picked;
      })
      .catch(() => undefined);
  }

  /** A card front: the index in two corners and the craft's logo in the middle. */
  private cardFace(letter: string, shapes: readonly (readonly [string, string])[]) {
    const index = (corner: string) => {
      const b = document.createElement("b");
      b.className = `ld-idx ${corner}`;
      b.textContent = letter;
      return b;
    };
    const ns = "http://www.w3.org/2000/svg";
    const logo = document.createElementNS(ns, "svg");
    logo.setAttribute("viewBox", "250 400 1500 1250");
    logo.setAttribute("class", "ld-card-logo");
    for (const [d, colour] of shapes) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.style.fill = colour;
      logo.append(path);
    }
    return [index("ld-tl"), logo, index("ld-br")];
  }

  // Reduced motion and the fast path ------------------------------------

  private updateStill(state: LoaderSnapshot) {
    const cards = Math.min(CARDS, Math.floor(state.progress * CARDS + 1e-6));
    const bar = this.q("bar");
    if (bar) bar.textContent = barText(cards);
    for (let group = 1; group <= 4; group += 1) {
      if (cards < group * QUARTER) continue;
      for (const panel of PANELS) {
        if (panel.print === group) this.panels.get(panel.id)?.classList.add("ld-inked");
      }
      this.root.querySelector(`[data-swatch="${group - 1}"]`)?.setAttribute("data-on", "");
      if (group === 4) this.root.querySelector(`[data-swatch="4"]`)?.setAttribute("data-on", "");
    }
    const index = Math.floor(state.elapsed / STATUS_MS);
    const status = this.q("status");
    if (status && index !== this.statusIndex) {
      this.statusIndex = index;
      this.statusLine = this.pickLine(state);
      status.textContent = this.statusLine;
    }
    if (state.phase === "leaving" && !this.leaving) {
      this.leaving = true;
      this.hooks.exited();
    }
  }

  /**
   * A reload waiting for the story: the shut box stands there, and after a
   * moment it says hello; it gives a little hop with each new line.
   */
  private updateFast(state: LoaderSnapshot) {
    if (state.elapsed < TALK_MS) return;
    const before = this.statusLine;
    if (this.talking) {
      this.checkStatus(state);
    } else {
      this.talking = true;
      this.root.dataset.talk = "";
      this.changeStatus(this.bags.again.next(this.statusLine));
    }
    if (this.statusLine !== before) this.hop(NUDGE);
  }

  /**
   * One hop of the shut box about its base, over its contact shadow (which
   * shrinks and fades as the box rises), from wherever the box stands.
   */
  private hop(keys: readonly TapKey[]) {
    const pose = this.q("pose");
    const floor = this.q("floor");
    if (!pose) return null;
    this.nudge?.cancel();
    const total = keys.at(-1)?.[0] ?? 1;
    const base = getComputedStyle(pose).transform;
    const matrix = base === "none" ? "" : base;
    const frames: Keyframe[] = keys.map(([ms, y, sx, sy, easing]) => ({
      transform: `translateY(${y}px) ${matrix} translateY(calc(var(--u) * ${HALF_H})) scale3d(${sx}, ${sy}, ${sx}) translateY(calc(var(--u) * ${-HALF_H}))`,
      offset: ms / total,
      easing,
    }));
    const keep = keys === NUDGE ? "none" : "forwards";
    const anim = this.animate(pose, frames, { duration: total, easing: "linear", fill: keep });
    this.animate(
      floor,
      keys.map(([ms, y, sx, , easing]) => ({
        transform: `scale(${r3((1 + y * 0.012) * sx)})`,
        opacity: r3(1 + y * 0.022),
        offset: ms / total,
        easing,
      })),
      { duration: total, easing: "linear", fill: keep },
    );
    if (keys === NUDGE) this.nudge = anim;
    return anim;
  }

  // Leaving ---------------------------------------------------------------

  private async leave(state: LoaderSnapshot) {
    window.clearTimeout(this.dealTimer);
    this.dealTimer = 0;
    if (this.mode === "fast") {
      this.nudge?.cancel();
      await this.reveal(ONE_TAP);
      return;
    }
    mark("leave");
    const early = state.progress < 1;
    this.override = { line: early ? LOADER_COPY.rest : LOADER_COPY.done, until: Infinity };
    const settleBy = now() + (early ? 600 : SETTLE_MAX_MS);
    if (early) {
      // The loader gave up waiting: what is not printed yet takes its ink at once, before the fold.
      while (this.printed < 4) {
        this.printed += 1;
        this.print(this.printed, (this.printed - 1) * 50, 300);
      }
    } else {
      // Every card is earned: the drawing hurries if it must, the rest go out as one spring.
      this.earned = CARDS;
      if (now() < this.frontAt) this.rush();
      const wait = Math.min(this.frontAt, settleBy) - now();
      if (wait > 0) await this.wait(wait);
      if (this.gone()) return;
      this.deal(CARDS);
    }
    // Every dealt card lands and every full quarter prints before anything folds.
    for (;;) {
      this.checkPrint();
      const lastLand = this.cards.reduce((m, c) => Math.max(m, c.landsAt), 0);
      const printed = early || this.printed >= 4;
      // A wipe looks finished a little before its easing ends.
      const ready = Math.max(
        lastLand,
        this.drawDoneAt,
        this.printEndsAt - (early ? 80 : PRINT_TAIL),
      );
      const t = now();
      if ((printed && t >= ready) || t >= settleBy) break;
      await this.wait(Math.min(printed ? ready - t : 50, settleBy - t));
      if (this.gone()) return;
    }
    this.endStall(false);
    this.changeStatus(early ? LOADER_COPY.rest : LOADER_COPY.done);
    // 52 / 52 stays up a moment before the fold (it usually has already).
    const last = this.cards.at(-1);
    const hold = early || !last ? 0 : last.launchAt + ROLL_MS + HOLD_MS - now();
    if (hold > 0) {
      await this.wait(hold);
      if (this.gone()) return;
    }
    const long = !early && (this.snapshot?.elapsed ?? 0) >= 2400;
    mark("fold");
    await this.fold(early ? 0.72 : this.rushed ? 0.85 : 1, long);
    if (this.gone()) return;
    mark("shut");
    await this.reveal(long ? SLAM_TAP : TAP_TAP);
  }

  /** The box pose: the front panel centred on the screen, turned to show a side and the lid. */
  private boxPose(): Pose {
    const front = this.panels.get("front");
    const box = this.root.getBoundingClientRect();
    if (!front) return { dx: 0, dy: 0, scale: 1 };
    const [fx, fy] = this.frontCentre();
    // The front panel ends at about a third of the screen's height (a little more on phones).
    const share = box.width < box.height ? 0.34 : 0.4;
    const scale = Math.min(
      1.3,
      Math.max(0.6, (box.height * share) / Math.max(1, front.offsetHeight)),
    );
    return {
      dx: box.left + box.width / 2 - fx,
      dy: box.top + box.height / 2 - fy,
      scale,
    };
  }

  /**
   * The net lifts off the mat, glides most of the way to the screen's centre
   * while its walls fold (so no wall ever folds past the screen's edge on a
   * narrow screen), and turns once the tube has formed.
   */
  private poseKeyframes(pose: Pose, k: number): Keyframe[] {
    const end = (FOLD.turn + FOLD.turnFor) * k;
    const glide = 0.88;
    const mid = 1.02 + (pose.scale - 1.02) * 0.35;
    return [
      { transform: poseTransform(0, 0, 0, 0, 1), offset: 0, easing: EASE_OUT },
      {
        transform: poseTransform(0, -5, 0, 0, 1.02),
        offset: (FOLD.lift * k) / end,
        easing: "cubic-bezier(0.45, 0, 0.25, 1)",
      },
      {
        transform: poseTransform(pose.dx * glide, pose.dy * glide - 5, 0, 0, mid),
        offset: (FOLD.turn * k) / end,
        easing: "cubic-bezier(0.5, 0, 0.15, 1)",
      },
      { transform: poseTransform(pose.dx, pose.dy, -16, -28, pose.scale), offset: 1 },
    ];
  }

  /**
   * Where the deck, the base and the front stand once the pose lands. The
   * pose animation (if any) jumps to its end for the reading and back, so
   * this is right mid flight too.
   */
  private standAt(pose: Pose): Stand | null {
    const el = this.q("pose");
    const deck = this.q("deck3d");
    const foot = this.q("foot");
    const front = this.panels.get("front")?.querySelector(".ld-out");
    if (!el || !deck || !foot || !front) return null;
    const anim = this.outro?.poseAnim ?? null;
    let back: (() => void) | null = null;
    if (anim) {
      const time = anim.currentTime;
      const end = anim.effect?.getComputedTiming().endTime;
      anim.currentTime = typeof end === "number" ? end : Number(end ?? 0);
      back = () => {
        anim.currentTime = time;
      };
    } else {
      const before = el.style.transform;
      el.style.transform = poseTransform(pose.dx, pose.dy, -16, -28, pose.scale);
      back = () => {
        el.style.transform = before;
      };
    }
    const stand = {
      deck: deck.getBoundingClientRect(),
      foot: foot.getBoundingClientRect(),
      front: front.getBoundingClientRect(),
    };
    back();
    return stand;
  }

  /** Where things stand right now (the fast path: the box is already shut). */
  private standNow(): Stand | null {
    const deck = this.q("deck3d");
    const foot = this.q("foot");
    const front = this.panels.get("front")?.querySelector(".ld-out");
    if (!deck || !foot || !front) return null;
    return {
      deck: deck.getBoundingClientRect(),
      foot: foot.getBoundingClientRect(),
      front: front.getBoundingClientRect(),
    };
  }

  /** The contact shadow under the box's base. */
  private placeFloor(stand: Stand | null) {
    const floor = this.q("floor");
    if (!floor || !stand) return;
    const box = this.root.getBoundingClientRect();
    const w = stand.front.width * 1.5;
    const h = Math.max(10, w * 0.2);
    floor.style.left = px(stand.foot.left - box.left - w / 2);
    floor.style.top = px(stand.foot.top - box.top - h / 2);
    floor.style.width = px(w);
    floor.style.height = px(h);
  }

  /** The screen changed size mid outro: the box, its shadow and a flying deck aim at the new place. */
  private reaim() {
    const outro = this.outro;
    if (!outro) return;
    this.measure();
    const pose = this.boxPose();
    outro.pose = pose;
    keyframeEffect(outro.poseAnim)?.setKeyframes(this.poseKeyframes(pose, outro.k));
    if (!outro.poseAnim) {
      const el = this.q("pose");
      if (el) el.style.transform = poseTransform(pose.dx, pose.dy, -16, -28, pose.scale);
    }
    const stand = this.standAt(pose);
    this.placeFloor(stand);
    if (outro.flight && stand) {
      const frames = this.flightFrames(stand.deck);
      if (frames) keyframeEffect(outro.flight)?.setKeyframes(frames);
    }
  }

  /** Close the fan, fold the net around the deck, shut the lid. */
  private async fold(k: number, peek: boolean) {
    const at = (ms: number) => ms * k;
    // Anything not printed yet takes its ink now (only when the loader gave up waiting).
    while (this.printed < 4) {
      this.printed += 1;
      this.print(this.printed, (this.printed - 1) * 50, 300);
    }
    this.animate(this.q("blueprint"), [{ opacity: 1 }, { opacity: 0 }], {
      duration: at(300),
      easing: "ease-out",
    });
    for (const name of ["count", "hub-star"]) {
      this.animate(this.q(name), [{ opacity: 1 }, { opacity: 0, transform: "translateY(6px)" }], {
        duration: 220,
        easing: EASE_IN,
      });
    }
    this.animate(this.root.querySelector(".ld-caption"), [{ opacity: 1 }, { opacity: 0 }], {
      duration: 200,
    });
    // Measure the finished box in one task with the sheet's lean taken off, then ease the lean out.
    const lean = this.toys?.release() ?? "";
    this.toys?.leave();
    const pose = this.boxPose();
    this.outro = { pose, poseAnim: null, flight: null, k };
    this.placeFloor(this.standAt(pose));
    if (lean) {
      this.animate(this.q("sheet"), [{ transform: lean }, { transform: "none" }], {
        duration: 380,
        easing: EASE_OUT,
        fill: "none",
      });
    }

    // The fan squares up into a deck, which becomes one card back with the stack's edge.
    const fanR = this.probe?.fanR ?? 70;
    const hub = this.q("hub");
    this.cards.forEach((card, i) => {
      card.el.style.opacity = "1";
      this.animate(
        card.el,
        [{ transform: this.slot(card.index) }, { transform: cardTransform(0, 0, 0, fanR + 4, 1) }],
        { duration: at(FOLD.square), delay: Math.abs(i - 26) * 1.5, easing: EASE_OUT },
      );
    });
    void this.wait(at(FOLD.square) + 50).then(() => {
      if (hub && !this.gone()) hub.dataset.squared = "";
    });

    // The net lifts off the mat (its shadow shows under it) and starts to fold.
    const poseEl = this.q("pose");
    this.outro.poseAnim = this.animate(poseEl, this.poseKeyframes(pose, k), {
      duration: at(FOLD.turn + FOLD.turnFor),
      easing: "linear",
    });
    // Its shadow only shows while the net is still flat (the first wall is barely moving).
    this.animate(
      this.q("lift"),
      [
        { opacity: 0, transform: "translate(0, 0)" },
        { opacity: 1, transform: "translate(3px, 7px)", offset: 0.45 },
        { opacity: 0, transform: "translate(4px, 9px)" },
      ],
      { duration: at(FOLD.walls + 130), easing: "ease-out" },
    );

    // The walls fold one by one into a tube, then the bottom closes, then the top.
    let shutAt = 0;
    for (const panel of PANELS) {
      const el = this.panels.get(panel.id);
      if (!el) continue;
      const inside = el.querySelector(":scope > .ld-in");
      const shade = el.querySelector(":scope > .ld-out .ld-shade");
      // The board's inside shows from the first fold, never through a panel still taking its ink.
      const inked = (this.inkEnds.get(panel.print) ?? 0) - now();
      this.animate(inside, [{ opacity: 1 }, { opacity: 1 }], {
        duration: 1,
        delay: Math.max(at(FOLD.walls), inked),
      });
      if (panel.parent === null) continue;
      const step = this.foldStep(panel, peek);
      const delay = at(step.delay);
      const duration = at(step.duration);
      if (panel.id !== "tuck") shutAt = Math.max(shutAt, delay + duration * step.shut);
      this.animate(el, step.frames, { duration, delay, easing: "linear" });
      this.animate(shade, [{ opacity: 0 }, { opacity: Math.abs(panel.shade) }], {
        duration,
        delay,
        easing: EASE_OUT,
      });
      if (panel.id === "glue") {
        // Glued inside, a hair behind the front: 3D sorting would show it through the front.
        for (const face of el.querySelectorAll(":scope > .ld-face")) {
          this.animate(face, [{ opacity: 0 }, { opacity: 0 }], {
            duration: 1,
            delay: delay + duration,
          });
        }
      }
    }
    // The box comes to stand on its shadow as it turns.
    this.animate(this.q("floor"), [{ opacity: 0 }, { opacity: 1 }], {
      duration: at(FOLD.turnFor * 0.6),
      delay: at(FOLD.turn + FOLD.turnFor * 0.4),
      easing: "ease-out",
    });
    const foldStart = now();

    // The deck flies up over the turned box and drops in through its open top.
    await this.wait(at(FOLD.deck));
    if (this.gone()) return;
    await this.deckIn(k);
    if (this.gone()) return;
    mark("deck");

    // The lid shuts (scheduled above).
    const left = foldStart + shutAt - now();
    if (left > 0) await this.wait(left);
    if (this.gone()) return;
    if (peek) {
      mark("peek");
      await this.peek();
    }
  }

  /** When and how one panel folds (ms before the outro's scale), and the share of it at which it shuts. */
  private foldStep(
    panel: NetPanel,
    peek: boolean,
  ): { delay: number; duration: number; frames: Keyframe[]; shut: number } {
    switch (panel.id) {
      case "glue":
        return {
          delay: FOLD.walls + 3 * FOLD.wallStep,
          duration: FOLD.glue,
          frames: foldFrames(panel, false),
          shut: 1,
        };
      case "dustAb":
      case "dustBb":
        return {
          delay: FOLD.dustBottom,
          duration: FOLD.flap,
          frames: foldFrames(panel, true, 0.05),
          shut: 1,
        };
      case "bottom":
        return {
          delay: FOLD.bottom,
          duration: FOLD.flap + 20,
          frames: foldFrames(panel, true),
          shut: 1,
        };
      case "btuck":
        return {
          delay: FOLD.bottomTuck,
          duration: FOLD.flap - 40,
          frames: foldFrames(panel, false),
          shut: 1,
        };
      case "dustAt":
      case "dustBt":
        return {
          delay: FOLD.top,
          duration: FOLD.flap,
          frames: foldFrames(panel, true, 0.05),
          shut: 1,
        };
      case "lid":
        return {
          delay: FOLD.lid,
          duration: FOLD.lidFor,
          // With a peek, someone inside holds the lid a crack open (peek() shuts it).
          frames: peek
            ? [{ transform: "none", easing: EASE_OUT }, { transform: `rotateX(${PEEK_LID}deg)` }]
            : [
                { transform: "none", easing: "ease-in" },
                { transform: "rotateX(97deg)", offset: 0.72, easing: "ease-out" },
                { transform: "rotateX(87deg)", offset: 0.88, easing: "ease-in-out" },
                { transform: panel.fold },
              ],
          // The eyes start to rise while the lid is still coming down to them.
          shut: peek ? 0.7 : 0.76,
        };
      case "tuck":
        return {
          delay: FOLD.lid + 60,
          duration: FOLD.flap,
          // While someone peeks, the tuck flap sticks out like a lip; otherwise it folds inside.
          frames: peek
            ? [{ transform: "none", easing: EASE_OUT }, { transform: `rotateX(${PEEK_TUCK}deg)` }]
            : foldFrames(panel, false),
          shut: 1,
        };
      default:
        // The walls: front to side, side to back, back to side.
        return {
          delay: FOLD.walls + panel.order * FOLD.wallStep,
          duration: FOLD.wall,
          frames: foldFrames(panel, true),
          shut: 1,
        };
    }
  }

  /**
   * The deck's flight from the hub to the box (`dest` is where the deck
   * inside it stands): it swings out past the box's side, rises over the
   * open top, and drops in.
   */
  private flightFrames(dest: DOMRect): Keyframe[] | null {
    const deck = this.q("deck");
    if (!deck) return null;
    // Layout position, without the flight's own transform.
    const hub = this.q("hub");
    if (!hub) return null;
    const hubRect = hub.getBoundingClientRect();
    const cx = hubRect.left + deck.offsetLeft + deck.offsetWidth / 2;
    const cy = hubRect.top + deck.offsetTop + deck.offsetHeight / 2;
    const tx = dest.left + dest.width / 2 - cx;
    const ty = dest.top + dest.height / 2 - cy;
    const scale = Math.max(1, dest.height / Math.max(1, deck.offsetHeight));
    // Out past the side away from the visible wall, then over the top.
    const side = dest.width * 1.05;
    const over = dest.height * 0.42;
    const at = (x: number, y: number, s: number, turn: number) =>
      `translate(${px(x)}, ${px(y)}) scale(${r3(s)}) rotate(${turn}deg)`;
    return [
      { transform: at(0, 0, 1, 0), easing: "cubic-bezier(0.3, 0, 0.5, 1)" },
      {
        transform: at(tx + side, ty * 0.45, 1 + (scale - 1) * 0.55, 14),
        offset: 0.42,
        easing: "cubic-bezier(0.4, 0, 0.5, 1)",
      },
      {
        transform: at(tx + side * 0.2, ty - over, scale, 3),
        offset: 0.8,
        easing: "cubic-bezier(0.5, 0, 0.75, 0.4)",
      },
      { transform: at(tx, ty, scale, 0) },
    ];
  }

  private async deckIn(k: number) {
    const deck = this.q("deck");
    const deck3d = this.q("deck3d");
    const hub = this.q("hub");
    const outro = this.outro;
    if (!deck || !deck3d || !outro) return;
    // The squared fan has become the deck by now.
    if (hub) hub.dataset.squared = "";
    const stand = this.standAt(outro.pose);
    const frames = stand ? this.flightFrames(stand.deck) : null;
    if (!frames) return;
    // The deck passes behind the box and drops in through its open top.
    const stage = this.root.querySelector<HTMLElement>(".ld-stage");
    if (stage) stage.style.zIndex = "2";
    const fly = this.animate(deck, frames, {
      duration: FOLD.flight * k,
      easing: "linear",
    });
    outro.flight = fly;
    await fly?.finished.catch(() => undefined);
    outro.flight = null;
    if (this.gone()) return;
    // Hand over to the deck inside the box in one frame: both stand in the same
    // place, so a cut reads as one deck (a crossfade showed a ghost card).
    this.animate(deck, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 });
    this.animate(deck3d, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 });
    const slide = this.animate(
      deck3d,
      [
        { transform: "translateZ(calc(var(--u) * -223)) translateY(0)" },
        { transform: "translateZ(calc(var(--u) * -223)) translateY(calc(var(--u) * 1060))" },
      ],
      { duration: FOLD.slide * k, easing: EASE_IN },
    );
    await slide?.finished.catch(() => undefined);
  }

  /**
   * The lid stands a crack open: two eyes rise into the gap, look at us,
   * glance left and right, blink, and duck; the lid snaps shut on them.
   */
  private async peek() {
    const lid = this.panels.get("lid");
    const eyes = this.q("eyes");
    if (!lid || !eyes) return;
    const duration = 1100;
    const t = (ms: number) => ms / duration;
    const at = (y: number) =>
      `translateX(-50%) translateZ(calc(var(--u) * -90)) translateY(calc(var(--u) * ${y}))`;
    this.animate(
      eyes,
      [
        { opacity: 0, transform: at(240), easing: "cubic-bezier(0.2, 0.8, 0.3, 1.2)" },
        { opacity: 1, transform: at(-162), offset: t(200), easing: "ease-in-out" },
        { opacity: 1, transform: at(-150), offset: t(280) },
        { opacity: 1, transform: at(-150), offset: t(930), easing: EASE_IN },
        { opacity: 0, transform: at(240), offset: t(1060) },
        { opacity: 0, transform: at(240) },
      ],
      { duration, easing: "linear" },
    );
    for (const pupil of eyes.querySelectorAll(".ld-pupil")) {
      this.animate(
        pupil,
        [
          { transform: "translate(0, 0)" },
          { transform: "translate(0, 0)", offset: t(330), easing: "ease-out" },
          { transform: "translate(-36%, 0)", offset: t(390) },
          { transform: "translate(-36%, 0)", offset: t(570), easing: "ease-in-out" },
          { transform: "translate(32%, 0)", offset: t(650) },
          { transform: "translate(32%, 0)", offset: t(830), easing: "ease-out" },
          { transform: "translate(0, 0)", offset: t(880) },
          { transform: "translate(0, 0)", offset: t(950), easing: "ease-in" },
          { transform: "translate(0, 12%)", offset: t(1000) },
          { transform: "translate(0, 12%)" },
        ],
        { duration, easing: "linear", fill: "none" },
      );
    }
    for (const lash of eyes.querySelectorAll(".ld-lash")) {
      this.animate(
        lash,
        [
          { transform: "translateY(-100%)" },
          { transform: "translateY(-100%)", offset: t(870), easing: "ease-in" },
          { transform: "translateY(0)", offset: t(915), easing: "ease-out" },
          { transform: "translateY(-100%)", offset: t(970) },
          { transform: "translateY(-100%)" },
        ],
        { duration, easing: "linear", fill: "none" },
      );
    }
    await this.wait(duration * 0.88);
    if (this.gone()) return;
    this.animate(
      this.panels.get("tuck"),
      [{ transform: `rotateX(${PEEK_TUCK}deg)` }, { transform: "rotateX(90deg)" }],
      { duration: 160, easing: "ease-in" },
    );
    const shut = this.animate(
      lid,
      [
        { transform: `rotateX(${PEEK_LID}deg)`, easing: "ease-in" },
        { transform: "rotateX(97deg)", offset: 0.55, easing: "ease-out" },
        { transform: "rotateX(87deg)", offset: 0.8, easing: "ease-in-out" },
        { transform: "rotateX(90deg)" },
      ],
      { duration: 300, easing: "linear" },
    );
    await shut?.finished.catch(() => undefined);
  }

  /**
   * Tap tap (one tap on the fast path, and after the peek, whose slam is
   * the first): the box hops with a stretch and lands with a squash about
   * its base. Then a star pops out of the front's emblem with a spin, and
   * the page opens through it.
   */
  private async reveal(tap: Tap) {
    const { pop: popAt, open: openAt } = tap;
    this.hop(tap.keys);
    // Where the star comes out: the emblem at the top of the front, at rest.
    const box = this.root.getBoundingClientRect();
    const emblem = this.q("emblem")?.getBoundingClientRect();
    const front = this.panels.get("front")?.querySelector(".ld-out")?.getBoundingClientRect();
    const cx = emblem ? emblem.left - box.left : box.width / 2;
    const cy = emblem ? emblem.top - box.top : box.height / 2;
    const starR = Math.min(40, Math.max(13, (front?.height ?? 300) * 0.085));

    await this.wait(popAt);
    if (this.gone()) return;
    const pop = this.q("pop");
    if (pop) {
      pop.style.left = px(cx - starR);
      pop.style.top = px(cy - starR);
      pop.style.width = px(starR * 2);
      pop.style.height = px(starR * 2);
    }
    const popFor = openAt - popAt;
    const popped = this.animate(
      pop,
      [
        {
          opacity: 1,
          transform: "scale(0) rotate(-150deg)",
          easing: "cubic-bezier(0.2, 0.7, 0.3, 1)",
        },
        { opacity: 1, transform: "scale(1.32) rotate(18deg)", offset: 0.62, easing: "ease-in-out" },
        { opacity: 1, transform: "scale(1) rotate(0deg)" },
      ],
      { duration: popFor, easing: "linear" },
    );

    // The page opens as the star's spin settles (chained, so a busy thread adds no pause).
    await (popped ? popped.finished.catch(() => undefined) : this.wait(popFor));
    if (this.gone()) return;
    const far = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(box.width - cx, cy),
      Math.hypot(cx, box.height - cy),
      Math.hypot(box.width - cx, box.height - cy),
    );
    const max = (far / 0.314) * 1.08;
    const duration = tap.iris;
    // The hole opens at once (about 14 px) and grows exponentially, a steady
    // zoom that never hangs as a speck; its yellow edge starts as the popped
    // star and thins to a rim.
    const hole0 = Math.min(starR * 0.42, 15);
    const frames: Keyframe[] = [];
    const ring: Keyframe[] = [];
    const steps = 24;
    const w = px(box.width);
    const h = px(box.height);
    for (let k = 0; k <= steps; k += 1) {
      const f = k / steps;
      const grown = hole0 * (max / hole0) ** f;
      // The first frame is the popped star itself (no hole yet).
      const hole = k === 0 ? 0.5 : grown;
      const band = Math.max(0, starR - hole0) * (1 - f) ** 2 + 7 * f + grown * 0.02;
      const turn = (Math.PI / 4) * (1 - (1 - f) ** 2);
      const place = (points: readonly (readonly [number, number])[]) =>
        points.map(([x, y]) => {
          const rx = x * Math.cos(turn) - y * Math.sin(turn) + cx;
          const ry = x * Math.sin(turn) + y * Math.cos(turn) + cy;
          return `${px(rx)} ${px(ry)}`;
        });
      ring.push({
        clipPath: `polygon(${place(starPoints(0, 0, grown + band)).join(", ")})`,
        offset: f,
      });
      const star = place(starPoints(0, 0, hole));
      frames.push({
        clipPath: `polygon(evenodd, 0px 0px, ${w} 0px, ${w} ${h}, 0px ${h}, 0px 0px, ${star.join(", ")}, ${star[0] ?? "0px 0px"})`,
        offset: f,
      });
    }
    mark("open");
    // From here on the page under the loader takes taps, wheels and keys again.
    this.host.dataset.revealing = "";
    this.hooks.revealing();
    const iris = this.animate(this.host, frames, { duration, easing: "linear" });
    this.animate(this.q("iris"), ring, { duration, easing: "linear" });
    // The popped star becomes the opening's edge in the same frame.
    this.animate(pop, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 });
    await iris?.finished.catch(() => undefined);
    if (this.gone()) return;
    mark("exited");
    this.hooks.exited();
  }
}
