import gsap from "gsap";

import type { WorldTransitionApi } from "@/components/articles/world/world-api";
import { portalPalette, type PortalPalette } from "@/components/transition/articles-portal-palette";
import { parseColor } from "@/components/transition/project-zoom-colors";

/**
 * The portal's choreography and its DOM half (dynamic-imported by
 * articles-portal-controller.ts when a navigation into or out of the
 * library is near; nothing here ships in the root chunk).
 *
 * Into the library, "the page becomes a page":
 * - the real page lifts off the screen like a sheet of paper (a 3D tilt
 *   and scale on the page wrapper and every canvas drawn over it), its
 *   colours draining toward paper, light leaking in at its edges;
 * - behind it the library's arch opens in white-gold light (a void rimmed
 *   with blue fire in the dark);
 * - paper fragments and motes rise past the camera, and a wall of
 *   luminous fog (ink in the dark) climbs from below until the screen is
 *   nothing but fog. The route changes only then;
 * - on the other side the fog thins from the heart of the screen outward
 *   while the library's camera ascends from far below and behind into its
 *   place, pages still streaming upward past it.
 *
 * Back to the real world:
 * - the library's camera falls away backward and down while its fog
 *   floods in and pages fall like leaves;
 * - one sheet of paper tumbles out of the fog and flies at the camera
 *   until it fills the screen. The route changes under it;
 * - on the destination the sheet dissolves from its centre outward like
 *   wet paper, the page underneath coming back into focus and colour.
 *
 * The front layer (fog, stream, sheet) is drawn by a renderer: WebGL2
 * (articles-portal-gl.ts) on hardware that has it, or the DOM one below,
 * which plays a shorter version of the same beats (CI, software
 * renderers, a lost context). The page lift, the arch and the landing are
 * DOM on both.
 *
 * Every inline style the stage writes on the site's own elements is saved
 * first and restored exactly (never through `cssText`: ScrollSmoother owns
 * the wrapper's style attribute on the homepage and writes its own copy
 * back when it is killed).
 */

export type PortalDirection = "in" | "out";
export type PortalTier = "high" | "low";

export type PortalFrontScene = {
  direction: PortalDirection;
  dark: boolean;
  palette: PortalPalette;
  tier: PortalTier;
  /** The portal's full-screen layer: the front renderer puts its pieces in it. */
  root: HTMLElement;
};

export type PortalFrontFrame = {
  /** Seconds since the run began (noise flow, flicker). */
  time: number;
  /** The particles' own clock: it runs faster while the portal pulls. */
  stream: number;
  /** In: the fog wall, 0 below the screen to 1 covering it. */
  rise: number;
  /** In: the fog thinning on arrival, 0 to 1 gone. */
  thin: number;
  /** Out: a plain fog flood over a library the world doesn't draw. */
  flood: number;
  /** In: the ghost of the library's window glowing in the fog, 0..1. */
  ghost: number;
  /** The share of the stream alive, and its opacity. */
  amount: number;
  fade: number;
  /** Out: the flying sheet, 0 far away to 1 filling the screen. */
  sheet: number;
  /** Out: the wet dissolve, 0 whole to 1 gone. */
  hole: number;
};

export interface PortalFront {
  readonly kind: "gl" | "dom";
  readonly isLost: boolean;
  begin(scene: PortalFrontScene): void;
  draw(frame: PortalFrontFrame): void;
  resize(): void;
  end(): void;
}

export type PortalStageSetup = {
  direction: PortalDirection;
  /** Browser back or forward: the screen is covered at once, no lift. */
  instant: boolean;
  dark: boolean;
  tier: PortalTier;
  root: HTMLElement;
  /** The WebGL front, when the device has one ready; else the DOM front plays. */
  gl: PortalFront | null;
};

export interface PortalStage {
  readonly renderer: "gl" | "dom";
  /** Seconds from the click until the screen is covered (0 for an instant cover). */
  readonly coverSeconds: number;
  /** Seconds of the reveal, and the point in it where the page is plainly visible. */
  readonly revealSeconds: number;
  readonly revealSignal: number;
  /**
   * The share of the reveal after which the page is the visitor's again
   * (the controller releases input there). The library's camera has
   * settled by then; only the last motes still fade.
   */
  readonly interactiveShare: number;
  cover(t: number, dt: number, world: WorldTransitionApi | null): void;
  /** Fully covered, waiting for the destination. */
  hold(dt: number, world: WorldTransitionApi | null): void;
  /** The screen is covered: gives the site's own elements back before the route changes. */
  release(): void;
  reveal(t: number, dt: number, world: WorldTransitionApi | null): void;
  /** Whether the front renderer died mid-run (the controller covers for it). */
  readonly lost: boolean;
  resize(): void;
  end(): void;
}

// ------------------------------------------------------------------ timing

const ease = {
  in2: gsap.parseEase("power2.in"),
  out2: gsap.parseEase("power2.out"),
  inOut2: gsap.parseEase("power2.inOut"),
  out3: gsap.parseEase("power3.out"),
  inOut3: gsap.parseEase("power3.inOut"),
  in1: gsap.parseEase("power1.in"),
  out1: gsap.parseEase("power1.out"),
  inOut1: gsap.parseEase("power1.inOut"),
};

