import { parseCssColor, type Rgb } from "@/lib/header-tone";

/**
 * Lets the cursor flow show through the page. The flow canvas sits under
 * every in-flow block, so a section that paints the page colour itself
 * would hide it. While the stage is up, `html[data-flow]` is set and every
 * full-width surface whose own background is exactly the page colour is
 * marked `data-flow-clear`; one rule (cursor-flow.css) makes marked
 * elements transparent. The canvas draws that same colour, so at rest the
 * page is pixel for pixel what it was, and the flow appears only where the
 * cursor paints.
 *
 * What is left alone: anything narrower than 90% of the viewport (cards,
 * buttons, pills, masks), the footer, fixed and sticky boxes (a sticky bar
 * masks what scrolls under it), anything marked `data-flow-keep`, and
 * every box inside a surface of another colour or with a background
 * picture (the flow could not show through it anyway). The body keeps its
 * background: it paints the root canvas under the flow, so the header's
 * tone probe and every "what colour is the page" read still see the page
 * colour.
 *
 * Marked elements read transparent in computed style, so a rescan (theme
 * switch, new content, resize) sets `html[data-flow-scan]`, which turns
 * the rule off, reads the true colours and removes it in the same task:
 * nothing paints in between.
 */

const MARK = "data-flow-clear";
const SCAN = "data-flow-scan";
const FLOW = "data-flow";
const MIN_WIDTH_SHARE = 0.9;
/** Mutations are batched: one rescan at most this often. */
const SCAN_THROTTLE_MS = 250;
/** A shell must be at least this share of the view tall to set the page colour. */
const SHELL_HEIGHT_SHARE = 0.75;
/** A surface still waiting for hydration is looked at again this often. */
const HYDRATION_RETRY_MS = 400;

/**
 * Whether React owns this element yet. A streamed page hydrates its
 * sections after the stage may already be up, and an attribute added to
 * server HTML before its section hydrates is a hydration mismatch. React
 * keeps its fiber on the element under a `__reactFiber$` key once it has
 * hydrated (or rendered) it.
 */
function hydrated(element: Element) {
  return Object.keys(element).some((key) => key.startsWith("__reactFiber$"));
}

function sameColor(a: Rgb, b: Rgb) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 3;
}

/**
 * The page colour: what the root canvas shows (the body's background,
 * which propagates to it while <html> has none).
 */
export function pageColor(): Rgb {
  for (const element of [document.body, document.documentElement]) {
    const parsed = parseCssColor(getComputedStyle(element).backgroundColor);
    if (parsed && parsed.alpha >= 0.99) return parsed.rgb;
  }
  return [255, 255, 255];
}

type Surface = { background: ReturnType<typeof parseCssColor>; picture: boolean };

/** A box the scan may look at, or null (the footer, kept, hidden, fixed or sticky). */
function readSurface(element: Element): Surface | null {
  if (!(element instanceof HTMLElement)) return null;
  if (element.tagName === "FOOTER" || element.hasAttribute("data-flow-keep")) return null;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.position === "fixed" || style.position === "sticky") {
    return null;
  }
  return {
    background: parseCssColor(style.backgroundColor),
    picture: style.backgroundImage !== "none",
  };
}

/**
 * The colour of the page's shell: the first opaque full-width box under
 * the content, when it fills most of the view. Null when that box is
 * smaller (a band, a hero of its own) or there is none.
 */
function shellSurface(content: Element, minWidth: number): Rgb | null {
  const minHeight = window.innerHeight * SHELL_HEIGHT_SHARE;
  const queue: Element[] = [content];
  for (let index = 0; index < queue.length && index < 60; index += 1) {
    const element = queue[index];
    const surface = readSurface(element);
    if (!surface) continue;
    if (surface.picture) return null;
    const { background } = surface;
    if (background && background.alpha > 0.01) {
      const fills = element.getBoundingClientRect().height >= minHeight;
      return background.alpha >= 0.99 && fills ? background.rgb : null;
    }
    for (const child of element.children) {
      if (child.getBoundingClientRect().width >= minWidth) queue.push(child);
    }
  }
  return null;
}

export class FlowSurfaces {
  private attached = false;
  private observer: MutationObserver | null = null;
  private timer = 0;
  private lastScan = 0;
  private shell: Rgb | null = null;

