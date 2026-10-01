"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";

import { STORY_CONTROLS } from "@/data/story";

/**
 * What the WebGL section shows while its engine is still on the way (the
 * bytes, the parse, the warm-up): a small four-point star and "Shuffling
 * the deck" with the build's progress, fixed at the centre of the screen
 * while the tall section covers it. Without it a visitor who arrives early
 * scrolls through empty screens. It sits in a root before `#smooth-wrapper`
 * (a fixed box inside the smoothed page would scroll away), shows only
 * between the entrance and the finale screen, and goes the moment the
 * engine attaches or the visit falls back to the storybook.
 */

/** The card back's four-point star (inner radius 0.314 of the outer). */
const STAR = "M12 1 L14.44 9.56 L23 12 L14.44 14.44 L12 23 L9.56 14.44 L1 12 L9.56 9.56 Z";

function useWaitingRoot() {
  const [root] = useState(() => {
    const element = document.createElement("div");
    element.dataset.storyWaitingRoot = "";
    return element;
  });
  useLayoutEffect(() => {
    const wrapper = document.getElementById("smooth-wrapper");
    if (wrapper?.parentElement) wrapper.before(root);
    else document.body.append(root);
    return () => {
      root.remove();
    };
  }, [root]);
  return root;
}

export function StoryWaiting({
  section,
  fraction,
}: Readonly<{ section: HTMLElement; fraction: number | null }>) {
  const root = useWaitingRoot();
  const boxRef = useRef<HTMLDivElement>(null);

  // Once a frame, after the smoother moved the page: shown while the section covers the screen.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let shown: boolean | null = null;
    const tick = () => {
      const rect = section.getBoundingClientRect();
      const height = window.innerHeight;
      const covers = rect.top < -height * 0.3 && rect.bottom > height * 1.9;
      if (covers === shown) return;
      shown = covers;
      box.dataset.shown = covers ? "true" : "false";
    };
    tick();
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
    };
  }, [section]);

  const percent = fraction === null ? null : Math.min(99, Math.round(fraction * 100));
  return createPortal(
    <div ref={boxRef} data-story-waiting data-shown="false" className="story-waiting">
      <div role="status" className="story-waiting-body">
        <svg aria-hidden viewBox="0 0 24 24" className="story-waiting-star">
          <path d={STAR} />
        </svg>
        <span>{STORY_CONTROLS.waiting}</span>
        {percent === null ? null : (
          <span aria-hidden className="story-waiting-count">
            {String(percent).padStart(2, "0")}%
          </span>
        )}
      </div>
    </div>,
    root,
  );
}