/** 0 before `from`, 1 after `to`, linear between. */
function fit(t: number, from: number, to: number) {
  if (to <= from) return t >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

type Timing = {
  cover: number;
  reveal: number;
  signal: number;
};

const TIMING: Record<"gl" | "dom", Record<PortalDirection, Timing>> = {
  // About 2.6 s in (1.05 + the wait + 1.4) and 2.3 s out (1.25 + 1.0).
  gl: {
    in: { cover: 1.05, reveal: 1.4, signal: 0.55 },
    out: { cover: 1.25, reveal: 1.0, signal: 0.4 },
  },
  // Shorter still: in about 1.2 s plus the wait, out about 1.15 s plus
  // the wait (the e2e suite runs here, on a software renderer).
  dom: {
    in: { cover: 0.62, reveal: 0.6, signal: 0.26 },
    out: { cover: 0.6, reveal: 0.55, signal: 0.22 },
  },
};

/** See PortalStage.interactiveShare. */
const INTERACTIVE_SHARE = 0.75;

/** Where the library's camera starts on the way in, and ends on the way out. */
const ASCENT = { lift: -0.8, dolly: 2600 };
const FALL = { lift: -0.5, dolly: 3000 };

// ------------------------------------------------------------------ styles

type Saved = Array<[string, string, string]>;

function save(element: HTMLElement, properties: readonly string[]): Saved {
  return properties.map((name) => [
    name,
    element.style.getPropertyValue(name),
    element.style.getPropertyPriority(name),
  ]);
}

function restore(element: HTMLElement, saved: Saved) {
  for (const [name, value, priority] of saved) {
    if (value) element.style.setProperty(name, value, priority);
    else element.style.removeProperty(name);
  }
}

function fixedLayer(z: number): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  element.dataset.articlesPortalLayer = "";
  Object.assign(element.style, {
    position: "fixed",
    inset: "0",
    zIndex: String(z),
    pointerEvents: "none",
  });
  return element;
}

function hexA(hex: string, alpha: number) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return `rgb(${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255} / ${alpha})`;
}

/** A soft paper grain as a tiny SVG turbulence tile. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.45 0 0 0 0 0.38 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// ------------------------------------------------------------------ the page sheet

const SHEET_PROPERTIES = [
  "transform",
  "transform-origin",
  "clip-path",
  "will-change",
  "backface-visibility",
] as const;
const PIN_PROPERTIES = ["top", "left", "right", "bottom", "width", "height", "box-sizing"] as const;
const SHEET_RADIUS = 22;

/**
 * Whether a computed style makes its element the containing block of its
 * fixed-position descendants (they then already move with it, not with the
 * viewport).
 */
function holdsFixed(style: CSSStyleDeclaration) {
  return (
    style.transform !== "none" ||
    (style.translate && style.translate !== "none") ||
    (style.rotate && style.rotate !== "none") ||
    (style.scale && style.scale !== "none") ||
    style.perspective !== "none" ||
    style.filter !== "none" ||
    (style.backdropFilter && style.backdropFilter !== "none") ||
    /paint|layout|strict|content/.test(style.contain) ||
    /transform|filter|perspective/.test(style.willChange) ||
    (style.containerType && style.containerType !== "normal") ||
    style.contentVisibility === "auto" ||
    style.contentVisibility === "hidden"
  );
}

/** The outermost fixed-position elements under `root` whose containing block is the viewport. */
function viewportFixed(root: HTMLElement) {
  const found: HTMLElement[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const style = getComputedStyle(node as Element);
      if (style.display === "none") return NodeFilter.FILTER_REJECT;
      if (style.position === "fixed") {
        if (node instanceof HTMLElement) found.push(node);
        return NodeFilter.FILTER_REJECT;
      }
      if (holdsFixed(style)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_SKIP;
    },
  });
  while (walker.nextNode()) {
    // Every node is skipped or rejected: the walk only collects.
  }
  return found;
}

type SheetPose = {
  x: number;
  y: number;
  tiltX: number;
  tiltY: number;
  tiltZ: number;
  scale: number;
  /** Colour drain toward paper, 0..1. */
  drain: number;
  /** Light leaking in at the edges, 0..1. */
  leak: number;
};

/**
 * The page on screen, lifted like a sheet of paper. The sheet is several
 * layers moved as one: a paper base in the page's own colour (short pages
 * end before the viewport does), the page wrapper, every canvas the page
 * draws over itself (the project covers, the cursor wake) and a veil that
 * drains its colours. All of them get the same transform about the
 * viewport's centre and the same rounded clip, so they stay registered.
 *
 * A transform on the wrapper makes it the containing block of its fixed
 * descendants (the project page's stage, a visible back-to-top button),
 * which would throw them to the top of the document: those are pinned to
 * where they already are, in the wrapper's own coordinates, for the length
 * of the lift.
 */