  /** Marks the page and clears its surfaces. Returns the page colour it matched. */
  attach(): Rgb {
    document.documentElement.setAttribute(FLOW, "");
    if (!this.attached) {
      this.attached = true;
      this.observer = new MutationObserver(this.onMutation);
      // New content, and class changes (a section switching its colour).
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return this.scan();
  }

  /** Removes every marker: the page is exactly as it is without the stage. */
  detach() {
    this.attached = false;
    this.observer?.disconnect();
    this.observer = null;
    window.clearTimeout(this.timer);
    this.timer = 0;
    for (const element of document.querySelectorAll(`[${MARK}]`)) element.removeAttribute(MARK);
    document.documentElement.removeAttribute(FLOW);
    document.documentElement.removeAttribute(SCAN);
  }

  /**
   * The colour the stage paints under a page whose shell has a colour of
   * its own (null: the body's colour). See `scan`.
   */
  get shellColor(): Rgb | null {
    return this.shell;
  }

  /**
   * Rescans now (a theme switch, a resize, a route change). Returns the
   * colour the stage should paint: the page colour.
   *
   * The page colour is the body's, unless the page sits in a shell of
   * another colour that fills the view (the events, careers, research,
   * publications and projects pages wrap everything in one): the first
   * opaque full-width box decides. The stage then paints the shell's
   * colour, the shell and its surfaces in that colour clear, and the
   * header reads the shell's colour where it looks through them.
   */
  scan(): Rgb {
    const html = document.documentElement;
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.lastScan = performance.now();
    // The rule stays off while this reads the real colours.
    html.setAttribute(SCAN, "");
    const body = pageColor();
    const previous = new Set(document.querySelectorAll(`[${MARK}]`));
    const marked = new Set<Element>();
    let waiting = false;
    let color = body;
    this.shell = null;
    const content = document.getElementById("smooth-content");
    const minWidth = (html.clientWidth || window.innerWidth) * MIN_WIDTH_SHARE;
    if (content) {
      const shell = shellSurface(content, minWidth);
      if (shell && !sameColor(shell, body)) {
        color = shell;
        this.shell = shell;
      }
      const queue: Element[] = [content];
      for (let index = 0; index < queue.length && index < 600; index += 1) {
        const element = queue[index];
        const surface = readSurface(element);
        if (!surface) continue;
        let seeThrough = !surface.picture;
        const { background } = surface;
        if (background && background.alpha > 0.01) {
          if (background.alpha >= 0.99 && sameColor(background.rgb, color)) {
            if (element === content) {
              // The content box itself stays as it is.
            } else if (previous.has(element) || hydrated(element)) {
              marked.add(element);
            } else {
              waiting = true;
            }
          } else {
            seeThrough = false;
          }
        }
        if (!seeThrough) continue;
        for (const child of element.children) {
          if (child.getBoundingClientRect().width >= minWidth) queue.push(child);
        }
      }
    }
    for (const element of previous) if (!marked.has(element)) element.removeAttribute(MARK);
    for (const element of marked) if (!previous.has(element)) element.setAttribute(MARK, "");
    html.removeAttribute(SCAN);
    // Hydration mutates nothing, so a surface left for it is retried on a timer.
    if (waiting && this.attached) {
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        if (this.attached) this.scan();
      }, HYDRATION_RETRY_MS);
    }
    return color;
  }

  private readonly onMutation = (records: MutationRecord[]) => {
    if (!this.attached) return;
    let relevant = false;
    for (const record of records) {
      const target = record.target;
      // Only page content matters, not the portals and overlays on <body>.
      if (!(target instanceof Element)) continue;
      if (target.id !== "smooth-content" && !target.closest("#smooth-content")) continue;
      // A cleared surface (or a box around one) changing its classes may
      // have changed its colour: rescan now, before it paints.
      if (
        record.type === "attributes" &&
        (target.hasAttribute(MARK) || target.querySelector(`[${MARK}]`))
      ) {
        this.scan();
        return;
      }
      relevant = true;
    }
    if (!relevant || this.timer) return;
    const wait = Math.max(0, SCAN_THROTTLE_MS - (performance.now() - this.lastScan));
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (this.attached) this.scan();
    }, wait);
  };
}
