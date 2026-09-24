import gsap from "gsap";

import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import { walkHeaderPalette } from "@/components/transition/project-zoom-colors";
import { getArticlesWorld } from "@/components/articles/world/world-registry";
import { noteArticleArrival } from "@/lib/article-transition";
import { PROJECT_THEMES, type ProjectPalette } from "@/lib/project-themes";
import { isScrollLocked } from "@/lib/scroll-lock";

import type { DetailNext } from "./detail-data";
import {
  createFlood,
  discardFlood,
  holdFlood,
  markFloodNavigated,
  paintFlood,
  type FloodParts,
} from "./next-flood";

/**
 * The end of the article pulls the next one in, after unseen.co's detail
 * pages (and our project pages' accumulator):
 *
 * - Only input after reaching the bottom counts: wheel travel adds to a
 *   progress of two viewport heights, a touch or mouse drag of 400 px fills
 *   it, and Arrow Down, Page Down, Space and End add steps. 75 ms after the
 *   input stops it drains back to 0 over a second (power2.in); scrolling
 *   back up cancels it at once. The visible progress follows at 0.2 a
 *   frame, and its lag becomes a velocity that bends the dome.
 * - Progress drives: a dome of the next article's background rising from
 *   the bottom (its apex half the screen at 100%), "Next article" rolling
 *   out of its mask, the next title travelling two thirds of the way toward
 *   the hero title's place, and the bar growing from its centre. The flood
 *   carries a copy of the texts in the next palette, clipped by the same
 *   dome, so they recolour exactly where it passes.
 * - At 100%, or on a click or Enter (the threshold is a real link), the
 *   hand-off: a 0.7 s power3.inOut flood fills the screen, the title lands
 *   where the next page's hero title renders, the header walks to the next
 *   palette and the world to the next theme; then the arrival note and the
 *   navigation. The next page reads the note while rendering (title in
 *   place) and fades the flood away as the rest of its hero appears.
 *
 * Reduced motion: none of this runs; the threshold is a plain link.
 */

const WHEEL_SPAN_VH = 2;
const DRAG_SPAN = 400;
const DECAY_DELAY_MS = 75;
const KEY_DECAY_DELAY_MS = 450;
const KEY_STEP: Record<string, number> = {
  ArrowDown: 0.14,
  PageDown: 0.34,
  " ": 0.34,
  End: 0.34,
};
const HANDOFF_SECONDS = 0.7;
const DOME_SAMPLES = 36;
// Keys typed into these keep their own meaning.
const KEY_OWNERS =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='listbox'], [role='menu'], [role='slider']";

type Parts = {
  inner: HTMLElement;
  title: HTMLElement | null;
  label: HTMLElement | null;
  hint: HTMLElement | null;
  bar: HTMLElement | null;
};

type Visual = {
  progress: number;
  adjust: number;
  velocity: number;
  footer: number;
  hint: number;
  bar: number;
};