class PageSheet {
  private readonly layers: Array<{ element: HTMLElement; saved: Saved }> = [];
  private readonly pins: Array<{ element: HTMLElement; saved: Saved }> = [];
  private readonly base = fixedLayer(-1);
  private readonly veil = fixedLayer(46);
  private readonly wash = document.createElement("div");
  private readonly rim = document.createElement("div");
  private readonly canvases: Array<{ element: HTMLElement; saved: Saved }> = [];
  private body: Saved | null = null;
  private readonly perspective: number;
  private disposed = false;

  constructor(palette: PortalPalette, dark: boolean) {
    const html = document.documentElement;
    const width = html.clientWidth || window.innerWidth;
    const height = window.innerHeight;
    this.perspective = Math.max(width, height) * 1.15;
    // Everything it changes is recorded as it goes, so a failure half way
    // gives back exactly what was taken.
    try {
      this.mount(palette, dark, width, height);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private mount(palette: PortalPalette, dark: boolean, width: number, height: number) {
    const html = document.documentElement;
    const wrapper = document.getElementById("smooth-wrapper");

    // A themed page paints the same colour on <html> and <body>, and the
    // body's own background would then hide the arch behind the sheet.
    const bodyStyle = getComputedStyle(document.body);
    const htmlColor = parseColor(getComputedStyle(html).backgroundColor);
    const bodyColor = parseColor(bodyStyle.backgroundColor);
    const paper =
      bodyColor && bodyColor.alpha > 0
        ? bodyStyle.backgroundColor
        : htmlColor && htmlColor.alpha > 0
          ? getComputedStyle(html).backgroundColor
          : palette.paper;
    if (htmlColor && htmlColor.alpha > 0) {
      this.body = save(document.body, ["background"]);
      document.body.style.setProperty("background", "transparent");
    }

    this.base.style.background = paper;
    document.body.appendChild(this.base);
    this.addLayer(this.base, "50% 50%", `inset(0 round ${SHEET_RADIUS}px)`);

    if (wrapper) {
      const box = wrapper.getBoundingClientRect();
      // Pin before the transform lands, while their boxes still read true.
      for (const element of viewportFixed(wrapper)) this.pin(element, box);
      const top = Math.max(0, -box.top);
      const left = Math.max(0, -box.left);
      const bottom = Math.max(0, box.bottom - height);
      const right = Math.max(0, box.right - width);
      this.addLayer(
        wrapper,
        `${width / 2 - box.left}px ${height / 2 - box.top}px`,
        `inset(${top}px ${right}px ${bottom}px ${left}px round ${SHEET_RADIUS}px)`,
      );
    }

    for (const canvas of document.querySelectorAll<HTMLElement>("body > canvas")) {
      if (canvas.hasAttribute("data-articles-world-canvas")) continue;
      this.canvases.push({ element: canvas, saved: save(canvas, ["opacity"]) });
      this.addLayer(canvas, "50% 50%", `inset(0 round ${SHEET_RADIUS}px)`);
    }

    // The veil: paper washing over the page, and light at its edges.
    Object.assign(this.wash.style, {
      position: "absolute",
      inset: "0",
      opacity: "0",
      background: `${GRAIN}, ${palette.paper}`,
      backgroundBlendMode: dark ? "soft-light" : "multiply",
    });
    const leak = dark ? palette.glow : palette.halo;
    Object.assign(this.rim.style, {
      position: "absolute",
      inset: "0",
      opacity: "0",
      boxShadow: `inset 0 0 ${Math.round(Math.min(width, height) * 0.09)}px ${hexA(leak, 0.95)}, inset 0 0 ${Math.round(Math.min(width, height) * 0.02)}px ${hexA(palette.rim, 1)}`,
    });
    this.veil.append(this.wash, this.rim);
    document.body.appendChild(this.veil);
    this.addLayer(this.veil, "50% 50%", `inset(0 round ${SHEET_RADIUS}px)`);
  }

  apply(pose: SheetPose) {
    if (this.disposed) return;
    const transform =
      `perspective(${this.perspective.toFixed(0)}px) ` +
      `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, 0) ` +
      `rotateX(${pose.tiltX.toFixed(3)}deg) rotateY(${pose.tiltY.toFixed(3)}deg) ` +
      `rotateZ(${pose.tiltZ.toFixed(3)}deg) scale(${pose.scale.toFixed(4)})`;
    for (const { element } of this.layers) element.style.setProperty("transform", transform);
    this.wash.style.opacity = (pose.drain * 0.8).toFixed(3);
    this.rim.style.opacity = pose.leak.toFixed(3);
    // A canvas over the page (WebGL covers) drains with it.
    const faded = (1 - pose.drain * 0.55).toFixed(3);
    for (const { element } of this.canvases) element.style.setProperty("opacity", faded);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const { element, saved } of this.layers) restore(element, saved);
    for (const { element, saved } of this.canvases) restore(element, saved);
    for (const { element, saved } of this.pins) restore(element, saved);
    if (this.body) restore(document.body, this.body);
    this.base.remove();
    this.veil.remove();
  }

  private addLayer(element: HTMLElement, origin: string, clip: string) {
    this.layers.push({ element, saved: save(element, SHEET_PROPERTIES) });
    element.style.setProperty("transform-origin", origin);
    element.style.setProperty("clip-path", clip);
    element.style.setProperty("will-change", "transform");
    element.style.setProperty("backface-visibility", "hidden");
  }

  /** Keeps a viewport-fixed element where it is once the wrapper holds it. */
  private pin(element: HTMLElement, box: DOMRect) {
    const style = getComputedStyle(element);
    const top = Number.parseFloat(style.top);
    const left = Number.parseFloat(style.left);
    if (!Number.isFinite(top) || !Number.isFinite(left)) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    this.pins.push({ element, saved: save(element, PIN_PROPERTIES) });
    element.style.setProperty("box-sizing", "border-box");
    element.style.setProperty("top", `${top - box.top}px`);
    element.style.setProperty("left", `${left - box.left}px`);
    element.style.setProperty("right", "auto");
    element.style.setProperty("bottom", "auto");
    element.style.setProperty("width", `${width}px`);
    element.style.setProperty("height", `${height}px`);
  }
}

// ------------------------------------------------------------------ the arch

/**
 * What waits behind the page: the library's arch. In the light, a pearl
 * fog with white-gold light pouring through an arch; in the dark, a void
 * with an arch of blue fire. Sits under the page (z-index -1), so it shows
 * only around the lifted sheet.
 */
class Arch {
  private readonly root: HTMLElement;
  private readonly arch: HTMLElement;
  private readonly halo: HTMLElement;
  private readonly rays: HTMLElement;
  private readonly dark: boolean;

