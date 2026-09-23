import gsap from "gsap";

import {
  backgroundBehind,
  HeaderTint,
  mixRgb,
  resolveColor,
  toCss,
  type Rgb,
  type TintPalette,
} from "@/components/transition/project-zoom-colors";
import { ZoomDom } from "@/components/transition/project-zoom-dom";
import {
  ENTER_SECONDS,
  EXIT_LAND_AT,
  EXIT_SECONDS,
  enterFrame,
  exitFrame,
  type PreparedPicture,
  type Rect,
  type View,
  type ZoomRenderer,
  type ZoomSource,
} from "@/components/transition/project-zoom-frame";
import type { ZoomGl } from "@/components/transition/project-zoom-gl";
import {
  clearProjectReturn,
  expectProjectPage,
  markProjectCoverStarted,
  markProjectPageReady,
  markProjectRevealStarted,
  peekProjectReturn,
  projectDetailSlug,
  projectTransitionKind,
  PROJECTS_LIST_PATH,
  setProjectReturn,
  skipScrollReset,
  waitForProjectPage,
} from "@/lib/project-transition";
import { PROJECT_THEMES, type ProjectPalette } from "@/lib/project-themes";
import { motionAllowed } from "@/lib/reduced-motion";
import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";

/**
 * The project zoom transition's controller (mounted by
 * project-transition.tsx). It owns three flows:
 *
 * - Enter (a card click on the list, or a featured project on the
 *   homepage): the cover grows from its frame to fill the screen while its
 *   picture is pulled into its centre and dissolves into the project's
 *   theme colour, and a theme colour layer fades in over the page. It then
 *   holds that solid colour until the project's page is ready, and fades.
 * - Exit (any link to /projects on a project page, or browser back): an
 *   instant cover in the page's own colour, then, once the list has
 *   committed (scrolled back to the card, see projects-grid.tsx), the
 *   reverse zoom lands on the card and hands over to it.
 * - Swap (browser back or forward between two projects, or forward from
 *   the list): a short crossfade from one page's colour to the other's.
 *
 * The palettes are a static import (small, and a zoom must never wait on
 * a chunk to know its colours); only the WebGL renderer loads on demand.
 *
 * Every flow runs on the GSAP ticker, blocks pointer input with inline
 * styles (a class toggle once lost to stylesheet order, see
 * docs/page-transition.md), holds the "project-transition" scroll lock and
 * ends in `finish()`, which undoes all of it whichever way the flow ended.
 */

const LOCK_OWNER = "project-transition";
// Enter: the click waits at most this long for the renderer and the
// decoded cover before the zoom starts with whatever is ready.
const PREPARE_MS = 300;
// The DOM fallback's clone must decode before it replaces the card.
const DOM_PICTURE_MS = 200;
// How long the overlay holds, once the project route has committed, for a
// page that never says it is ready. Counted from the commit, not the click:
// the route only changes about 1.1 s into the zoom, and a slow server can
// commit it later still, so a clock started at the click could run out
// before the page had any time to lay out.
const PAGE_READY_MS = 2000;
// The route never committing at all: reveal whatever is there.
const COMMIT_CEILING_MS = 8000;
// Exit: how long the landing waits for the card's picture, and for the
// other covers on screen to be able to paint.
const PICTURE_MS = 1500;
const LIST_COVERS_MS = 1200;
const REVEAL_SECONDS = 0.35;
const ABORT_SECONDS = 0.2;
const SWAP_SECONDS = 0.45;
const SWAP_REVEAL_SECONDS = 0.3;
const UNCOVER_SECONDS = 0.45;
// The card must be at least this visible to be landed on.
const MIN_LANDING_SHARE = 0.3;
const WARM_DELAY_MS = 1200;

type Kind = "enter" | "exit" | "swap";

type Run = {
  kind: Kind;
  /** The pathname the flow started from, and the one it goes to. */
  source: string;
  target: string;
  view: View;
  renderer: ZoomRenderer | null;
  animations: gsap.core.Animation[];
  /** Releases for every pending wait, so an ended flow never hangs. */
  waiters: Array<() => void>;
  ending: boolean;
};

/** The last project entered from a card, and where the list was. */
type Visit = { slug: string; scrollY?: number };
let visit: Visit | undefined;

