import gsap from "gsap";

import type { HeaderPaletteWalk } from "@/components/transition/project-zoom-colors";
import { setArticleTransitionBusy } from "@/lib/article-transition";
import type { ProjectPalette } from "@/lib/project-themes";
import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";

/**
 * The next-article flood: the layer in the next article's colours that
 * rises as a dome over the end of the page, floods the screen, and is still
 * on screen when the next article mounts underneath it.
 *
 * It lives on <body>, owned by this module, not by the page: once the
 * hand-off navigates, the old page may unmount (or give way to the route's
 * loading state) before the next one has rendered, and everything the old
 * page rendered goes with it. The flood, the header palette walk, the busy
 * flag and the scroll lock therefore stay here until the arriving page
 * adopts the flood (and fades it away as its own entrance starts), the
 * hand-off is abandoned, or a ceiling runs out.
 *
 * The flood carries a copy of the threshold's texts (the next title, "Next
 * article", "(Keep scrolling)") in the next palette: clipped by the same
 * dome as the colour, they recolour exactly where the dome passes.
 */

const LOCK = "article-next-handoff";
/** The next page shows "(Loading)" if it hasn't taken over this long after the push. */
const LOADER_MS = 1000;
/** Visible time after the push before the hand-off gives up and loads the page for real. */
const CEILING_MS = 9000;

export type FloodParts = {
  root: HTMLElement;
  inner: HTMLElement;
  title: HTMLElement | null;
  label: HTMLElement | null;
  hint: HTMLElement | null;
  bar: HTMLElement | null;
};

type Pending = {
  slug: string;
  href: string;
  parts: FloodParts;
  walk: HeaderPaletteWalk | null;
  loaderTimer: number;
  ceiling: number;
  offClicks: () => void;
  offPop: () => void;
};

let pending: Pending | null = null;

/** Builds the flood on <body> from the threshold's inner block, in `palette`. */
export function createFlood(source: HTMLElement, palette: ProjectPalette): FloodParts {
  const root = document.createElement("div");
  root.className = "ad-flood";
  root.setAttribute("aria-hidden", "true");
  root.dataset.adFlood = "";
  paintFlood(root, palette);
  const inner = source.cloneNode(true) as HTMLElement;
  inner.classList.add("ad-flood-inner");
  inner.removeAttribute("data-ad-next-inner");
  root.appendChild(inner);
  document.body.appendChild(root);
  return {
    root,
    inner,
    title: inner.querySelector("[data-ad-next-title]"),
    label: inner.querySelector("[data-ad-next-label]"),
    hint: inner.querySelector("[data-ad-next-hint]"),
    bar: inner.querySelector("[data-ad-next-bar]"),
  };
}

/** Writes the palette as the flood's own variables (the page's stylesheet may go first). */
export function paintFlood(root: HTMLElement, palette: ProjectPalette) {
  const style = root.style;
  style.setProperty("--project-bg", palette.bg);
  style.setProperty("--project-text", palette.text);
  style.setProperty("--project-highlight", palette.highlight);
  style.setProperty("--project-muted", `color-mix(in srgb, ${palette.text} 70%, ${palette.bg})`);
  style.setProperty("--project-line", `color-mix(in srgb, ${palette.text} 16%, ${palette.bg})`);
}

/**
 * Takes the flood over from the page that built it: from here on this
 * module keeps it (and the header walk, the busy flag and the lock) until
 * the page at `href` adopts it. Returns false when another hand-off is
 * already pending.
 */
export function holdFlood(options: {
  slug: string;
  href: string;
  parts: FloodParts;
  walk: HeaderPaletteWalk | null;
  onGiveUp: (href: string) => void;
}) {
  if (pending) return false;
  acquireScrollLock(LOCK);
  setArticleTransitionBusy(true);

  // Nothing else on the page may be clicked while the flood covers it.
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, true);

  // Browser Back or Forward mid-hand-off: the visitor went elsewhere.
  const onPop = () => releaseFlood(0.35);
  window.addEventListener("popstate", onPop);

  // The ceiling counts visible time only (docs/animation-system.md gotcha #18).
  let waited = 0;
  let last = performance.now();
  const ceiling = window.setInterval(() => {
    const now = performance.now();
    if (!document.hidden) waited += now - last;
    last = now;
    if (waited < CEILING_MS) return;
    const href = pending?.href;
    releaseFlood(0);
    if (href) options.onGiveUp(href);
  }, 250);

  pending = {
    slug: options.slug,
    href: options.href,
    parts: options.parts,
    walk: options.walk,
    loaderTimer: 0,
    ceiling,
    offClicks: () => window.removeEventListener("click", swallow, true),
    offPop: () => window.removeEventListener("popstate", onPop),
  };
  return true;
}

/** The hand-off has navigated: "(Loading)" shows if the next page takes a while. */
export function markFloodNavigated() {
  const current = pending;
  if (!current || current.loaderTimer) return;
  current.loaderTimer = window.setTimeout(() => {
    if (pending === current) current.parts.root.dataset.loading = "";
  }, LOADER_MS);
}

/** Whether a hand-off is waiting for `slug`'s page (read-only, safe while rendering). */
export function isFloodPending(slug?: string) {
  return Boolean(pending && (!slug || pending.slug === slug));
}

/**
 * The arriving page takes the flood: it stays opaque until `reveal()`,
 * which fades it away and hands everything back. Returns null when no
 * hand-off brought this page in.
 */
export function adoptFlood(slug: string) {
  if (!pending || pending.slug !== slug) return null;
  const adopted = pending;
  window.clearTimeout(adopted.loaderTimer);
  delete adopted.parts.root.dataset.loading;
  return {
    /** Fades the flood out over `seconds` and releases the lock, the walk and the busy flag. */
    reveal(seconds = 0.8) {
      if (pending !== adopted) return;
      releaseFlood(seconds);
    },
  };
}

/** Ends any pending hand-off: fades the flood out (0 removes it now) and releases everything. */
export function releaseFlood(seconds = 0.4) {
  const current = pending;
  if (!current) return;
  pending = null;
  window.clearTimeout(current.loaderTimer);
  window.clearInterval(current.ceiling);
  current.offClicks();
  current.offPop();
  // The page underneath carries its own palette by now.
  current.walk?.release();
  releaseScrollLock(LOCK);
  const { root } = current.parts;
  const done = () => {
    root.remove();
    setArticleTransitionBusy(false);
  };
  if (seconds <= 0) {
    done();
    return;
  }
  gsap.to(root, { opacity: 0, duration: seconds, ease: "power2.out", onComplete: done });
}

/** Removes a flood the page built but never handed over (the pull was cancelled). */
export function discardFlood(parts: FloodParts) {
  if (pending?.parts === parts) return;
  parts.root.remove();
}