  constructor(palette: PortalPalette, dark: boolean) {
    this.dark = dark;
    this.root = fixedLayer(-1);
    Object.assign(this.root.style, { background: palette.fog, overflow: "hidden" });
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // A little wider than the lifted sheet, its round head rising just
    // under the header: the sheet floats in the arch's light.
    // (On a wide screen its head flattens into a vault rather than hiding
    // behind the sheet.)
    const width = vw * 0.9;
    const top = vh * 0.035;
    const head = Math.min(width / 2, vh * 0.42);
    const diagonal = Math.hypot(vw, vh);

    this.halo = document.createElement("div");
    Object.assign(this.halo.style, {
      position: "absolute",
      left: "50%",
      top: `${-vh * 0.25}px`,
      width: `${width * 1.7}px`,
      height: `${vh * 1.6}px`,
      marginLeft: `${-width * 0.85}px`,
      borderRadius: "50%",
      background: dark
        ? `radial-gradient(closest-side, ${hexA(palette.halo, 0.5)}, ${hexA(palette.halo, 0.12)} 55%, transparent)`
        : `radial-gradient(closest-side, ${hexA(palette.glow, 1)}, ${hexA(palette.halo, 0.6)} 45%, transparent)`,
      opacity: "0",
      willChange: "transform, opacity",
    });

    this.rays = document.createElement("div");
    Object.assign(this.rays.style, {
      position: "absolute",
      left: "50%",
      top: `${top + head}px`,
      width: `${diagonal * 1.8}px`,
      height: `${diagonal * 1.8}px`,
      marginLeft: `${-diagonal * 0.9}px`,
      marginTop: `${-diagonal * 0.9}px`,
      borderRadius: "50%",
      background: `repeating-conic-gradient(from 0deg, ${hexA(dark ? palette.glow : palette.rim, dark ? 0.16 : 0.75)} 0deg 1.6deg, transparent 1.6deg 7deg)`,
      opacity: "0",
      mixBlendMode: dark ? "screen" : "normal",
      willChange: "transform, opacity",
    });
    const rayMask = "radial-gradient(closest-side, #000 4%, transparent 62%)";
    this.rays.style.setProperty("mask-image", rayMask);
    this.rays.style.setProperty("-webkit-mask-image", rayMask);

    this.arch = document.createElement("div");
    Object.assign(this.arch.style, {
      position: "absolute",
      left: "50%",
      top: `${top}px`,
      bottom: `${-vh * 0.05}px`,
      width: `${width}px`,
      marginLeft: `${-width / 2}px`,
      borderRadius: `${width / 2}px ${width / 2}px 0 0 / ${head}px ${head}px 0 0`,
      transformOrigin: "50% 100%",
      opacity: "0",
      willChange: "transform, opacity",
      background: dark
        ? `radial-gradient(90% 70% at 50% 35%, #000 55%, ${hexA(palette.halo, 0.4)} 100%)`
        : `radial-gradient(80% 70% at 50% 36%, #FFFFFF 0%, ${palette.glow} 38%, ${hexA(palette.halo, 0.95)} 82%, ${hexA(palette.halo, 0.75)} 100%)`,
      boxShadow: dark
        ? `0 0 0 2px ${hexA(palette.rim, 0.95)}, 0 0 20px 5px ${hexA(palette.glow, 0.95)}, 0 0 80px 22px ${hexA(palette.halo, 0.7)}, inset 0 0 50px 12px ${hexA(palette.halo, 0.6)}`
        : `0 0 0 2px ${hexA(palette.rim, 1)}, 0 0 70px 24px ${hexA(palette.glow, 1)}, 0 0 200px 80px ${hexA(palette.halo, 0.6)}`,
    });

    this.root.append(this.halo, this.rays, this.arch);
    // Before the sheet's base, so the base (same z-index, later in the
    // document) paints over it.
    document.body.insertBefore(this.root, document.body.firstChild);
  }

