import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import { setPageScroller, type PageScrollOptions, type PageScrollTarget } from "@/lib/page-scroll";
import { isScrollLocked, onScrollLockChange } from "@/lib/scroll-lock";

/**
 * Wheel smoothing for /projects (Lenis), run only for fine-pointer,
 * full-motion visitors; touch keeps native scrolling. Lenis moves the real
 * window scroll (no transformed wrapper), so `position: fixed`, sticky and
 * every scroll reader on the page keep working unchanged.
 *
 * Lenis is stepped from the shared frame loop's "scroll" phase instead of
 * its own rAF, so the WebGL cover stage (the "render" phase) always draws
 * against the scroll position of the very same frame.
 *
 * Loaded with a dynamic import from the /projects client code only, so the
 * library never lands in a chunk other routes load.
 */

// Lenis damps toward the wheel target with lambda = lerp * 60 per second.
// 0.15 (about a 110 ms time constant) sits between Lenis's floaty default
// (0.1) and lusion's snappier wheel easing (12/s): smooth, never sluggish.
const WHEEL_LERP = 0.15;

// power3.inOut in GSAP's naming (a quartic), matching the rest of the
// site's programmatic scrolls.
const easeInOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);

// Keyboard scrolling (lusion-style steps): arrows move 100px, Page Up/Down
// and Space most of a screen, Home/End glide to either end.
const ARROW_STEP = 100;
const PAGE_STEP = 0.85; // of the viewport height
const EDGE_GLIDE_SECONDS = 1.2;

// Keys typed into these keep their own meaning (Space presses a button,
// arrows move a slider or a caret, and so on).
const KEY_OWNERS =
  "input, textarea, select, button, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='listbox'], [role='menu'], [role='menubar'], [role='slider'], [role='spinbutton'], [role='tablist'], [role='radiogroup'], [role='grid'], [role='tree'], [data-lenis-prevent]";

/** True when a scrollable element between `node` and the page would take the key. */
function insideNestedScroller(node: Element | null) {
  for (
    let el = node;
    el && el !== document.body && el !== document.documentElement;
    el = el.parentElement
  ) {
    if (el.scrollHeight <= el.clientHeight) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === "auto" || overflow === "scroll") return true;
  }
  return false;
}

/** Starts the smooth scroller; resolves with its stop function. */
export async function startSmoothScroll(): Promise<() => void> {
  const { default: Lenis } = await import("lenis");

  const lenis = new Lenis({
    autoRaf: false,
    lerp: WHEEL_LERP,
    smoothWheel: true,
    syncTouch: false,
    // Wheel over a nested scroll area (the nav menu panel, when it
    // overflows) scrolls that area natively instead of the page.
    allowNestedScroll: true,
  });

  // The route-change handler and the hero both reset the window scroll
  // with a plain window.scrollTo; start from wherever the page really is.
  lenis.resize();

  // The hero's intro lock (or an open nav menu) may already be held. While
  // stopped, Lenis also swallows wheel events, so nothing scrolls behind a
  // locked page; restarting re-syncs its target to the real position, and
  // resize() re-reads the page height in case it changed while locked.
  if (isScrollLocked()) lenis.stop();
  const offLock = onScrollLockChange((locked) => {
    if (locked) {
      lenis.stop();
    } else {
      lenis.start();
      lenis.resize();
    }
  });

  const offFrame = addFrameCallback("scroll", (time) => lenis.raf(time * 1000));

  // The browser animates keyboard scrolling itself, possibly on the
  // compositor where the WebGL covers can't follow in the same frame; the
  // scroll keys go through Lenis instead, with the wheel's easing.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (lenis.isStopped) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(KEY_OWNERS) || insideNestedScroller(target)) return;

    const page = window.innerHeight * PAGE_STEP;
    let step = 0;
    switch (event.key) {
      case "ArrowDown":
        step = ARROW_STEP;
        break;
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
      case "End":
        event.preventDefault();
        lenis.scrollTo(event.key === "Home" ? 0 : lenis.limit, {
          duration: EDGE_GLIDE_SECONDS,
          easing: easeInOutQuart,
        });
        return;
      default:
        return;
    }
    event.preventDefault();
    // Not "programmatic": repeated presses keep adding to the target, the
    // same way wheel notches do.
    lenis.scrollTo(lenis.targetScroll + step, { programmatic: false, lerp: WHEEL_LERP });
  };
  window.addEventListener("keydown", onKeyDown);

  // scrollPageTo() callers (the hero's arrow) go through Lenis, which a
  // direct window.scrollTo would otherwise fight toward its own target.
  // Elements resolve to a plain document offset, the same way the native
  // fallback in page-scroll.ts does (the caller's offset already accounts
  // for any scroll margin).
  const offScroller = setPageScroller(
    (target: PageScrollTarget, { duration = 1, offset = 0 }: PageScrollOptions) => {
      const y =
        typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
      lenis.scrollTo(Math.max(0, y + offset), {
        duration: Math.max(duration, 0),
        easing: easeInOutQuart,
        immediate: duration <= 0,
      });
    },
  );

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    offScroller();
    offFrame();
    offLock();
    lenis.destroy();
  };
}
