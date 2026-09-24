import gsap from "gsap";

import { getArticlesWorld } from "@/components/articles/world/world-registry";
import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";

/**
 * A story picture opens large: a click (or Enter or Space on its frame, which
 * becomes a button) lifts the picture out of the page and flies it to the
 * middle of the screen while the page behind sinks into the article's
 * colour, and the world answers with a ripple where it was touched. The crop
 * the layout gave it opens up on the way (the flying box morphs to the
 * picture's own shape, the picture itself is never stretched), so a
 * full-bleed slice arrives whole. Its caption follows underneath.
 *
 * It closes on a click anywhere, Escape, the close button or a wheel turn,
 * flying back into its frame. The page is locked meanwhile (the smooth
 * scroller stops too), so the frame is still where it left. Reduced motion
 * opens and closes it at once.
 *
 * The overlay lives on <body> (above the header) and is plain DOM built here;
 * the page's theme variables sit on :root, so it wears the article's colours.
 */

const LOCK = "article-image-zoom";
const OPEN_SECONDS = 0.8;
const CLOSE_SECONDS = 0.62;
/** A picture is never shown larger than this times its own pixel size. */
const MAX_UPSCALE = 1.35;

type Box = { left: number; top: number; width: number; height: number };

type Open = {
  frame: HTMLElement;
  overlay: HTMLElement;
  backdrop: HTMLElement;
  picture: HTMLElement;
  caption: HTMLElement | null;
  close: HTMLButtonElement;
  closing: boolean;
  timeline: gsap.core.Timeline | null;
};

const FRAME_SELECTOR = "[data-zoomable] [data-ad-frame]";

function intersect(a: Box, b: Box): Box {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** The part of the frame the picture actually shows (a contained one leaves a matte). */
function shownBox(frame: HTMLElement, img: HTMLImageElement): Box {
  const frameRect = frame.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();
  if (getComputedStyle(img).objectFit !== "contain") return intersect(frameRect, imgRect);
  const ratio = img.naturalWidth / img.naturalHeight;
  let width = imgRect.width;
  let height = width / ratio;
  if (height > imgRect.height) {
    height = imgRect.height;
    width = height * ratio;
  }
  const box = {
    left: imgRect.left + (imgRect.width - width) / 2,
    top: imgRect.top + (imgRect.height - height) / 2,
    width,
    height,
  };
  return intersect(frameRect, box);
}

/** Where the picture rests while open: whole, centred, above its caption. */
function targetBox(img: HTMLImageElement, captioned: boolean): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const side = Math.max(20, vw * 0.05);
  const top = Math.max(56, vh * 0.08);
  const bottom = captioned ? Math.max(96, vh * 0.14) : top;
  const ratio = img.naturalWidth / img.naturalHeight;
  let width = Math.min(vw - side * 2, img.naturalWidth * MAX_UPSCALE);
  let height = width / ratio;
  const room = vh - top - bottom;
  if (height > room) {
    height = room;
    width = height * ratio;
  }
  return {
    left: (vw - width) / 2,
    top: top + (room - height) / 2,
    width,
    height,
  };
}

/** Lucide's "x", drawn with the site's stroke (styled in detail.css). */
function closeIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M18 6 6 18M6 6l12 12");
  svg.appendChild(path);
  return svg;
}

function captionOf(frame: HTMLElement) {
  const figure = frame.closest<HTMLElement>("[data-ad-figure]");
  const text = figure?.querySelector<HTMLElement>(".ad-caption > span:last-child")?.textContent;
  return text?.trim() ?? "";
}

export class ImageZoom {
  private open: Open | null = null;
  private disposed = false;

  constructor(
    private readonly root: HTMLElement,
    private animate: boolean,
  ) {
    for (const frame of root.querySelectorAll<HTMLElement>(FRAME_SELECTOR)) {
      const caption = captionOf(frame);
      frame.tabIndex = 0;
      frame.setAttribute("role", "button");
      frame.setAttribute("aria-label", caption ? `Enlarge picture: ${caption}` : "Enlarge picture");
    }
    root.addEventListener("click", this.onClick);
    root.addEventListener("keydown", this.onFrameKey);
  }

  /** Reduced motion switched on: from now on it opens and closes at once. */
  setAnimate(animate: boolean) {
    this.animate = animate;
  }

  dispose() {
    this.disposed = true;
    this.root.removeEventListener("click", this.onClick);
    this.root.removeEventListener("keydown", this.onFrameKey);
    if (this.open) this.teardown(this.open, false);
  }