export type ProjectZoomOptions = {
  root: HTMLElement;
  layer: HTMLElement;
  shield: HTMLElement;
  navigate: (href: string, options?: { scroll?: boolean }) => void;
  /** Fetches a route's full payload ahead of the navigation. */
  prefetch: (href: string) => void;
  pathname: string;
};

/** A theme's palette for the site's current mode, if the id names one. */
function themePalette(id: string | undefined): ProjectPalette | null {
  const theme = id ? PROJECT_THEMES[id as keyof typeof PROJECT_THEMES] : undefined;
  if (!theme) return null;
  return document.documentElement.classList.contains("dark") ? theme.dark : theme.light;
}

function viewOf(root: HTMLElement): View {
  return {
    width: root.clientWidth || window.innerWidth,
    height: root.clientHeight || window.innerHeight,
  };
}

function toRect(box: DOMRect): Rect {
  return { x: box.left, y: box.top, width: box.width, height: box.height };
}

function radiusOf(element: Element) {
  return parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
}

function shareOnScreen(box: DOMRect, view: View) {
  const width = Math.min(box.right, view.width) - Math.max(box.left, 0);
  const height = Math.min(box.bottom, view.height) - Math.max(box.top, 0);
  if (width <= 0 || height <= 0 || box.width <= 0 || box.height <= 0) return 0;
  return (width * height) / (box.width * box.height);
}

function frameFor(anchor: HTMLAnchorElement, slug: string) {
  return (
    anchor.querySelector<HTMLElement>("[data-project-transition-frame]") ??
    document.querySelector<HTMLElement>(`[data-project-transition-frame="${CSS.escape(slug)}"]`)
  );
}

function imageIn(frame: HTMLElement, slug: string) {
  return (
    frame.querySelector<HTMLImageElement>(
      `img[data-project-transition-image="${CSS.escape(slug)}"]`,
    ) ?? frame.querySelector<HTMLImageElement>("img")
  );
}

function landingFrame(slug: string) {
  return document.querySelector<HTMLElement>(
    `a[data-project-transition][data-project-slug="${CSS.escape(slug)}"] [data-project-transition-frame]`,
  );
}

/** The card covers the list shows in the viewport right now. */
function coversOnScreen(view: View) {
  return [
    ...document.querySelectorAll<HTMLImageElement>(
      "a[data-project-transition] [data-project-transition-frame] img",
    ),
  ].filter((image) => {
    const box = image.getBoundingClientRect();
    return box.bottom > 0 && box.top < view.height && box.width > 0;
  });
}

/** Resolves once an image has loaded (or failed) and decoded. */
function settle(image: HTMLImageElement) {
  // A lazy image the browser hasn't started yet: it is on screen, so ask now.
  if (image.loading === "lazy") image.loading = "eager";
  return new Promise<void>((resolve) => {
    const decode = () => image.decode().then(resolve, resolve);
    if (image.complete) decode();
    else {
      image.addEventListener("load", decode, { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    }
  });
}

function releaseLanding() {
  for (const element of document.querySelectorAll<HTMLElement>("[data-project-landing]")) {
    delete element.dataset.projectLanding;
  }
}

/** The page's root box: the themed detail page, or whatever page is on screen. */
function pageRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("[data-project-detail]") ??
    document.querySelector<HTMLElement>("#smooth-content > *") ??
    document.body
  );
}

/**
 * The colour a page shows behind its content. A themed project page puts
 * its palette on :root, and its background may be painted by an element
 * other than its root (a transparent root over a decorative canvas would
 * otherwise read as the site background), so its `--project-bg` wins.
 * Any other page: the first opaque background behind its root.
 */
function pageBackground(page: HTMLElement): Rgb {
  if (page.matches("[data-project-detail]")) {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--project-bg");
    if (value.trim()) return resolveColor(value.trim());
  }
  return backgroundBehind(page);
}

/** The detail page from before the themed one carries no cover attribute. */
function legacyCoverUrl() {
  const image = document.querySelector<HTMLImageElement>(
    'main img[src*="/api/projects-cms/media/"]',
  );
  return image ? image.currentSrc || image.src : null;
}

function sameAddress(a: string, b: string) {
  try {
    return new URL(a, window.location.href).href === new URL(b, window.location.href).href;
  } catch {
    return false;
  }
}

function closePicture(picture: PreparedPicture | null | undefined) {
  if (picture && !(picture.source instanceof HTMLImageElement)) picture.source.close();
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), Math.max(0, ms));
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