  draw(open: number, time: number) {
    // The fire breathes in the dark (opacity only: a filter would repaint).
    const flicker = this.dark
      ? 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(time * 13.1) * Math.sin(time * 5.3 + 1.7))
      : 1;
    this.arch.style.opacity = (open * flicker).toFixed(3);
    this.arch.style.transform = `scale(${(0.86 + 0.14 * open).toFixed(4)}, ${(0.7 + 0.3 * open).toFixed(4)})`;
    this.halo.style.opacity = open.toFixed(3);
    this.halo.style.transform = `scale(${(0.75 + 0.25 * open).toFixed(4)})`;
    this.rays.style.opacity = (open * (this.dark ? 0.9 : 0.6)).toFixed(3);
    this.rays.style.transform = `rotate(${(time * 3.5).toFixed(2)}deg)`;
  }

  remove() {
    this.root.remove();
  }
}

// ------------------------------------------------------------------ the DOM front

type Flake = {
  element: HTMLElement;
  x: number;
  speed: number;
  offset: number;
  spin: number;
  sway: number;
  phase: number;
  size: number;
  mote: boolean;
};

const FLAKES = 16;
const MOTES = 12;

/** A small seeded generator (the same flakes on every visit). */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The front layer without WebGL: a fog wall that climbs (a gradient
 * sliding up), a glow at its heart, a handful of paper flakes and motes,
 * and the paper sheet that flies back out (a rounded panel scaling up,
 * then opening from its centre through a radial mask). Transforms and
 * opacity only, so a software compositor keeps up.
 */
export class PortalDom implements PortalFront {
  readonly kind = "dom" as const;
  readonly isLost = false;
  private scene: PortalFrontScene | null = null;
  private readonly pieces: HTMLElement[] = [];
  private wall: HTMLElement | null = null;
  private heart: HTMLElement | null = null;
  private ghost: HTMLElement | null = null;
  private flood: HTMLElement | null = null;
  private sheet: HTMLElement | null = null;
  private flakes: Flake[] = [];
  private width = 1;
  private height = 1;

