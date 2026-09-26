import gsap from "gsap";

import { finePointer, onPointer, pointer as sharedPointer } from "@/lib/motion/pointer";
import { isScrollLocked, onScrollLockChange } from "@/lib/scroll-lock";
import { isScrollIdle, trackScrollIdle } from "@/components/projects/stage/scroll-idle";

/**
 * The hero's play runs on one small spring solver: every system (letters,
 * shapes, background motifs) advances in the same fixed steps on the GSAP
 * ticker, then writes its transforms once per frame. The solver only runs
 * while something moves, and it parks (everything back to rest, asleep)
 * while the hero is offscreen, the tab is hidden or a scroll lock (the nav
 * menu) covers the page, so the resting hero costs nothing.
 */

/** Fixed solver step, seconds. */
export const DT = 1 / 120;
/** Consecutive calm steps before the solver sleeps (0.1 s). */
const CALM_STEPS = 12;
/** How far outside the hero the pointer still counts as near it, px. */
const NEAR_MARGIN = 260;
/** Scroll keeps the solver awake this long, since the smoother glides on. */
const SCROLL_GLIDE_MS = 900;

export type Spring = { x: number; v: number };
/** Stiffness and damping; the damping ratio is c / (2 * sqrt(k)). */
export type SpringConfig = readonly [k: number, c: number];

export const spring = (x = 0): Spring => ({ x, v: 0 });

export function step(s: Spring, [k, c]: SpringConfig, target: number) {
  s.v += (k * (target - s.x) - c * s.v) * DT;
  s.x += s.v * DT;
}

export function settled(s: Spring, target: number, eps = 0.01, veps = eps * 5) {
  return Math.abs(s.x - target) < eps && Math.abs(s.v) < veps;
}

export const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (t: number) => {
  const c = clamp(0, 1, t);
  return c * c * (3 - 2 * c);
};

/** Launch speed (px/s) that reaches `height` px under `gravity` px/s^2. */
export const launchSpeed = (height: number, gravity: number) => Math.sqrt(2 * gravity * height);

export type Setter = (value: number) => void;
export const setter = (el: Element, property: string, unit?: string) =>
  gsap.quickSetter(el, property, unit) as Setter;

/** The pointer in hero-local px, refreshed once per frame. */
export type StagePointer = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  /** A hovering pointer (mouse or pen) is over the page. */
  over: boolean;
  /** It moved since the previous frame (not just the page under it). */
  moved: boolean;
  /** Seconds since the previous frame. */
  dt: number;
};

export type StageSystem = {
  /** Once per frame, before the steps: read the pointer, start reactions. */
  frame?(): void;
  /** One fixed step. Returns true when everything it drives is at rest. */
  step(): boolean;
  /** Writes the current state to the DOM, once per frame. */
  write(): void;
  /** Re-reads rest geometry (first start, and after a resize). */
  measure?(): void;
  /** Drops every motion and writes the exact rest state. */
  park?(): void;
  /** Kills its tweens and restores the markup it changed. */
  destroy?(): void;
};

export type Stage = {
  root: HTMLElement;
  /** Hover-capable input: proximity and hover reactions are on. */
  fine: boolean;
  pointer: StagePointer;
  /** Seconds, from the ticker. */
  now(): number;
  /** Whether the hero can play right now (in view, tab shown, unlocked). */
  active(): boolean;
  /** A hover may start: the pointer really moved and the page isn't scrolling. */
  hoverAllowed(): boolean;
  wake(): void;
  /** Keeps the solver awake until the returned release is called. */
  hold(): () => void;
  add(system: StageSystem): void;
  onActiveChange(listener: (active: boolean) => void): () => void;
  destroy(): void;
};