/** The same bail-outs as the route curtain's click filter. */
function navigationTarget(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  const raw = anchor.getAttribute("href") ?? "";
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (url.pathname.startsWith("/admin") || window.location.pathname.startsWith("/admin")) {
    return null;
  }
  if (url.pathname === window.location.pathname) return null;
  return { anchor, pathname: url.pathname, href: url.pathname + url.search + url.hash };
}

export class ProjectZoom {
  private readonly root: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly shield: HTMLElement;
  private readonly navigate: ProjectZoomOptions["navigate"];
  private readonly prefetch: ProjectZoomOptions["prefetch"];
  private readonly dom: ZoomDom;
  private readonly tint = new HeaderTint();
  private run: Run | null = null;
  private shown: string;
  private readonly commits: Array<{ path: string; done: (committed: boolean) => void }> = [];
  private gl: ZoomGl | null = null;
  private glFailed = false;
  private glLoading: Promise<ZoomGl | null> | null = null;
  private warmed: { image: HTMLImageElement; picture: Promise<PreparedPicture | null> } | null =
    null;
  private warmTimer = 0;
  private disposed = false;
  // Verification hooks (dev builds only): stretch every duration, or force
  // the DOM fallback.
  private slowdown = 1;
  private forceDom = false;
  private lastPrepare: { ms: number; picture: string; renderer: string } | null = null;
  private lastExit: { picture: string; uploaded: boolean | null; renderer: string } | null = null;
  // The running zoom's progress, 0..1, and the cover address the last exit
  // decoded ahead (verification only).
  private progress = 0;
  private lastWarmUrl: string | null = null;