  begin(scene: PortalFrontScene) {
    this.scene = scene;
    this.resize();
    const { palette, root, direction, dark } = scene;
    const add = (element: HTMLElement) => {
      this.pieces.push(element);
      root.appendChild(element);
      return element;
    };
    const layer = (style: Partial<CSSStyleDeclaration>) => {
      const element = document.createElement("div");
      Object.assign(element.style, { position: "absolute", pointerEvents: "none" }, style);
      return element;
    };

    if (direction === "in") {
      this.wall = add(
        layer({
          left: "0",
          right: "0",
          bottom: "0",
          height: "190%",
          background: `linear-gradient(to top, ${palette.fog} 0%, ${palette.fog} 56%, ${hexA(palette.fog, 0.7)} 64%, ${hexA(palette.fog, 0)} 100%)`,
          transform: "translate3d(0, 100%, 0)",
          willChange: "transform, opacity",
        }),
      );
      const lip = layer({
        left: "-10%",
        right: "-10%",
        top: "30%",
        height: "12%",
        background: `radial-gradient(50% 50% at 50% 50%, ${hexA(palette.rim, dark ? 0.55 : 0.9)}, transparent)`,
      });
      this.wall.appendChild(lip);
      this.heart = add(
        layer({
          inset: "0",
          background: `radial-gradient(60% 55% at 50% 45%, ${hexA(dark ? palette.halo : palette.glow, dark ? 0.35 : 1)}, transparent 70%)`,
          opacity: "0",
          willChange: "opacity",
        }),
      );
      // The ghost of the library's window, where the real one will stand.
      // It has no sill: a mask sinks its light into the fog below.
      const vh = this.height;
      const glow = 70;
      this.ghost = add(
        layer({
          left: "50%",
          top: `${vh * 0.15 - glow}px`,
          width: `${vh * 0.38 + glow * 2}px`,
          height: `${vh * 0.45 + glow}px`,
          marginLeft: `${-vh * 0.19 - glow}px`,
          opacity: "0",
          willChange: "opacity",
        }),
      );
      const sink = "linear-gradient(to bottom, #000 55%, transparent 96%)";
      this.ghost.style.setProperty("mask-image", sink);
      this.ghost.style.setProperty("-webkit-mask-image", sink);
      this.ghost.appendChild(
        layer({
          left: `${glow}px`,
          top: `${glow}px`,
          width: `${vh * 0.38}px`,
          height: `${vh * 0.45 + glow}px`,
          borderRadius: `${vh * 0.19}px ${vh * 0.19}px 0 0`,
          background: dark
            ? `radial-gradient(80% 70% at 50% 40%, ${hexA(palette.halo, 0.25)}, transparent)`
            : `radial-gradient(80% 70% at 50% 40%, ${hexA("#FFFFFF", 0.95)}, ${hexA(palette.glow, 0.5)} 70%, transparent)`,
          boxShadow: dark
            ? `0 0 0 1.5px ${hexA(palette.rim, 0.75)}, 0 0 26px 6px ${hexA(palette.glow, 0.6)}`
            : `0 0 0 1.5px ${hexA(palette.rim, 0.9)}, 0 0 50px 18px ${hexA(palette.glow, 0.8)}`,
        }),
      );
    } else {
      this.flood = add(
        layer({ inset: "0", background: palette.fog, opacity: "0", willChange: "opacity" }),
      );
    }

    const random = seeded(direction === "in" ? 0x7a11 : 0x3b05);
    this.flakes = [];
    for (let i = 0; i < FLAKES + MOTES; i += 1) {
      const mote = i >= FLAKES;
      const size = mote ? 4 + random() * 6 : 10 + random() * 18;
      const element = add(
        layer({
          left: "0",
          top: "0",
          width: `${size}px`,
          height: `${mote ? size : size * (0.65 + random() * 0.6)}px`,
          borderRadius: mote ? "50%" : "2px",
          background: mote
            ? `radial-gradient(closest-side, ${hexA(random() < 0.4 ? palette.ember : palette.mote, 0.95)}, transparent)`
            : `linear-gradient(135deg, ${palette.paper} 55%, ${palette.paperShade})`,
          boxShadow: mote
            ? "none"
            : dark
              ? `0 0 6px ${hexA(palette.ember, 0.45)}`
              : `0 2px 6px ${hexA("#0E1116", 0.08)}`,
          opacity: "0",
          willChange: "transform, opacity",
        }),
      );
      this.flakes.push({
        element,
        mote,
        size,
        x: random(),
        speed: (mote ? 0.35 : 0.22) + random() * 0.3,
        offset: random(),
        spin: (random() - 0.5) * 540,
        sway: 0.02 + random() * 0.04,
        phase: random() * Math.PI * 2,
      });
    }

    if (direction === "out") {
      this.sheet = add(
        layer({
          left: "-8%",
          top: "-8%",
          width: "116%",
          height: "116%",
          borderRadius: "28px",
          background: `${GRAIN}, linear-gradient(160deg, ${palette.paper} 40%, ${palette.paperShade})`,
          backgroundBlendMode: dark ? "soft-light" : "multiply",
          boxShadow: dark
            ? `0 0 0 1px ${hexA(palette.ember, 0.35)}, 0 30px 80px ${hexA("#000000", 0.5)}`
            : `0 30px 80px ${hexA("#0E1116", 0.18)}`,
          opacity: "0",
          transform: "scale(0.12)",
          willChange: "transform, opacity",
        }),
      );
    }
  }