function ease(k: number, dt: number) {
  return 1 - (1 - k) ** (60 * dt);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

const sineOut = (t: number) => Math.sin((t * Math.PI) / 2);
/** GSAP's power4.out (a quintic). */
const power4Out = (t: number) => 1 - (1 - t) ** 5;
const smoothstep = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

/**
 * The dome's edge as a clip-path polygon, in viewport px. The fill covers
 * uv (x right, y up) where y - bend(x) <= progress * pct(x, y), with
 * pct = smoothstep(1 - |uv - centre| * adjust): higher in the middle,
 * flattening to a full rectangle as adjust reaches 0.
 */
export function domePolygon(width: number, height: number, visual: Visual) {
  const { progress, adjust, velocity } = visual;
  if (progress >= 0.999 && adjust <= 0.001) return "inset(0)";
  const points: string[] = [`0px ${height}px`];
  for (let index = 0; index <= DOME_SAMPLES; index += 1) {
    const x = index / DOME_SAMPLES;
    const bend = Math.sin(x * Math.PI) * velocity * 0.5;
    let y = 0;
    for (let step = 0; step < 6; step += 1) {
      const d = Math.hypot(x - 0.5, y - 0.5);
      y = bend + progress * smoothstep(1 - d * adjust);
    }
    const top = height - clamp(y) * height;
    points.push(`${(x * width).toFixed(1)}px ${top.toFixed(1)}px`);
  }
  points.push(`${width}px ${height}px`);
  return `polygon(${points.join(",")})`;
}

export type NextThresholdOptions = {
  section: HTMLAnchorElement;
  heroTitle: HTMLElement | null;
  next: DetailNext;
  /** The page's own path: a hand-off that finishes after the visitor left stays put. */
  pathname: string;
  navigate: (href: string) => void;
  prefetch: (href: string) => void;
};

export class NextThreshold {
  private readonly href: string;
  private readonly base: Parts;
  private flood: FloodParts | null = null;
  private target = 0;
  private smooth = 0;
  private velocity = 0;
  private wheel = 0;
  private drag = 0;
  private decayTimer = 0;
  private decay: gsap.core.Tween | null = null;
  private handoff: gsap.core.Tween | null = null;
  private committed = false;
  private prefetched = false;
  private offFrame: (() => void) | null = null;
  private readonly cleanups: (() => void)[] = [];
  private touchY: number | null = null;
  private pointer: { id: number; y: number; moved: number } | null = null;
  private suppressClick = false;
  private travel = { x: 0, y: 0 };
  private visible = false;
  private disposed = false;
  private readonly visual: Visual = {
    progress: 0,
    adjust: 1,
    velocity: 0,
    footer: 0,
    hint: 0,
    bar: 0,
  };

  constructor(private readonly o: NextThresholdOptions) {
    this.href = `/articles/${o.next.slug}`;
    const q = <T extends HTMLElement>(selector: string) => o.section.querySelector<T>(selector);
    const inner = q<HTMLElement>("[data-ad-next-inner]");
    if (!inner) throw new Error("next threshold markup missing");
    this.base = {
      inner,
      title: q("[data-ad-next-title]"),
      label: q("[data-ad-next-label]"),
      hint: q("[data-ad-next-hint]"),
      bar: q("[data-ad-next-bar]"),
    };
  }

  start() {
    const add = <K extends keyof WindowEventMap>(
      type: K,
      listener: (event: WindowEventMap[K]) => void,
      options?: AddEventListenerOptions | boolean,
    ) => {
      window.addEventListener(type, listener, options);
      this.cleanups.push(() => window.removeEventListener(type, listener, options));
    };
    add("wheel", this.onWheel, { passive: true });
    add("keydown", this.onKey);
    add("touchstart", this.onTouchStart, { passive: true });
    add("touchmove", this.onTouchMove, { passive: true });
    add("touchend", this.onTouchEnd, { passive: true });
    add("touchcancel", this.onTouchEnd, { passive: true });
    // Before the route curtain's (document) and the articles transitions'
    // listeners: this link plays the page's own hand-off.
    add("click", this.onClick, true);
    const section = this.o.section;
    const onPointerDown = (event: PointerEvent) => this.onPointerDown(event);
    const onPointerMove = (event: PointerEvent) => this.onPointerMove(event);
    const onPointerUp = (event: PointerEvent) => this.onPointerUp(event);
    const onDragStart = (event: DragEvent) => event.preventDefault();
    section.addEventListener("pointerdown", onPointerDown);
    section.addEventListener("pointermove", onPointerMove);
    section.addEventListener("pointerup", onPointerUp);
    section.addEventListener("pointercancel", onPointerUp);
    section.addEventListener("dragstart", onDragStart);
    this.cleanups.push(() => {
      section.removeEventListener("pointerdown", onPointerDown);
      section.removeEventListener("pointermove", onPointerMove);
      section.removeEventListener("pointerup", onPointerUp);
      section.removeEventListener("pointercancel", onPointerUp);
      section.removeEventListener("dragstart", onDragStart);
    });
    this.offFrame = addFrameCallback("render", this.tick);
  }

  dispose() {
    this.disposed = true;
    this.offFrame?.();
    this.offFrame = null;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    window.clearTimeout(this.decayTimer);
    this.decay?.kill();
    // A committed hand-off belongs to next-flood.ts now; a pull that never
    // committed takes its flood with it.
    if (!this.committed) {
      this.handoff?.kill();
      if (this.flood) discardFlood(this.flood);
    }
    this.flood = null;
  }

  /** The screen is at the very bottom of the page (the smooth scroll within 10 px). */
  private atBottom() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return window.scrollY >= max - 10;
  }

  private reset() {
    this.target = 0;
    this.wheel = 0;
    this.drag = 0;
    this.decay?.kill();
    window.clearTimeout(this.decayTimer);
  }

  private scheduleDecay(delay = DECAY_DELAY_MS) {
    this.decay?.kill();
    window.clearTimeout(this.decayTimer);
    this.decayTimer = window.setTimeout(() => {
      const state = { t: this.target, w: this.wheel, d: this.drag };
      this.decay = gsap.to(state, {
        t: 0,
        w: 0,
        d: 0,
        duration: 1,
        ease: "power2.in",
        onUpdate: () => {
          this.target = state.t;
          this.wheel = state.w;
          this.drag = state.d;
        },
      });
    }, delay);
  }

  private blocked() {
    // Another owner holds the page (the nav menu): the threshold takes no input.
    return this.committed || this.disposed || isScrollLocked();
  }

  private readonly onWheel = (event: WheelEvent) => {
    if (this.blocked() || event.ctrlKey) return;
    if (!this.atBottom()) {
      this.reset();
      return;
    }
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * unit;
    this.scheduleDecay();
    this.wheel = Math.max(0, this.wheel + delta);
    this.target = this.wheel / (WHEEL_SPAN_VH * window.innerHeight);
  };

  private readonly onKey = (event: KeyboardEvent) => {
    // Not defaultPrevented: the smooth scroller takes the scroll keys first.
    if (this.blocked() || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(KEY_OWNERS)) return;
    const step = event.shiftKey && event.key === " " ? -0.34 : KEY_STEP[event.key];
    if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home" || step < 0) {
      this.reset();
      return;
    }
    if (!step || !this.atBottom()) return;
    this.scheduleDecay(KEY_DECAY_DELAY_MS);
    this.target = Math.min(1.2, this.target + step);
  };

  private readonly onTouchStart = (event: TouchEvent) => {
    this.touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  };

  private readonly onTouchMove = (event: TouchEvent) => {
    if (this.touchY === null || event.touches.length !== 1 || this.blocked()) return;
    const y = event.touches[0].clientY;
    const dy = this.touchY - y;
    this.touchY = y;
    if (!this.atBottom()) {
      this.reset();
      return;
    }
    this.scheduleDecay();
    this.drag = Math.max(0, this.drag + dy);
    this.target = this.drag / DRAG_SPAN;
  };

  private readonly onTouchEnd = () => {
    this.touchY = null;
  };

  private onPointerDown(event: PointerEvent) {
    if (event.pointerType !== "mouse" || event.button !== 0 || this.blocked()) return;
    this.pointer = { id: event.pointerId, y: event.clientY, moved: 0 };
    this.suppressClick = false;
  }

  private onPointerMove(event: PointerEvent) {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId || this.blocked()) return;
    const dy = pointer.y - event.clientY;
    pointer.y = event.clientY;
    pointer.moved += Math.abs(dy);
    if (pointer.moved > 6) {
      this.suppressClick = true;
      try {
        this.o.section.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety (the drag keeps counting outside the link).
      }
    }
    if (!this.atBottom()) return;
    this.scheduleDecay();
    this.drag = Math.max(0, this.drag + dy);
    this.target = this.drag / DRAG_SPAN;
  }

  private onPointerUp(event: PointerEvent) {
    if (this.pointer?.id !== event.pointerId) return;
    this.pointer = null;
  }

  private readonly onClick = (event: MouseEvent) => {
    const section = this.o.section;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Node) || !section.contains(event.target)) return;
    event.preventDefault();
    if (this.suppressClick) {
      // The end of a drag, not a click.
      this.suppressClick = false;
      return;
    }
    this.commit();
  };

  // -------------------------------------------------------------- frame

  private readonly tick = (_time: number, dt: number) => {
    if (this.disposed || this.committed) return;
    if (!this.prefetched && this.o.section.getBoundingClientRect().top < window.innerHeight * 1.6) {
      this.prefetched = true;
      this.o.prefetch(this.href);
    }
    this.smooth += (this.target - this.smooth) * ease(0.2, dt);
    if (Math.abs(this.target - this.smooth) < 1e-4) this.smooth = this.target;
    const delta = this.target - this.smooth;
    this.velocity = clamp(this.velocity + (delta - this.velocity) * ease(0.1, dt), -0.1, 2);
    if (this.smooth >= 1) {
      this.commit();
      return;
    }
    const p = clamp(this.smooth);
    const v = this.visual;
    v.progress = 0.5 * sineOut(p);
    v.adjust = 1 - 0.1 * power4Out(p);
    v.velocity = this.velocity;
    v.footer = 0.2 * sineOut(p);
    v.bar = sineOut(p);
    v.hint = 0;
    this.render();
  };

  private measureTravel() {
    // The hero title's place once the next page has scrolled to the top:
    // the same layout, so its document position here.
    const title = this.base.title;
    const hero = this.o.heroTitle;
    if (!title || !hero) return;
    const from = title.getBoundingClientRect();
    const scrollY = window.scrollY;
    const to = hero.getBoundingClientRect();
    // Our own transform is part of `from`: take it out.
    const current = gsap.getProperty(title, "y") as number;
    const currentX = gsap.getProperty(title, "x") as number;
    this.travel = {
      x: to.left - (from.left - currentX),
      y: to.top + scrollY - (from.top - current),
    };
  }

  private ensureFlood() {
    if (this.flood) return this.flood;
    this.flood = createFlood(this.base.inner, this.nextPalette());
    return this.flood;
  }

  private nextPalette(): ProjectPalette {
    const dark = document.documentElement.classList.contains("dark");
    return PROJECT_THEMES[this.o.next.themeId][dark ? "dark" : "light"];
  }

  private render() {
    const v = this.visual;
    const showing = v.progress > 0.0008 || this.committed;
    if (!showing) {
      if (this.visible) {
        this.visible = false;
        if (this.flood) this.flood.root.style.visibility = "hidden";
        this.writeTexts(this.base, 0, 0, 0, 0);
      }
      return;
    }
    const flood = this.ensureFlood();
    if (!this.visible) {
      this.visible = true;
      flood.root.style.visibility = "visible";
      this.measureTravel();
    }
    // The copy sits exactly over the threshold's own block.
    const rect = this.base.inner.getBoundingClientRect();
    const inner = flood.inner.style;
    inner.left = `${rect.left}px`;
    inner.top = `${rect.top}px`;
    inner.width = `${rect.width}px`;
    inner.height = `${rect.height}px`;
    flood.root.style.clipPath = domePolygon(window.innerWidth, window.innerHeight, v);

    const titleT = power4Out(clamp(v.footer));
    const labelT = power4Out(clamp(v.footer / 0.25));
    this.writeTexts(this.base, titleT, labelT, v.hint, v.bar);
    this.writeTexts(flood, titleT, labelT, v.hint, v.bar);
  }

  private writeTexts(parts: Parts, titleT: number, labelT: number, hintT: number, bar: number) {
    if (parts.title) {
      gsap.set(parts.title, { x: this.travel.x * titleT, y: this.travel.y * titleT });
    }
    const label = parts.label?.firstElementChild;
    if (label) gsap.set(label, { yPercent: -118 * labelT });
    const hint = parts.hint?.firstElementChild;
    if (hint) gsap.set(hint, { yPercent: -118 * hintT });
    if (parts.bar) gsap.set(parts.bar, { scaleX: bar });
  }

  // -------------------------------------------------------------- hand-off

  private commit() {
    if (this.committed || this.disposed) return;
    this.committed = true;
    this.decay?.kill();
    window.clearTimeout(this.decayTimer);
    this.o.prefetch(this.href);

    const flood = this.ensureFlood();
    // The scheme is read now: the visitor may have switched since.
    const palette = this.nextPalette();
    paintFlood(flood.root, palette);
    if (!this.visible) {
      this.visible = true;
      flood.root.style.visibility = "visible";
      this.measureTravel();
    }
    const walk = walkHeaderPalette(palette);
    const theme = PROJECT_THEMES[this.o.next.themeId];
    getArticlesWorld()?.setTheme({ light: theme.light, dark: theme.dark }, HANDOFF_SECONDS);

    const held = holdFlood({
      slug: this.o.next.slug,
      href: this.href,
      parts: flood,
      walk,
      onGiveUp: (href) => window.location.assign(href),
    });
    if (!held) {
      walk.release();
      return;
    }

    const v = this.visual;
    const from = { ...v };
    const state = { t: 0 };
    this.handoff = gsap.to(state, {
      t: 1,
      duration: HANDOFF_SECONDS,
      ease: "power3.inOut",
      onUpdate: () => {
        const t = state.t;
        v.progress = from.progress + (1 - from.progress) * t;
        v.adjust = from.adjust * (1 - t);
        v.velocity = from.velocity * (1 - t);
        v.footer = from.footer + (1 - from.footer) * t;
        v.bar = from.bar * (1 - t);
        v.hint = clamp(t * 1.4);
        // Lands a little early: the header eases its colours in CSS
        // (docs/animation-system.md gotcha #23).
        walk.set(clamp((t - 0.05) / 0.75));
        this.render();
      },
      onComplete: () => this.navigate(),
    });
  }

  private navigate() {
    // The visitor went elsewhere during the flood (browser Back): stay put.
    if (window.location.pathname !== this.o.pathname) return;
    noteArticleArrival({ kind: "next", pathname: this.href, slug: this.o.next.slug });
    this.o.navigate(this.href);
    markFloodNavigated();
  }
}