  constructor({ root, layer, shield, navigate, prefetch, pathname }: ProjectZoomOptions) {
    this.root = root;
    this.layer = layer;
    this.shield = shield;
    this.navigate = navigate;
    this.prefetch = prefetch;
    this.shown = pathname;
    this.dom = new ZoomDom(root);
    window.addEventListener("click", this.onClick, true);
    window.addEventListener("pointerdown", this.onPointerDown, true);
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("resize", this.onResize);
    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, { __projectTransition: this.debugView() });
    }
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("click", this.onClick, true);
    window.removeEventListener("pointerdown", this.onPointerDown, true);
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("resize", this.onResize);
    window.clearTimeout(this.warmTimer);
    if (this.run) this.finish(this.run);
    for (const waiter of this.commits.splice(0)) waiter.done(false);
    void this.warmed?.picture.then(closePicture);
    this.warmed = null;
    if (process.env.NODE_ENV !== "production") {
      Reflect.deleteProperty(window, "__projectTransition");
    }
  }

  /** The pathname on screen changed (a route committed). */
  routeChanged(pathname: string) {
    this.shown = pathname;
    for (const waiter of this.commits.splice(0)) waiter.done(waiter.path === pathname);
    const run = this.run;
    // The route went somewhere this flow never meant to go: let go.
    if (run && !run.ending && pathname !== run.source && pathname !== run.target) {
      this.abort(run);
    }
    // A return note only means something to the list it was left for.
    if (pathname !== PROJECTS_LIST_PATH && !(this.run?.kind === "exit" && !this.run.ending)) {
      clearProjectReturn();
    }
    this.scheduleWarm();
  }

  // ------------------------------------------------------------- triggers

  private readonly onClick = (event: MouseEvent) => {
    if (this.run) {
      // Mid-transition every click is swallowed: nothing may navigate or
      // toggle under the overlay (the header stays visible above it).
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const link = navigationTarget(event);
    if (!link) return;
    const from = window.location.pathname;
    const slug = projectDetailSlug(link.pathname);
    const card = Boolean(slug) && link.anchor.hasAttribute("data-project-transition");
    const kind = projectTransitionKind(from, link.pathname);
    if (!motionAllowed()) {
      // Native navigation; only the list's scroll position comes back.
      if (card && slug) this.rememberVisit(slug, from);
      else if (kind === "exit") this.noteReducedExit(from);
      return;
    }
    if (card && slug) {
      if (this.startEnter(link.anchor, link.href, link.pathname, slug)) event.preventDefault();
      return;
    }
    if (kind === "exit") {
      event.preventDefault();
      this.startExit(from, link.href);
    }
  };

  private readonly onPopState = () => {
    const to = window.location.pathname;
    const from = this.shown;
    const current = this.run;
    if (to === from) {
      // Back to the page still on screen (a flow's route never committed).
      if (current) this.abort(current);
      return;
    }
    const kind = projectTransitionKind(from, to);
    if (!motionAllowed()) {
      if (current) this.finish(current);
      if (kind === "exit") this.noteReducedExit(from);
      return;
    }
    if (!kind) {
      if (current) this.abort(current);
      return;
    }
    // A claimed pair (the curtain stays out of it): cover right away, in
    // the same task as the browser's navigation, before anything paints.
    if (current) this.finish(current);
    if (kind === "exit") this.startExit(from, null);
    else this.startSwap(from, to);
  };

  /** Warms the renderer and decodes the cover while the button is down. */
  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.run || event.button !== 0 || !motionAllowed()) return;
    const anchor = (event.target as Element | null)?.closest?.("a[data-project-transition]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const link = navigationTarget(event);
    if (link) this.prefetch(link.href);
    const slug = anchor.dataset.projectSlug ?? "";
    const frame = frameFor(anchor, slug);
    const image = frame ? imageIn(frame, slug) : null;
    void this.ensureGl().then((gl) => {
      if (!gl || !image || this.run || this.warmed?.image === image) return;
      void this.warmed?.picture.then(closePicture);
      this.warmed = { image, picture: gl.prepare(image) };
    });
  };

  private readonly onResize = () => {
    const run = this.run;
    if (!run) return;
    run.view = viewOf(this.root);
    run.renderer?.resize(run.view);
  };

  // ---------------------------------------------------------------- enter

  private startEnter(anchor: HTMLAnchorElement, href: string, target: string, slug: string) {
    const frame = frameFor(anchor, slug);
    if (!frame) return false;
    const view = viewOf(this.root);
    const box = frame.getBoundingClientRect();
    if (box.width < 2 || box.height < 2 || shareOnScreen(box, view) <= 0) return false;
    const source: ZoomSource = {
      rect: toRect(box),
      radius: radiusOf(frame),
      overscan: this.restingZoom(frame, anchor),
    };
    const palette = themePalette(anchor.dataset.projectTheme);
    // Nothing to change into: the route curtain takes the click as usual.
    if (!palette) return false;
    const image = imageIn(frame, slug);
    const backdrop = backgroundBehind(frame);
    const from = window.location.pathname;

    const run = this.begin("enter", from, target);
    run.view = view;
    this.rememberVisit(slug, from);
    markProjectCoverStarted();
    expectProjectPage(slug);
    this.prefetch(href);
    void this.playEnter(run, { href, palette, image, source, backdrop });
    return true;
  }

  private async playEnter(
    run: Run,
    s: {
      href: string;
      palette: ProjectPalette;
      image: HTMLImageElement | null;
      source: ZoomSource;
      backdrop: Rgb;
    },
  ) {
    const { palette } = s;
    const deadline = performance.now() + PREPARE_MS * this.slowdown;
    const gl = this.forceDom
      ? null
      : await withTimeout(this.ensureGl(), deadline - performance.now());
    let prepared: PreparedPicture | null = null;
    let late: Promise<PreparedPicture | null> | null = null;
    if (gl && s.image) {
      const warmed = this.warmed?.image === s.image ? this.warmed.picture : null;
      if (!warmed) void this.warmed?.picture.then(closePicture);
      this.warmed = null;
      const pending = warmed ?? gl.prepare(s.image);
      prepared = (await withTimeout(pending, deadline - performance.now())) ?? null;
      if (!prepared) late = pending;
    }
    if (process.env.NODE_ENV !== "production") {
      this.lastPrepare = {
        ms: Math.round(performance.now() - (deadline - PREPARE_MS * this.slowdown)),
        picture: prepared
          ? prepared.source instanceof HTMLImageElement
            ? "element"
            : "bitmap"
          : "none",
        renderer: gl ? "gl" : "dom",
      };
    }
    if (!this.live(run)) {
      closePicture(prepared);
      return;
    }

    const renderer: ZoomRenderer = gl && !gl.isLost ? gl : this.dom;
    run.renderer = renderer;
    const fog = resolveColor(palette.bg);
    renderer.begin({
      view: run.view,
      source: s.source,
      picture: {
        url: s.image ? s.image.currentSrc || s.image.src : null,
        element: s.image,
        prepared,
      },
      fog,
      backdrop: s.backdrop,
    });
    // Too late to start with: the element was uploaded instead (a loaded
    // cover), or, with none, the decoded picture replaces the frame's
    // colour as soon as it lands.
    if (late && gl) {
      if (renderer === gl && !gl.hasPicture) this.uploadLate(run, gl, late);
      else void late.then(closePicture);
    }
    if (renderer === this.dom) {
      await withTimeout(this.dom.ready(), Math.max(DOM_PICTURE_MS, deadline - performance.now()));
      if (!this.live(run)) return;
    }
    this.layer.style.backgroundColor = toCss(fog);
    this.tint.start(this.tint.current(), this.tint.theme(palette));

    // The route changes only once the theme colour covers the page (the
    // payload was prefetched at the click, so it is usually there by then):
    // any earlier, the project would show through the layer while it is
    // still fading in, in place of the list.
    let pushed = false;
    const draw = (t: number) => {
      const frame = enterFrame(t, s.source, run.view);
      this.progress = t;
      renderer.draw(frame);
      this.layer.style.opacity = String(frame.layer);
      this.tint.set(frame.tint);
      if (!pushed && frame.layer >= 1) {
        pushed = true;
        this.navigate(s.href);
      }
    };
    // The first frame is the card itself, so showing the overlay changes
    // nothing on screen.
    draw(0);
    gsap.set(this.root, { autoAlpha: 1 });

    const progress = { t: 0 };
    await this.animate(run, progress, {
      t: 1,
      duration: ENTER_SECONDS,
      ease: "none",
      onUpdate: () => draw(progress.t),
    });
    if (!this.live(run)) return;
    if (!pushed) this.navigate(s.href);

    // Hold the solid theme colour until the project's page has committed
    // and says it can be shown (both bounded).
    const committed = await this.waitForCommit(run, run.target, COMMIT_CEILING_MS);
    if (!this.live(run)) return;
    if (committed) {
      await this.waitForPage(run);
      await nextFrame();
      if (!this.live(run)) return;
    }
    markProjectRevealStarted();
    await this.animate(run, this.root, {
      autoAlpha: 0,
      duration: REVEAL_SECONDS,
      ease: "power1.out",
    });
    if (this.live(run)) this.finish(run);
  }

  // ----------------------------------------------------------------- exit

  private startExit(from: string, href: string | null) {
    const slug = projectDetailSlug(from);
    if (!slug) return;
    const page = pageRoot();
    const coverUrl =
      (page.matches("[data-project-detail]") ? page.dataset.projectCover : null) ||
      legacyCoverUrl();
    const background = pageBackground(page);
    if (process.env.NODE_ENV !== "production") this.lastWarmUrl = coverUrl ?? null;

    const run = this.begin("exit", from, PROJECTS_LIST_PATH);
    // An instant cover in the page's own colour: only the content goes.
    this.layer.style.backgroundColor = toCss(background);
    this.layer.style.opacity = "1";
    gsap.set(this.root, { autoAlpha: 1 });
    const pinned = this.tint.current();
    this.tint.start(pinned, pinned);
    setProjectReturn({ slug, scrollY: visit?.slug === slug ? visit.scrollY : undefined });
    skipScrollReset(PROJECTS_LIST_PATH);
    // Decode the cover while the list loads (the card shows the same
    // picture in most cases; only a matching one is used).
    const warm =
      coverUrl && !this.forceDom
        ? this.ensureGl().then((gl) => gl?.prepare(null, coverUrl) ?? null)
        : Promise.resolve(null);
    if (href) this.navigate(href, { scroll: false });
    void this.playExit(run, { slug, background, pinned, warm });
  }

  private async playExit(
    run: Run,
    s: {
      slug: string;
      background: Rgb;
      pinned: TintPalette;
      warm: Promise<PreparedPicture | null>;
    },
  ) {
    const discardWarm = () => void s.warm.then(closePicture);
    const committed = await this.waitForCommit(run, PROJECTS_LIST_PATH, COMMIT_CEILING_MS);
    if (!this.live(run)) return discardWarm();
    if (!committed) {
      discardWarm();
      return this.uncover(run, this.tint.site());
    }
    // One frame for the list to lay out (it restored its scroll position
    // in its own layout effect).
    await nextFrame();
    if (!this.live(run)) return discardWarm();

    const site = this.tint.site();
    const frame = landingFrame(s.slug);
    const box = frame?.getBoundingClientRect();
    if (!frame || !box || shareOnScreen(box, run.view) < MIN_LANDING_SHARE) {
      // The card isn't there (an empty or changed list): just uncover.
      discardWarm();
      return this.uncover(run, site);
    }

    const image = imageIn(frame, s.slug);
    // The list shows at once on the way back (no intro to load behind), so
    // the cover holds, briefly, until the covers on screen can paint:
    // otherwise a list never seen this visit opens on empty frames.
    const covers = withTimeout(Promise.all(coversOnScreen(run.view).map(settle)), LIST_COVERS_MS);
    const gl = this.forceDom ? null : await withTimeout(this.ensureGl(), PICTURE_MS);
    let prepared: PreparedPicture | null = null;
    let late: Promise<PreparedPicture | null> | null = null;
    if (gl && image) {
      const warmed = await withTimeout(s.warm, PICTURE_MS);
      if (warmed === undefined) discardWarm();
      if (warmed && sameAddress(warmed.url, image.currentSrc || image.src)) {
        prepared = warmed;
      } else {
        closePicture(warmed);
        const pending = gl.prepare(image);
        prepared = (await withTimeout(pending, PICTURE_MS)) ?? null;
        if (!prepared) late = pending;
      }
    } else {
      discardWarm();
    }
    await covers;
    if (!this.live(run)) {
      closePicture(prepared);
      return;
    }

    const renderer: ZoomRenderer = gl && !gl.isLost ? gl : this.dom;
    run.renderer = renderer;
    const source: ZoomSource = {
      rect: toRect(frame.getBoundingClientRect()),
      radius: radiusOf(frame),
      overscan: Number(frame.dataset.overscan) || 1,
    };
    renderer.begin({
      view: run.view,
      source,
      picture: { url: image ? image.currentSrc || image.src : null, element: image, prepared },
      fog: s.background,
      backdrop: backgroundBehind(frame),
    });
    if (late && gl) this.uploadLate(run, gl, late);
    if (process.env.NODE_ENV !== "production") {
      this.lastExit = {
        picture: prepared
          ? prepared.source instanceof HTMLImageElement
            ? "element"
            : "bitmap"
          : "none",
        uploaded: renderer === this.gl ? this.gl.hasPicture : null,
        renderer: renderer === this.dom ? "dom" : "gl",
      };
    }
    if (renderer === this.dom) {
      await withTimeout(this.dom.ready(), PICTURE_MS);
      if (!this.live(run)) return;
    }
    this.tint.start(s.pinned, site);

    let landed = false;
    const draw = (t: number) => {
      // Follows the card through any late layout shift (fonts settling).
      source.rect = toRect(frame.getBoundingClientRect());
      const zoom = exitFrame(t, source, run.view);
      this.progress = t;
      if (!landed && t >= EXIT_LAND_AT) {
        // At rest on the card: the real cover shows under the fading quad.
        landed = true;
        releaseLanding();
      }
      renderer.draw(zoom);
      this.layer.style.opacity = String(zoom.layer);
      this.tint.set(zoom.tint);
    };
    draw(0);
    const progress = { t: 0 };
    await this.animate(run, progress, {
      t: 1,
      duration: EXIT_SECONDS,
      ease: "none",
      onUpdate: () => draw(progress.t),
    });
    if (this.live(run)) this.finish(run);
  }

  /** Fades the colour cover away (no card to land on) and walks the header home. */
  private async uncover(run: Run, to: TintPalette) {
    this.tint.start(this.tint.current(), to);
    const from = Number(this.layer.style.opacity) || 0;
    const progress = { t: 0 };
    await this.animate(run, progress, {
      t: 1,
      duration: UNCOVER_SECONDS,
      ease: "sine.inOut",
      onUpdate: () => {
        this.layer.style.opacity = String(from * (1 - progress.t));
        this.tint.set(progress.t);
      },
    });
    if (this.live(run)) this.finish(run);
  }

  // ----------------------------------------------------------------- swap

  private startSwap(from: string, to: string) {
    const slug = projectDetailSlug(to);
    if (!slug) return;
    const background = pageBackground(pageRoot());
    const run = this.begin("swap", from, to);
    this.layer.style.backgroundColor = toCss(background);
    this.layer.style.opacity = "1";
    gsap.set(this.root, { autoAlpha: 1 });
    const pinned = this.tint.current();
    this.tint.start(pinned, pinned);
    markProjectCoverStarted();
    expectProjectPage(slug);
    void this.playSwap(run, { background, pinned });
  }

  private async playSwap(run: Run, s: { background: Rgb; pinned: TintPalette }) {
    const committed = await this.waitForCommit(run, run.target, COMMIT_CEILING_MS);
    if (!this.live(run)) return;
    await nextFrame();
    if (!this.live(run)) return;
    const destination = this.destinationColors();
    this.tint.start(s.pinned, destination.palette);
    const progress = { t: 0 };
    await this.animate(run, progress, {
      t: 1,
      duration: SWAP_SECONDS,
      ease: "sine.inOut",
      onUpdate: () => {
        this.layer.style.backgroundColor = toCss(
          mixRgb(s.background, destination.background, progress.t),
        );
        this.tint.set(progress.t);
      },
    });
    if (!this.live(run)) return;
    if (committed) await this.waitForPage(run);
    if (!this.live(run)) return;
    markProjectRevealStarted();
    await this.animate(run, this.root, {
      autoAlpha: 0,
      duration: SWAP_REVEAL_SECONDS,
      ease: "power1.out",
    });
    if (this.live(run)) this.finish(run);
  }

  /**
   * The colours of the page that just committed: its theme (named on its
   * root), or, unthemed (a detail page from before themes), its own
   * background and the site's header.
   */
  private destinationColors(): { background: Rgb; palette: TintPalette } {
    const palette = themePalette(
      document.querySelector<HTMLElement>("[data-project-detail]")?.dataset.projectTheme,
    );
    if (palette) return { background: resolveColor(palette.bg), palette: this.tint.theme(palette) };
    return { background: backgroundBehind(pageRoot()), palette: this.tint.site() };
  }

  // ------------------------------------------------------------ lifecycle

  private begin(kind: Kind, source: string, target: string): Run {
    const run: Run = {
      kind,
      source,
      target,
      view: viewOf(this.root),
      renderer: null,
      animations: [],
      waiters: [],
      ending: false,
    };
    this.run = run;
    this.block(true);
    acquireScrollLock(LOCK_OWNER);
    return run;
  }

  private live(run: Run) {
    return this.run === run && !run.ending && !this.disposed;
  }

  /**
   * Ends a flow, however it ended (landed, revealed, aborted, replaced by
   * another, unmounted): every lock, block, inline value, hidden card,
   * note and signal it held is released here.
   */
  private finish(run: Run) {
    if (this.run !== run) return;
    this.run = null;
    run.ending = true;
    for (const animation of run.animations) animation.kill();
    for (const waiter of run.waiters.splice(0)) waiter();
    run.renderer?.end();
    gsap.killTweensOf(this.root);
    gsap.set(this.root, { autoAlpha: 0 });
    this.layer.style.opacity = "0";
    this.layer.style.backgroundColor = "";
    this.block(false);
    releaseScrollLock(LOCK_OWNER);
    markProjectRevealStarted();
    releaseLanding();
    // The page under the overlay now carries the palette the header ended
    // on (a themed project page puts it on :root, the list has none).
    this.tint.release();
    if (run.kind === "exit") {
      clearProjectReturn();
      skipScrollReset(null);
    }
  }

  /** Lets go quickly: a short fade, then finish(). */
  private abort(run: Run) {
    if (!this.live(run)) return;
    run.ending = true;
    for (const animation of run.animations) animation.kill();
    for (const waiter of run.waiters.splice(0)) waiter();
    markProjectRevealStarted();
    run.animations = [
      gsap.to(this.root, {
        autoAlpha: 0,
        duration: ABORT_SECONDS,
        ease: "power1.out",
        onComplete: () => this.finish(run),
      }),
    ];
  }

  // Inline, never a class: see docs/page-transition.md.
  private block(on: boolean) {
    this.root.style.pointerEvents = on ? "auto" : "";
    this.shield.style.pointerEvents = on ? "auto" : "";
  }

  private animate(run: Run, target: object, vars: gsap.TweenVars): Promise<void> {
    return new Promise((resolve) => {
      if (!this.live(run)) return resolve();
      const tween = gsap.to(target, {
        ...vars,
        duration: (Number(vars.duration) || 0) * this.slowdown,
        onComplete: () => resolve(),
      });
      run.animations.push(tween);
      run.waiters.push(resolve);
    });
  }

  /** The committed project page says it can be shown, or PAGE_READY_MS pass. */
  private waitForPage(run: Run): Promise<void> {
    return new Promise((resolve) => {
      if (!this.live(run)) return resolve();
      void waitForProjectPage(PAGE_READY_MS * this.slowdown).then(() => resolve());
      run.waiters.push(resolve);
    });
  }

  private waitForCommit(run: Run, path: string, ms: number): Promise<boolean> {
    if (this.shown === path) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (committed: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(committed);
      };
      const timer = window.setTimeout(() => done(false), ms * this.slowdown);
      this.commits.push({ path, done });
      run.waiters.push(() => done(false));
    });
  }

  // ---------------------------------------------------------------- misc

  /** Uploads a picture that finished decoding after the zoom started. */
  private uploadLate(run: Run, gl: ZoomGl, pending: Promise<PreparedPicture | null>) {
    void pending.then((picture) => {
      if (!picture) return;
      if (this.live(run) && run.renderer === gl && !gl.hasPicture) gl.setPicture(picture);
      else closePicture(picture);
    });
  }

  private restingZoom(frame: HTMLElement, anchor: HTMLAnchorElement) {
    const rest = Number(frame.dataset.overscan) || 1;
    // A hovered card on the WebGL stage shows its picture at about 1.0x.
    if (frame.dataset.stage === "gl" && anchor.matches(":hover")) return 1;
    return rest;
  }

  private rememberVisit(slug: string, from: string) {
    visit = { slug, scrollY: from === PROJECTS_LIST_PATH ? window.scrollY : undefined };
  }

  private noteReducedExit(from: string) {
    const slug = projectDetailSlug(from);
    if (!slug) return;
    setProjectReturn({
      slug,
      scrollY: visit?.slug === slug ? visit.scrollY : undefined,
      restoreOnly: true,
    });
  }

  private ensureGl(): Promise<ZoomGl | null> {
    if (this.gl && !this.gl.isLost) return Promise.resolve(this.gl);
    if (this.glFailed || this.disposed) return Promise.resolve(null);
    this.glLoading ??= import("@/components/transition/project-zoom-gl")
      .then(({ ZoomGl }) => {
        if (this.disposed) return null;
        const gl = ZoomGl.create(this.root, () => {
          // A lost context: later zooms use the DOM fallback.
          this.gl = null;
          this.glFailed = true;
        });
        if (gl) this.gl = gl;
        else this.glFailed = true;
        return gl;
      })
      .catch(() => {
        this.glLoading = null;
        return null;
      });
    return this.glLoading;
  }

  /** Loads the renderer once the page has settled. */
  private scheduleWarm() {
    window.clearTimeout(this.warmTimer);
    if (this.gl || this.glFailed || !motionAllowed()) return;
    if (!projectDetailSlug(this.shown) && !document.querySelector("a[data-project-transition]")) {
      return;
    }
    this.warmTimer = window.setTimeout(() => {
      const warm = () => {
        if (!this.disposed && !this.run) void this.ensureGl();
      };
      if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 3000 });
      else warm();
    }, WARM_DELAY_MS);
  }

  private debugView() {
    return {
      state: () => ({
        run: this.run
          ? {
              kind: this.run.kind,
              ending: this.run.ending,
              renderer: this.run.renderer ? (this.run.renderer === this.dom ? "dom" : "gl") : null,
            }
          : null,
        overflow: document.documentElement.style.overflow,
        overlay: getComputedStyle(this.root).visibility,
        blocking: this.root.style.pointerEvents || "",
        shield: this.shield.style.pointerEvents || "",
        landing: document.querySelectorAll("[data-project-landing]").length,
        tint: this.tint.size,
        note: peekProjectReturn() ?? null,
        gl: this.gl ? "ready" : this.glFailed ? "failed" : "idle",
        prepare: this.lastPrepare,
        exit: this.lastExit,
        progress: this.progress,
        warmUrl: this.lastWarmUrl,
      }),
      setSlowdown: (factor: number) => {
        this.slowdown = Math.max(0.1, factor);
      },
      forceDom: (on: boolean) => {
        this.forceDom = on;
      },
      // Stands in for a themed detail page reporting ready.
      markPageReady: (slug: string) => markProjectPageReady(slug),
    };
  }
}