/** Element offset inside `root` from layout alone: no transform counts. */
export function offsetIn(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

export function createStage(root: HTMLElement): Stage {
  const systems: StageSystem[] = [];
  const activeListeners = new Set<(active: boolean) => void>();
  const releaseScrollIdle = trackScrollIdle();
  const fine = finePointer();

  const local: StagePointer = {
    x: -1e4,
    y: -1e4,
    vx: 0,
    vy: 0,
    speed: 0,
    over: false,
    moved: false,
    dt: 1 / 60,
  };

  let alive = true;
  let awake = false;
  let acc = 0;
  let calm = 0;
  let holds = 0;
  let lastMoveSeen = 0;
  let lastTime = 0;
  let glideUntil = 0;
  let inView = true;
  let hidden = document.hidden;
  let locked = isScrollLocked();
  let wasActive = inView && !hidden && !locked;

  const active = () => alive && inView && !hidden && !locked;

  function readPointer(time: number) {
    const shared = sharedPointer();
    const rect = root.getBoundingClientRect();
    local.dt = lastTime ? Math.min(0.1, Math.max(0.001, time - lastTime)) : 1 / 60;
    lastTime = time;
    local.over = fine && shared.inside && shared.type !== "touch" && shared.x >= 0;
    local.x = shared.x - rect.left;
    local.y = shared.y - rect.top;
    local.vx = shared.vx;
    local.vy = shared.vy;
    local.speed = shared.speed;
    local.moved = shared.lastMove !== lastMoveSeen;
    lastMoveSeen = shared.lastMove;
    if (
      local.over &&
      (local.x < -NEAR_MARGIN ||
        local.y < -NEAR_MARGIN ||
        local.x > rect.width + NEAR_MARGIN ||
        local.y > rect.height + NEAR_MARGIN)
    ) {
      // Far away: nothing in the hero reacts to it.
      local.over = false;
    }
  }

  function tick(time: number, deltaMs: number) {
    readPointer(time);
    for (const system of systems) system.frame?.();
    acc += Math.min(deltaMs, 50) / 1000;
    while (acc >= DT) {
      acc -= DT;
      let allCalm = true;
      for (const system of systems) if (!system.step()) allCalm = false;
      calm = allCalm ? calm + 1 : 0;
    }
    for (const system of systems) system.write();
    const gliding = performance.now() < glideUntil;
    if (calm > CALM_STEPS && holds === 0 && !gliding && !local.moved) sleep();
  }

  function wake() {
    if (!active() || awake) return;
    awake = true;
    calm = 0;
    lastTime = 0;
    gsap.ticker.add(tick);
  }

  function sleep() {
    if (!awake) return;
    gsap.ticker.remove(tick);
    awake = false;
    acc = 0;
    calm = 0;
  }

  function park() {
    sleep();
    for (const system of systems) system.park?.();
  }

  function updateActive() {
    const now = active();
    if (now === wasActive) return;
    wasActive = now;
    if (!now) park();
    for (const listener of [...activeListeners]) listener(now);
  }

  const offPointer = onPointer((state) => {
    if (!alive || !active()) return;
    if (!fine && state.type !== "touch") return;
    const rect = root.getBoundingClientRect();
    if (
      state.x < rect.left - NEAR_MARGIN ||
      state.x > rect.right + NEAR_MARGIN ||
      state.y < rect.top - NEAR_MARGIN ||
      state.y > rect.bottom + NEAR_MARGIN
    ) {
      return;
    }
    wake();
  });

  const onScroll = () => {
    glideUntil = performance.now() + SCROLL_GLIDE_MS;
    if (sharedPointer().inside) wake();
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    updateActive();
  });
  observer.observe(root);

  const onVisibility = () => {
    hidden = document.hidden;
    updateActive();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const offLock = onScrollLockChange((value) => {
    locked = value;
    updateActive();
  });

  let resizeFrame = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      for (const system of systems) system.measure?.();
      wake();
    });
  };
  window.addEventListener("resize", onResize);

  return {
    root,
    fine,
    pointer: local,
    now: () => gsap.ticker.time,
    active,
    hoverAllowed: () => local.moved && isScrollIdle(),
    wake,
    hold() {
      holds++;
      wake();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds = Math.max(0, holds - 1);
      };
    },
    add(system) {
      systems.push(system);
      system.measure?.();
    },
    onActiveChange(listener) {
      activeListeners.add(listener);
      return () => {
        activeListeners.delete(listener);
      };
    },
    destroy() {
      if (!alive) return;
      park();
      alive = false;
      holds = 0;
      offPointer();
      offLock();
      releaseScrollIdle();
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      activeListeners.clear();
      // Last added, first undone: a later system may build on an earlier one.
      for (const system of [...systems].reverse()) system.destroy?.();
      systems.length = 0;
    },
  };
}