  draw(frame: PortalFrontFrame) {
    const scene = this.scene;
    if (!scene) return;
    if (this.wall) {
      const y = (1 - frame.rise) * 100;
      this.wall.style.transform = `translate3d(0, ${y.toFixed(2)}%, 0)`;
      this.wall.style.opacity = (1 - ease.inOut1(frame.thin)).toFixed(3);
    }
    if (this.heart) {
      this.heart.style.opacity = (fit(frame.rise, 0.6, 1) * (1 - frame.thin)).toFixed(3);
    }
    if (this.ghost) {
      this.ghost.style.opacity = (frame.ghost * 0.9 * (1 - ease.inOut1(frame.thin))).toFixed(3);
    }
    if (this.flood) this.flood.style.opacity = frame.flood.toFixed(3);

    const direction = scene.direction === "in" ? -1 : 1;
    const h = this.height;
    const w = this.width;
    this.flakes.forEach((flake, i) => {
      const share = (i + 0.5) / this.flakes.length;
      const visible = frame.fade * (share <= frame.amount ? 1 : 0);
      if (visible <= 0) {
        flake.element.style.opacity = "0";
        return;
      }
      const travel = frame.stream * flake.speed - flake.offset * 1.3;
      if (travel < 0) {
        flake.element.style.opacity = "0";
        return;
      }
      const along = (travel % 1.3) - 0.15;
      const y = direction < 0 ? h * (1 - along) : h * along;
      const x = w * (flake.x + Math.sin(frame.stream * 1.6 + flake.phase) * flake.sway * 3);
      const rotation = flake.mote ? 0 : flake.spin * frame.stream * 0.25 + flake.phase * 57;
      const flip = flake.mote ? 1 : Math.cos(frame.stream * 2.2 + flake.phase);
      flake.element.style.opacity = (visible * (flake.mote ? 0.9 : 1)).toFixed(3);
      flake.element.style.transform =
        `translate3d(${(x - flake.size / 2).toFixed(1)}px, ${(y - flake.size / 2).toFixed(1)}px, 0) ` +
        `rotate(${rotation.toFixed(1)}deg) scaleX(${flip.toFixed(3)})`;
    });

    if (this.sheet) {
      const k = fit(frame.sheet, 0, 1);
      const grow = ease.in2(k);
      const settle = 1 - grow;
      // Dissolving, it keeps coming past the camera (the page settles under it).
      const pass = fit(frame.hole, 0, 1);
      const scale = (0.12 + 0.88 * grow) * (1 + 0.1 * pass * (2 - pass));
      const x = -w * 0.22 * settle * settle;
      const y = -h * 0.16 * settle * settle;
      this.sheet.style.opacity = Math.min(1, k * 5).toFixed(3);
      this.sheet.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${(-12 * settle).toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      if (frame.hole > 0) {
        const reach = Math.hypot(w, h) * 0.62;
        // The hole is already eased (see reveal): it opens at an even pace.
        const r = frame.hole * reach * 1.1;
        const mask = `radial-gradient(circle at 50% 50%, transparent ${r.toFixed(1)}px, #000 ${(r + 48).toFixed(1)}px)`;
        this.sheet.style.maskImage = mask;
        this.sheet.style.setProperty("-webkit-mask-image", mask);
      }
    }
  }

  resize() {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
  }

  end() {
    for (const piece of this.pieces.splice(0)) piece.remove();
    this.flakes = [];
    this.wall = this.heart = this.ghost = this.flood = this.sheet = null;
    this.scene = null;
  }
}

// ------------------------------------------------------------------ the stage

class Stage implements PortalStage {
  readonly renderer: "gl" | "dom";
  readonly coverSeconds: number;
  readonly revealSeconds: number;
  readonly revealSignal: number;
  readonly interactiveShare = INTERACTIVE_SHARE;
  private readonly setup: PortalStageSetup;
  private readonly palette: PortalPalette;
  private front: PortalFront;
  private readonly dom = new PortalDom();
  private sheet: PageSheet | null = null;
  private arch: Arch | null = null;
  private focus: HTMLElement | null = null;
  private content: { element: HTMLElement; saved: Saved } | null = null;
  private readonly frame: PortalFrontFrame = {
    time: 0,
    stream: 0,
    rise: 0,
    thin: 0,
    flood: 0,
    ghost: 0,
    amount: 0,
    fade: 1,
    sheet: 0,
    hole: 0,
  };
  private released = false;
  private ended = false;

  constructor(setup: PortalStageSetup) {
    this.setup = setup;
    this.palette = portalPalette(setup.dark);
    this.front = setup.gl && !setup.gl.isLost ? setup.gl : this.dom;
    this.renderer = this.front.kind;
    const timing = TIMING[this.renderer][setup.direction];
    this.coverSeconds = setup.instant ? 0 : timing.cover;
    this.revealSeconds = timing.reveal;
    this.revealSignal = timing.signal;
    try {
      this.mount(setup);
    } catch (error) {
      this.end();
      throw error;
    }
  }

  private mount(setup: PortalStageSetup) {
    this.front.begin(this.scene());

    if (setup.direction === "in") {
      if (setup.instant) {
        this.frame.rise = 1;
        this.frame.ghost = 1;
        this.frame.amount = 1;
        // The screen turns to fog at once, with the stream already rising in it.
        this.frame.stream = 1.6;
      } else {
        this.arch = new Arch(this.palette, setup.dark);
        this.sheet = new PageSheet(this.palette, setup.dark);
      }
    } else {
      if (setup.instant) {
        this.frame.sheet = 1;
      } else {
        this.frame.stream = 1.4;
        this.frame.fade = 0;
        const content = document.getElementById("smooth-content");
        if (content) this.content = { element: content, saved: save(content, ["opacity"]) };
      }
      if (this.renderer === "gl") {
        // The landing's focus pull: the page comes back sharp and in colour.
        this.focus = document.createElement("div");
        Object.assign(this.focus.style, {
          position: "absolute",
          inset: "0",
          pointerEvents: "none",
          backdropFilter: "blur(12px) saturate(0.35)",
          opacity: setup.instant ? "1" : "0",
        });
        this.focus.style.setProperty("-webkit-backdrop-filter", "blur(12px) saturate(0.35)");
        setup.root.insertBefore(this.focus, setup.root.firstChild);
      }
    }
    this.front.draw(this.frame);
  }

  get lost() {
    return this.front.isLost;
  }