  private readonly onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const frame = event.target instanceof Element ? event.target.closest(FRAME_SELECTOR) : null;
    if (!(frame instanceof HTMLElement)) return;
    event.preventDefault();
    this.show(frame, { x: event.clientX, y: event.clientY });
  };

  private readonly onFrameKey = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const frame = event.target instanceof HTMLElement ? event.target : null;
    if (!frame?.matches(FRAME_SELECTOR)) return;
    event.preventDefault();
    const rect = frame.getBoundingClientRect();
    this.show(frame, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  private show(frame: HTMLElement, at: { x: number; y: number }) {
    if (this.open || this.disposed) return;
    const img = frame.querySelector("img");
    if (!img || !img.complete || !img.naturalWidth) return;

    const caption = captionOf(frame);
    const from = shownBox(frame, img);
    const to = targetBox(img, Boolean(caption));

    const overlay = document.createElement("div");
    overlay.className = "ad-zoom";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", caption || "Picture");

    const backdrop = document.createElement("div");
    backdrop.className = "ad-zoom-backdrop";

    const picture = document.createElement("div");
    picture.className = "ad-zoom-picture";
    const copy = document.createElement("img");
    copy.alt = img.alt;
    copy.src = img.currentSrc || img.src;
    copy.decoding = "sync";
    picture.appendChild(copy);

    let captionEl: HTMLElement | null = null;
    if (caption) {
      captionEl = document.createElement("p");
      captionEl.className = "ad-zoom-caption";
      captionEl.textContent = caption;
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "ad-zoom-close";
    close.setAttribute("aria-label", "Close picture");
    close.appendChild(closeIcon());

    overlay.append(backdrop, picture);
    if (captionEl) overlay.appendChild(captionEl);
    overlay.appendChild(close);
    document.body.appendChild(overlay);

    const open: Open = {
      frame,
      overlay,
      backdrop,
      picture,
      caption: captionEl,
      close,
      closing: false,
      timeline: null,
    };
    this.open = open;
    acquireScrollLock(LOCK);
    frame.style.visibility = "hidden";

    overlay.addEventListener("click", () => this.hide());
    overlay.addEventListener("wheel", () => this.hide(), { passive: true });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.hide();
      } else if (event.key === "Tab") {
        // The close button is the only thing to reach in here.
        event.preventDefault();
        close.focus();
      }
    });
    close.focus({ preventScroll: true });

    getArticlesWorld()?.fx.pulse(at.x, at.y, 0.45);

    const seconds = this.animate ? OPEN_SECONDS : 0;
    const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
    tl.fromTo(
      backdrop,
      { opacity: 0 },
      { opacity: 1, duration: seconds * 0.8, ease: "power2.out" },
      0,
    );
    tl.fromTo(
      picture,
      { ...from, rotationX: this.animate ? 6 : 0, transformPerspective: 1400 },
      { ...to, rotationX: 0, duration: seconds },
      0,
    );
    // The frame's rounded corners give way to softer ones at full size.
    tl.fromTo(
      picture,
      { borderRadius: getComputedStyle(frame).borderTopLeftRadius || "0px" },
      { borderRadius: "14px", duration: seconds },
      0,
    );
    if (captionEl) {
      tl.fromTo(
        captionEl,
        { opacity: 0, y: this.animate ? 14 : 0 },
        { opacity: 1, y: 0, duration: seconds * 0.9, ease: "expo.out" },
        seconds * 0.45,
      );
    }
    tl.fromTo(close, { opacity: 0 }, { opacity: 1, duration: seconds * 0.6 }, seconds * 0.3);
    open.timeline = tl;
  }

  private hide() {
    const open = this.open;
    if (!open || open.closing) return;
    open.closing = true;
    open.timeline?.kill();
    const img = open.frame.querySelector("img");
    if (!this.animate || !img) {
      this.teardown(open, true);
      return;
    }
    // The frame hasn't moved (the page was locked): fly back into it.
    open.frame.style.visibility = "";
    const to = shownBox(open.frame, img);
    open.frame.style.visibility = "hidden";
    const tl = gsap.timeline({
      defaults: { ease: "power3.inOut" },
      onComplete: () => this.teardown(open, true),
    });
    tl.to(open.picture, { ...to, rotationX: 4, duration: CLOSE_SECONDS }, 0);
    tl.to(
      open.picture,
      {
        borderRadius: getComputedStyle(open.frame).borderTopLeftRadius || "0px",
        duration: CLOSE_SECONDS,
      },
      0,
    );
    tl.to(open.backdrop, { opacity: 0, duration: CLOSE_SECONDS, ease: "power2.inOut" }, 0);
    if (open.caption) tl.to(open.caption, { opacity: 0, duration: 0.25, ease: "power1.out" }, 0);
    tl.to(open.close, { opacity: 0, duration: 0.25, ease: "power1.out" }, 0);
    open.timeline = tl;
  }

  private teardown(open: Open, restoreFocus: boolean) {
    open.timeline?.kill();
    open.overlay.remove();
    open.frame.style.visibility = "";
    releaseScrollLock(LOCK);
    if (this.open === open) this.open = null;
    if (restoreFocus) open.frame.focus({ preventScroll: true });
  }
}
