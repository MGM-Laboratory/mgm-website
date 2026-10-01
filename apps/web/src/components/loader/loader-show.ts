import type { LoaderSnapshot } from "@/components/loader/loader-core";
import { DRAW, PANELS, barText, starPoints, type PanelId } from "@/components/loader/loader-net";
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
 * - Progress is counted in cards: 52 is 100%, the counter never shows more
 *   than the core's real progress, and each card is dealt from the box's
 *   front panel onto a pressure fan around the counter.
 * - Every 13 cards one quarter of the net prints (once its outline is drawn).
 * - The status line changes every 2.5 s of visible time, from the list that
 *   fits what is loading, in a new order on every visit.
 * - When no card comes for 1.6 s the last one wobbles and the line changes
 *   to a stalled one.
 * - Leaving: the fan closes into a deck, the net folds around it, the lid
 *   shuts (the eyes peek once when the wait was long), and the page opens
 *   through a four-point star. A reload in the same tab only taps the box
 *   and opens the star; under reduced motion it goes at once.
 */

const CARDS = 52;
const FAN_SPAN = 150;
const FLIGHT_MS = 400;
const STALL_MS = 1600;
const STATUS_MS = 2500;
const QUARTER = 13;

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
  landsAt: number;
};

const EASE = "cubic-bezier(0.35, 0, 0, 1)";
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.55, 0, 0.9, 0.4)";
const EASE_BACK = "cubic-bezier(0.34, 1.5, 0.64, 1)";