  cover(t: number, dt: number, world: WorldTransitionApi | null) {
    const f = this.frame;
    f.time += dt;
    const gl = this.renderer === "gl";
    const C = this.coverSeconds;
    if (this.setup.direction === "in") {
      const liftEnd = gl ? 1.0 : 0.55;
      const lift = ease.inOut3(fit(t, 0, liftEnd));
      const h = window.innerHeight;
      this.sheet?.apply({
        x: 0,
        y: h * (gl ? 0.02 : 0.012) * lift,
        tiltX: (gl ? 12 : 8) * lift,
        tiltY: (gl ? 2.2 : 1.2) * lift,
        tiltZ: (gl ? -1.6 : -1) * lift,
        scale: 1 - (gl ? 0.27 : 0.16) * lift,
        drain: ease.inOut2(fit(t, 0.1 * liftEnd, 0.95 * liftEnd)),
        leak: ease.out2(fit(t, 0.05 * liftEnd, 0.7 * liftEnd)),
      });
      this.arch?.draw(ease.out2(fit(t, 0.05 * liftEnd, 0.95 * liftEnd)), f.time);
      f.amount = ease.out1(fit(t, 0.12 * C, 0.75 * C));
      f.stream += dt * (1.1 + 1.9 * fit(t, 0.1 * C, C));
      f.rise = ease.in2(fit(t, (gl ? 0.46 : 0.36) * C, C));
      f.ghost = ease.inOut2(fit(t, 0.72 * C, C));
    } else {
      const h = window.innerHeight;
      const fall = ease.in2(fit(t, 0, C));
      if (world) {
        world.setDolly(FALL.dolly * fall);
        world.setLift(FALL.lift * h * fall);
        world.setFogSwallow(ease.in2(fit(t, 0, 0.9 * C)));
      } else {
        f.flood = ease.in2(fit(t, 0.05 * C, 0.8 * C));
      }
      if (this.content) {
        const fade = 1 - ease.in2(fit(t, 0.02 * C, 0.5 * C));
        this.content.element.style.setProperty("opacity", fade.toFixed(3));
      }
      // The real world blurs away behind the leaves and the sheet.
      if (this.focus) this.focus.style.opacity = ease.in2(fit(t, 0.1 * C, 0.9 * C)).toFixed(3);
      // The leaves are already falling (the stream starts mid-flight)
      // and fade in, rather than all entering from the top at once.
      f.amount = 1;
      f.fade = ease.out1(fit(t, 0, 0.3 * C));
      f.stream += dt * 1.6;
      f.sheet = fit(t, (gl ? 0.26 : 0.12) * C, C);
    }
    this.front.draw(f);
  }

  hold(dt: number, world: WorldTransitionApi | null) {
    const f = this.frame;
    f.time += dt;
    if (this.setup.direction === "in") {
      f.rise = 1;
      f.ghost = 1;
      f.amount = 1;
      f.stream += dt * 1.5;
      // The library waits at the bottom of its ascent under the fog.
      if (world) this.ascend(world, 0);
    } else {
      f.sheet = 1;
      f.amount = 0;
      // The sheet covers everything now: what it opens onto is the
      // destination itself, never the fog it flew out of.
      f.flood = 0;
      if (this.focus) this.focus.style.opacity = "1";
    }
    this.front.draw(f);
  }

  release() {
    if (this.released) return;
    this.released = true;
    this.sheet?.dispose();
    this.sheet = null;
    this.arch?.remove();
    this.arch = null;
    if (this.content) restore(this.content.element, this.content.saved);
    this.content = null;
  }

  reveal(t: number, dt: number, world: WorldTransitionApi | null) {
    this.release();
    const f = this.frame;
    f.time += dt;
    const R = this.revealSeconds;
    if (this.setup.direction === "in") {
      f.thin = ease.inOut2(fit(t, 0, 0.75 * R));
      f.fade = 1 - ease.in1(fit(t, 0.35 * R, R));
      f.stream += dt * 2.4;
      if (world) this.ascend(world, t / (INTERACTIVE_SHARE * R));
    } else {
      f.sheet = 1;
      f.flood = 0;
      f.hole = ease.inOut2(fit(t, 0, 0.95 * R));
      if (this.focus) this.focus.style.opacity = (1 - ease.out1(fit(t, 0.1 * R, R))).toFixed(3);
      // A world still here means the way out was undone (back before the
      // route committed): the library climbs back out of its fog.
      if (world) {
        const fall = 1 - ease.out3(fit(t, 0, INTERACTIVE_SHARE * R));
        world.setDolly(FALL.dolly * fall);
        world.setLift(FALL.lift * window.innerHeight * fall);
        world.setFogSwallow(fall);
      }
    }
    this.front.draw(f);
  }

  resize() {
    this.front.resize();
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    this.release();
    this.front.end();
    if (this.front !== this.dom) this.dom.end();
    this.focus?.remove();
    this.focus = null;
  }

  /** The library's camera on its way up: `k` 0 at the bottom, 1 in place. */
  private ascend(world: WorldTransitionApi, k: number) {
    const h = window.innerHeight;
    const travel = 1 - ease.out3(Math.min(1, Math.max(0, k)));
    world.setLift(ASCENT.lift * h * travel);
    world.setDolly(ASCENT.dolly * travel);
    world.setFogSwallow(1 - ease.inOut2(fit(k, 0, 0.85)));
  }

  private scene(): PortalFrontScene {
    return {
      direction: this.setup.direction,
      dark: this.setup.dark,
      palette: this.palette,
      tier: this.setup.tier,
      root: this.setup.root,
    };
  }
}

export function createPortalStage(setup: PortalStageSetup): PortalStage {
  return new Stage(setup);
}
