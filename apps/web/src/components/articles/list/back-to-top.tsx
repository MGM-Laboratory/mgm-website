"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";

import { getArticlesWorld } from "@/components/articles/world/world-registry";
import { scrollPageTo } from "@/lib/page-scroll";
import { motionAllowed } from "@/lib/reduced-motion";

/** Shown once the list is scrolled past this share of a viewport. */
const SHOW_AFTER = 0.6;
const RETURN_SECONDS = 1.2;
/** The river's smear while it rewinds (the world's motion blur, scaled). */
const REWIND_BLUR = 2.6;

/**
 * Back to the top of the list, bottom left: a round glass button with an
 * arrow and a ring that fills with how far down the list the visitor is.
 * It appears once the list is scrolled past most of a screen and hides
 * again at the top. Hover lifts the arrow away while a second one chases it
 * up from below and the ring glows; pressing sinks it a little. The trip up
 * goes through the page's smooth scroller while the world smears the river
 * as if it were rewinding; reduced motion jumps.
 *
 * Scroll state lives in data attributes and one CSS variable, so scrolling
 * never re-renders React.
 */
export function BackToTop() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rewindRef = useRef<number | null>(null);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const y = window.scrollY;
      const progress = Math.min(1, Math.max(0, y / max));
      button.style.setProperty("--progress", progress.toFixed(4));
      const shown = y > window.innerHeight * SHOW_AFTER;
      if (shown !== (button.dataset.shown === "true")) button.dataset.shown = String(shown);
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    const observer = new ResizeObserver(queue);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      observer.disconnect();
      if (rewindRef.current !== null) {
        window.clearTimeout(rewindRef.current);
        getArticlesWorld()?.fx.setBlurAmount(1);
      }
    };
  }, []);

  const goUp = (event: MouseEvent<HTMLButtonElement>) => {
    const motion = motionAllowed();
    const world = getArticlesWorld();
    if (motion && world) {
      const rect = event.currentTarget.getBoundingClientRect();
      world.fx.setBlurAmount(REWIND_BLUR);
      world.fx.pulse(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.6);
      if (rewindRef.current !== null) window.clearTimeout(rewindRef.current);
      rewindRef.current = window.setTimeout(
        () => {
          rewindRef.current = null;
          getArticlesWorld()?.fx.setBlurAmount(1);
        },
        RETURN_SECONDS * 1000 + 200,
      );
    }
    scrollPageTo(0, { duration: motion ? RETURN_SECONDS : 0 });
    // From the keyboard, focus follows to the top of the page.
    if (event.detail === 0) {
      document.querySelector<HTMLElement>(".articles-title")?.focus({ preventScroll: true });
    }
  };

  return (
    <button
      aria-label="Back to top"
      className="articles-top"
      data-articles-top=""
      data-shown="false"
      onClick={goUp}
      ref={buttonRef}
      type="button"
    >
      <svg aria-hidden="true" className="articles-top-ring" viewBox="0 0 48 48">
        <circle className="articles-top-track" cx="24" cy="24" r="22.5" />
        <circle className="articles-top-fill" cx="24" cy="24" pathLength="1" r="22.5" />
      </svg>
      <span aria-hidden="true" className="articles-top-arrows">
        <ArrowUp className="articles-top-arrow" strokeWidth={2.25} />
        <ArrowUp className="articles-top-arrow is-chaser" strokeWidth={2.25} />
      </span>
    </button>
  );
}