function now() {
  return performance.now();
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

function cardTransform(x: number, y: number, angle: number, r: number, scale: number) {
  return `translate(${px(x)}, ${px(y)}) rotate(${Math.round(angle * 100) / 100}deg) translateY(${px(-r)}) scale(${Math.round(scale * 1000) / 1000})`;
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
  private drawDoneAt = 0;
  private dealt = 0;
  private nextSlot = 0;
  private lastLaunchAt = 0;
  private shownValue = 0;
  private printed = 0;
  private stalled = false;
  private wobble: Animation | null = null;
  private statusIndex = 0;
  private statusLine: string = LOADER_COPY.statuses[0];
  private readonly bags = {
    statuses: new LineBag(LOADER_COPY.statuses),
    story: new LineBag(LOADER_COPY.story),
    build: new LineBag(LOADER_COPY.build),
    stalled: new LineBag(LOADER_COPY.stalled),
  };
  private override: { line: string; until: number } | null = null;
  private leaving = false;
  private disposed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly onExited: () => void,
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
    this.drawDoneAt = this.mode === "first" ? (started ?? timelineNow) + DRAW.done * 1000 : 0;
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
        this.measure();
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
    if (state.phase !== "loading" || this.mode !== "first") return;
    const target = Math.min(CARDS, Math.floor(state.progress * CARDS + 1e-6));
    if (target > this.dealt) this.deal(target);
    this.checkPrint();
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
    for (const anim of this.anims) anim.cancel();
    this.anims.clear();
    this.resize?.disconnect();
    this.toys?.dispose();
    for (const card of this.cards) card.el.remove();
    this.cards.length = 0;
    this.host.style.removeProperty("clip-path");
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
    return anim;
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        this.timers.delete(id);
        resolve();
      }, ms);
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

  // The deal ------------------------------------------------------------

  private deal(target: number) {
    const fan = this.q("fan");
    const probe = this.probe;
    if (!fan || !probe) return;
    const t = now();
    const backlog = target - this.dealt;
    const spacing = backlog >= 20 ? 15 : backlog >= 6 ? 32 : 70;
    if (this.nextSlot < t) this.nextSlot = t;
    for (let n = this.dealt; n < target; n += 1) {
      const delay = this.nextSlot - t;
      this.launch(fan, probe, n, delay);
      this.roll(n + 1, delay);
      this.nextSlot += spacing;
    }
    this.lastLaunchAt = this.nextSlot - spacing;
    this.dealt = target;
    if (this.stalled) this.endStall();
  }

  private launch(fan: HTMLElement, probe: Probe, index: number, delay: number) {
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
      duration: FLIGHT_MS,
      delay,
      easing: "cubic-bezier(0.25, 0.6, 0.3, 1)",
      fill: "both",
    });
    const card: Card = { el, lift, index, landsAt: now() + delay + FLIGHT_MS };
    this.cards.push(card);
    void anim?.finished
      .then(() => {
        if (this.gone()) return;
        el.style.opacity = "1";
        el.style.transform = this.slot(index);
        anim.cancel();
        this.anims.delete(anim);
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
        // Cancelled on dispose.
      });
  }

  /** The odometer: each digit is a strip that rolls (the ones strip has a second 0 for the wrap). */
  private roll(value: number, delay: number) {
    const tens = this.q("tens");
    const ones = this.q("ones");
    const prev = value - 1;
    const prevOnes = prev % 10;
    const curOnes = value % 10 === 0 ? 10 : value % 10;
    this.animate(
      ones,
      [
        { transform: `translateY(${-prevOnes * 1.2}em)` },
        { transform: `translateY(${-curOnes * 1.2}em)` },
      ],
      { duration: 240, delay, easing: EASE_BACK },
    );
    const prevTens = Math.floor(prev / 10);
    const curTens = Math.floor(value / 10);
    if (curTens !== prevTens) {
      this.animate(
        tens,
        [
          { transform: `translateY(${-prevTens * 1.2}em)` },
          { transform: `translateY(${-curTens * 1.2}em)` },
        ],
        { duration: 320, delay, easing: EASE_BACK },
      );
    }
    this.shownValue = value;
  }

  // Printing ------------------------------------------------------------

  private landedCount() {
    const t = now();
    let n = 0;
    for (const card of this.cards) if (card.landsAt <= t) n += 1;
    return n;
  }

  private checkPrint() {
    if (now() < this.drawDoneAt) return;
    const landed = this.landedCount();
    while (this.printed < 4 && landed >= (this.printed + 1) * QUARTER) {
      this.printed += 1;
      this.print(this.printed, 0, 520);
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
      const d = delay + i * 60;
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
    if (this.dealt >= CARDS || this.stalled) return;
    if (now() - Math.max(this.lastLaunchAt, this.drawDoneAt - 400) < STALL_MS) return;
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
    this.changeStatus(this.bags.stalled.next(this.statusLine));
  }

  private endStall() {
    this.stalled = false;
    this.wobble?.cancel();
    this.wobble = null;
    delete this.root.dataset.stalled;
  }

  private checkStatus(state: LoaderSnapshot) {
    const t = now();
    if (this.override && this.override.until > t) return;
    if (this.override) {
      this.override = null;
      this.changeStatus(this.pickLine(state));
      return;
    }
    const index = Math.floor(state.elapsed / STATUS_MS);
    if (index === this.statusIndex) return;
    this.statusIndex = index;
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
    const crafts = [
      { letter: "W", colour: "var(--brand-blue)" },
      { letter: "M", colour: "var(--brand-red)" },
      { letter: "G", colour: "var(--brand-green)" },
      { letter: "U", colour: "var(--brand-yellow)" },
    ];
    const craft = crafts.at(Math.floor(random() * crafts.length));
    let front = card.lift.querySelector<HTMLElement>(".ld-card-front");
    if (!front) {
      front = document.createElement("div");
      front.className = "ld-card-face ld-card-front";
      card.lift.append(front);
    }
    front.replaceChildren();
    const letter = document.createElement("b");
    letter.textContent = craft?.letter ?? "W";
    const mark = document.createElement("i");
    mark.style.setProperty("--c", craft?.colour ?? "var(--brand-blue)");
    front.append(letter, mark);
    const back = card.lift.querySelector(".ld-card-face:not(.ld-card-front)");
    const duration = 1500;
    this.animate(
      card.lift,
      [
        { transform: "translateY(0) rotateY(0deg) scale(1)" },
        { transform: "translateY(-34px) rotateY(0deg) scale(1.5)", offset: 0.16 },
        { transform: "translateY(-34px) rotateY(180deg) scale(1.5)", offset: 0.3 },
        { transform: "translateY(-34px) rotateY(180deg) scale(1.5)", offset: 0.78 },
        { transform: "translateY(0) rotateY(360deg) scale(1)" },
      ],
      { duration, easing: "ease-in-out", fill: "none" },
    );
    // Faces swap at the turn by opacity, so it reads right even where 3D is flattened.
    this.animate(
      back,
      [{ opacity: 1 }, { opacity: 0, offset: 0.23 }, { opacity: 0, offset: 0.88 }, { opacity: 1 }],
      {
        duration,
        easing: "steps(1, end)",
        fill: "none",
      },
    );
    const show = this.animate(
      front,
      [{ opacity: 0 }, { opacity: 1, offset: 0.23 }, { opacity: 1, offset: 0.88 }, { opacity: 0 }],
      { duration, easing: "steps(1, end)", fill: "none" },
    );
    this.override = { line: LOADER_COPY.pick, until: now() + duration };
    this.changeStatus(LOADER_COPY.pick);
    void show?.finished
      .then(() => {
        delete card.lift.dataset.picked;
      })
      .catch(() => undefined);
  }

  // Reduced motion ------------------------------------------------------

  private updateStill(state: LoaderSnapshot) {
    const cards = Math.min(CARDS, Math.floor(state.progress * CARDS + 1e-6));
    const bar = this.q("bar");
    if (bar) bar.textContent = barText(cards);
    for (let group = 1; group <= 4; group += 1) {
      if (cards < group * QUARTER) continue;
      for (const panel of PANELS) {
        if (panel.print === group) this.panels.get(panel.id)?.classList.add("ld-inked");
      }
    }
    const index = Math.floor(state.elapsed / STATUS_MS);
    const status = this.q("status");
    if (status && index !== this.statusIndex) {
      this.statusIndex = index;
      status.textContent = this.pickLine(state);
    }
    if (state.phase === "leaving" && !this.leaving) {
      this.leaving = true;
      this.onExited();
    }
  }

  // Leaving ---------------------------------------------------------------

  private async leave(state: LoaderSnapshot) {
    if (this.mode === "fast") {
      await this.reveal(true, true);
      return;
    }
    const early = state.progress < 1;
    const status = early ? LOADER_COPY.rest : LOADER_COPY.done;
    this.override = { line: status, until: Infinity };
    // Let the deal finish and the drawing land (never more than 0.9 s).
    if (!early && this.dealt < CARDS) this.deal(CARDS);
    const lastLand = this.cards.reduce((m, c) => Math.max(m, c.landsAt), 0);
    const ready = Math.min(now() + 900, Math.max(lastLand, this.drawDoneAt));
    // Keep printing while the last cards land.
    while (now() < ready) {
      await this.wait(Math.min(100, ready - now()));
      if (this.gone()) return;
      this.checkPrint();
    }
    this.endStall();
    this.changeStatus(status);
    const long = !early && (this.snapshot?.elapsed ?? 0) >= 2400;
    await this.fold(early, long);
    if (this.gone()) return;
    // After the peek's tap tap the box opens at once; otherwise it taps once first.
    await this.reveal(false, !long);
  }

  /** Close the fan, fold the net around the deck, shut the lid. */
  private async fold(quick: boolean, peek: boolean) {
    // The outro's clock, in ms from now (quick: the loader gave up waiting).
    const k = quick ? 0.72 : 0.9;
    const at = {
      walls: 140 * k,
      wallStep: 70 * k,
      deck: 470 * k,
      top: (quick ? 760 : 1060) * k,
      topStep: 110 * k,
      flap: 420 * k,
      lid: 460 * k,
    };
    // Anything not printed yet takes its ink now.
    while (this.printed < 4) {
      this.printed += 1;
      this.print(this.printed, (this.printed - 1) * 50, 300);
    }
    this.animate(this.q("blueprint"), [{ opacity: 1 }, { opacity: 0 }], {
      duration: 320 * k,
      delay: 100,
      easing: "ease-out",
    });
    for (const name of ["count", "hub-star"]) {
      this.animate(this.q(name), [{ opacity: 1 }, { opacity: 0, transform: "translateY(6px)" }], {
        duration: 260,
        easing: EASE_IN,
      });
    }
    this.animate(this.root.querySelector(".ld-caption"), [{ opacity: 1 }, { opacity: 0 }], {
      duration: 220,
    });
    // Measure the finished box in one task with the sheet's lean taken off, then ease the lean out.
    const lean = this.toys?.release() ?? "";
    const pose = this.q("pose");
    const target = this.boxPose();
    const dest = this.deckDest(target);
    if (lean) {
      this.animate(this.q("sheet"), [{ transform: lean }, { transform: "none" }], {
        duration: 380,
        easing: EASE_OUT,
        fill: "none",
      });
    }
    this.toys?.leave();

    // The fan squares up into a deck.
    const fanR = this.probe?.fanR ?? 70;
    this.cards.forEach((card, i) => {
      card.el.style.opacity = "1";
      this.animate(
        card.el,
        [
          { transform: this.slot(card.index) },
          { transform: cardTransform(0, 0, 0, fanR + 4 - i * 0.18, 1) },
        ],
        { duration: 420 * k, delay: i * 3, easing: EASE_OUT },
      );
    });

    // The net folds: the walls wrap into a tube, the bottom closes, then the top.
    let end = 0;
    for (const panel of PANELS) {
      const el = this.panels.get(panel.id);
      if (!el) continue;
      const inside = el.querySelector(":scope > .ld-in");
      const shade = el.querySelector(":scope > .ld-out .ld-shade");
      this.animate(inside, [{ opacity: 1 }, { opacity: 1 }], { duration: 1, delay: at.walls });
      if (panel.parent === null) continue;
      const top = panel.order >= 7;
      const lid = panel.id === "lid";
      const delay = top
        ? at.top + (panel.order - 7) * at.topStep
        : at.walls + panel.order * at.wallStep;
      const duration = lid ? at.lid : at.flap;
      end = Math.max(end, delay + duration);
      this.animate(
        el,
        lid
          ? [
              { transform: "none" },
              { transform: "rotateX(97deg)", offset: 0.72 },
              { transform: "rotateX(87deg)", offset: 0.88 },
              { transform: panel.fold },
            ]
          : [{ transform: "none" }, { transform: panel.fold }],
        { duration, delay, easing: lid ? "ease-in" : EASE_OUT },
      );
      this.animate(shade, [{ opacity: 0 }, { opacity: Math.abs(panel.shade) }], {
        duration,
        delay,
        easing: EASE_OUT,
      });
    }
    this.animate(pose, [{ transform: "none" }, { transform: target }], {
      duration: 700 * k,
      delay: at.walls,
      easing: EASE,
    });
    const foldEnd = now() + end;

    // The deck flies up into the open box and slides in behind the front.
    await this.wait(at.deck);
    if (this.gone()) return;
    await this.deckIn(dest, quick);
    if (this.gone()) return;

    // The lid shuts (scheduled above).
    const left = foldEnd - now();
    if (left > 0) await this.wait(left);
    if (this.gone()) return;
    if (peek) await this.peek(target);
  }

  /** The box pose: the front panel centred on the screen, turned to show a side and the lid. */
  private boxPose() {
    const front = this.panels.get("front");
    if (!front) return "none";
    const box = this.root.getBoundingClientRect();
    const [fx, fy] = this.frontCentre();
    const dx = box.left + box.width / 2 - fx;
    const dy = box.top + box.height / 2 - fy;
    const scale = Math.min(1.3, Math.max(1, (box.height * 0.4) / Math.max(1, front.offsetHeight)));
    return `translate(${px(dx)}, ${px(dy)}) rotateX(-16deg) rotateY(-28deg) scale(${Math.round(scale * 1000) / 1000})`;
  }

  /** Where the deck stands above the box once the pose lands (the box is still flat: no animation yet). */
  private deckDest(target: string): DOMRect | null {
    const pose = this.q("pose");
    const deck3d = this.q("deck3d");
    if (!pose || !deck3d) return null;
    const before = pose.style.transform;
    pose.style.transform = target;
    const dest = deck3d.getBoundingClientRect();
    pose.style.transform = before;
    return dest;
  }

  private async deckIn(dest: DOMRect | null, quick: boolean) {
    const fan = this.q("fan");
    const deck3d = this.q("deck3d");
    if (!fan || !deck3d || !dest) return;
    const from = fan.getBoundingClientRect();
    const probe = this.probe;
    const deckH = probe?.cardH ?? 50;
    // The fan's cards stand stacked above the pivot: their centre is up by r + h / 2.
    const lift = (probe?.fanR ?? 70) + deckH / 2;
    fan.style.transformOrigin = `0px ${px(-lift)}`;
    const cx = from.left;
    const cy = from.top - lift;
    const tx = dest.left + dest.width / 2 - cx;
    const ty = dest.top + dest.height / 2 - cy;
    const scale = Math.max(1, dest.height / deckH);
    const duration = quick ? 300 : 380;
    const fly = this.animate(
      fan,
      [
        { transform: "translate(0, 0) scale(1)" },
        {
          transform: `translate(${px(tx * 0.5)}, ${px(ty * 0.5 - 70)}) scale(${(1 + scale) / 2}) rotate(-8deg)`,
          offset: 0.5,
        },
        { transform: `translate(${px(tx)}, ${px(ty)}) scale(${scale}) rotate(0deg)` },
      ],
      { duration, easing: "cubic-bezier(0.45, 0, 0.2, 1)" },
    );
    await fly?.finished.catch(() => undefined);
    if (this.gone()) return;
    // Hand over to the deck inside the box (the front panel hides its lower half).
    this.animate(fan, [{ opacity: 1 }, { opacity: 0 }], { duration: 90 });
    this.animate(deck3d, [{ opacity: 0 }, { opacity: 1 }], { duration: 60 });
    const slide = this.animate(
      deck3d,
      [
        { transform: "translateZ(calc(var(--u) * -223)) translateY(0)" },
        { transform: "translateZ(calc(var(--u) * -223)) translateY(calc(var(--u) * 1060))" },
      ],
      { duration: quick ? 200 : 260, easing: EASE_IN },
    );
    // The star dives in after it.
    const star = this.q("hub-star");
    if (star) {
      const s = star.getBoundingClientRect();
      this.animate(
        star,
        [
          { opacity: 1, transform: "translate(0, 0) scale(1) rotate(0deg)" },
          {
            opacity: 1,
            transform: `translate(${px(dest.left + dest.width / 2 - s.left - s.width / 2)}, ${px(dest.top + dest.height * 0.55 - s.top - s.height / 2)}) scale(0.4) rotate(180deg)`,
          },
        ],
        { duration: 300, easing: "cubic-bezier(0.5, 0, 0.75, 0)" },
      );
    }
    await slide?.finished.catch(() => undefined);
  }

  /** The lid lifts a crack, two eyes look out, blink, and duck back in. */
  private async peek(target: string) {
    const lid = this.panels.get("lid");
    const eyes = this.q("eyes");
    const pose = this.q("pose");
    if (!lid || !eyes || !pose) return;
    const lift = this.animate(
      lid,
      [
        { transform: "rotateX(90deg)" },
        { transform: "rotateX(66deg)", offset: 0.25 },
        { transform: "rotateX(66deg)", offset: 0.75 },
        { transform: "rotateX(90deg)" },
      ],
      { duration: 900, easing: "ease-in-out" },
    );
    this.animate(
      eyes,
      [
        {
          opacity: 0,
          transform:
            "translateX(-50%) translateZ(calc(var(--u) * -70)) translateY(calc(var(--u) * 200))",
        },
        {
          opacity: 1,
          transform: "translateX(-50%) translateZ(calc(var(--u) * -70)) translateY(0)",
          offset: 0.3,
        },
        {
          opacity: 1,
          transform: "translateX(-50%) translateZ(calc(var(--u) * -70)) translateY(0)",
          offset: 0.68,
        },
        {
          opacity: 0,
          transform:
            "translateX(-50%) translateZ(calc(var(--u) * -70)) translateY(calc(var(--u) * 200))",
          offset: 0.82,
        },
        {
          opacity: 0,
          transform:
            "translateX(-50%) translateZ(calc(var(--u) * -70)) translateY(calc(var(--u) * 200))",
        },
      ],
      { duration: 900, easing: "ease-in-out" },
    );
    for (const lash of eyes.querySelectorAll(".ld-lash")) {
      this.animate(
        lash,
        [
          { transform: "translateY(-100%)" },
          { transform: "translateY(-100%)", offset: 0.4 },
          { transform: "translateY(0)", offset: 0.46 },
          { transform: "translateY(-100%)", offset: 0.53 },
          { transform: "translateY(-100%)" },
        ],
        { duration: 900, easing: "linear", fill: "none" },
      );
    }
    await lift?.finished.catch(() => undefined);
    // Tap tap.
    const hop = this.animate(
      pose,
      [
        { transform: target },
        { transform: `translateY(-10px) ${target}`, offset: 0.25 },
        { transform: target, offset: 0.5 },
        { transform: `translateY(-6px) ${target}`, offset: 0.72 },
        { transform: target },
      ],
      { duration: 380, easing: "ease-in-out" },
    );
    await hop?.finished.catch(() => undefined);
  }

  /** The page opens through a four-point star that grows from the box. */
  private async reveal(fast: boolean, tap: boolean) {
    const front = this.panels.get("front")?.querySelector<HTMLElement>(".ld-out");
    const pose = this.q("pose");
    const box = this.root.getBoundingClientRect();
    const r = front?.getBoundingClientRect();
    const cx = r ? r.left + r.width / 2 - box.left : box.width / 2;
    const cy = r ? r.top + r.height / 2 - box.top : box.height / 2;
    if (tap && pose) {
      const target = getComputedStyle(pose).transform;
      this.animate(
        pose,
        [
          { transform: target },
          { transform: `translateY(-12px) ${target}`, offset: 0.4 },
          { transform: target },
        ],
        { duration: 260, easing: "ease-in-out" },
      );
      await this.wait(150);
      if (this.gone()) return;
    }
    const far = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(box.width - cx, cy),
      Math.hypot(cx, box.height - cy),
      Math.hypot(box.width - cx, box.height - cy),
    );
    const max = (far / 0.314) * 1.08;
    const duration = fast ? 420 : 640;
    const frames: Keyframe[] = [];
    const steps = 12;
    for (let k = 0; k <= steps; k += 1) {
      const f = k / steps;
      // Slow start, fast middle, a soft end (expo in-out on the radius).
      const e =
        f === 0
          ? 0
          : f === 1
            ? 1
            : f < 0.5
              ? 2 ** (20 * f - 10) / 2
              : (2 - 2 ** (-20 * f + 10)) / 2;
      const radius = Math.max(0.5, max * e);
      const turn = (Math.PI / 4) * f;
      const star = starPoints(0, 0, radius).map(([x, y]) => {
        const rx = x * Math.cos(turn) - y * Math.sin(turn) + cx;
        const ry = x * Math.sin(turn) + y * Math.cos(turn) + cy;
        return `${px(rx)} ${px(ry)}`;
      });
      const w = px(box.width);
      const h = px(box.height);
      frames.push({
        clipPath: `polygon(evenodd, 0px 0px, ${w} 0px, ${w} ${h}, 0px ${h}, 0px 0px, ${star.join(", ")}, ${star[0] ?? "0px 0px"})`,
        offset: f,
      });
    }
    const iris = this.animate(this.host, frames, { duration, easing: "linear" });
    await iris?.finished.catch(() => undefined);
    if (this.gone()) return;
    this.onExited();
  }
}
