"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";

import type { ArticleCategory } from "@/lib/article-index";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Pointer travel (px) after which a press on the pills becomes a drag, not a click. */
const DRAG_THRESHOLD = 5;

type Pill = { slug: string | null; name: string; count: number };

/**
 * The category pills: "All" plus every category with its count, in one
 * glass bar that scrolls sideways when it overflows (fading edges, and a
 * mouse can drag it).
 *
 * The active highlight slides between pills: a second copy of the row, in
 * the active colours, sits exactly over the first and is clipped to the
 * active pill's box. Moving the clip moves the highlight and recolours the
 * labels exactly where it passes, with the leading edge a beat ahead of the
 * trailing one so it stretches as it travels (the edges are registered
 * custom properties with their own transitions, articles.css).
 */
export function CategoryPills({
  active,
  all,
  categories,
  onPick,
  className,
}: {
  active?: string;
  all: number;
  categories: ArticleCategory[];
  onPick: (slug: string | null) => void;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const placeRef = useRef<((instant: boolean) => void) | null>(null);
  const pills: Pill[] = [
    { slug: null, name: "All", count: all },
    ...categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      count: category.count,
    })),
  ];
  const activeSlug = active ?? null;
  const known = pills.some((pill) => pill.slug === activeSlug);
  const current = known ? activeSlug : null;

  // Place the highlight on the active pill (and keep it there on resize).
  useIsomorphicLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const row = rowRef.current;
    const layer = layerRef.current;
    if (!scroller || !row || !layer) return;
    let previousLeft: number | null = null;
    const place = (instant: boolean) => {
      // Read from the DOM: it always carries the latest render's active pill.
      const pill = row.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!pill) return;
      const width = row.scrollWidth;
      const height = row.offsetHeight;
      const left = pill.offsetLeft;
      const right = width - (pill.offsetLeft + pill.offsetWidth);
      const top = pill.offsetTop;
      const bottom = height - (pill.offsetTop + pill.offsetHeight);
      layer.dataset.dir = previousLeft === null || left >= previousLeft ? "right" : "left";
      previousLeft = left;
      if (instant) layer.dataset.instant = "";
      layer.style.setProperty("--hl-left", `${left}px`);
      layer.style.setProperty("--hl-right", `${right}px`);
      layer.style.setProperty("--hl-top", `${top}px`);
      layer.style.setProperty("--hl-bottom", `${bottom}px`);
      if (instant) {
        // Commit the jump before the transitions come back.
        void layer.offsetWidth;
        delete layer.dataset.instant;
      }
    };
    place(true);
    const observer = new ResizeObserver(() => place(true));
    observer.observe(row);
    placeRef.current = place;
    return () => {
      observer.disconnect();
      placeRef.current = null;
    };
    // Re-created when the pills change; the active pill moves through the effect below.
  }, [pills.length]);

  useEffect(() => {
    placeRef.current?.(false);
    // Bring the active pill into view inside the bar.
    const scroller = scrollerRef.current;
    const pill = rowRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!scroller || !pill) return;
    const left = pill.offsetLeft;
    const right = left + pill.offsetWidth;
    const view = scroller.clientWidth;
    if (left < scroller.scrollLeft + 24 || right > scroller.scrollLeft + view - 24) {
      const smooth = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
      scroller.scrollTo({
        left: Math.max(0, left - (view - pill.offsetWidth) / 2),
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, [current]);

  // Fading edges where the bar overflows, and mouse drag to scroll it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const edges = () => {
      const max = scroller.scrollWidth - scroller.clientWidth;
      if (max > 1) scroller.dataset.overflow = "";
      else delete scroller.dataset.overflow;
      scroller.dataset.fadeStart = scroller.scrollLeft > 2 ? "on" : "off";
      scroller.dataset.fadeEnd = scroller.scrollLeft < max - 2 ? "on" : "off";
    };
    edges();
    const observer = new ResizeObserver(edges);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    scroller.addEventListener("scroll", edges, { passive: true });

    let drag: { x: number; left: number; moved: boolean; id: number } | null = null;
    let swallowClick = false;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
      drag = { x: event.clientX, left: scroller.scrollLeft, moved: false, id: event.pointerId };
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!drag.moved) {
        drag.moved = true;
        scroller.setPointerCapture(event.pointerId);
        scroller.dataset.dragging = "";
      }
      scroller.scrollLeft = drag.left - dx;
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.moved) {
        swallowClick = true;
        window.setTimeout(() => {
          swallowClick = false;
        }, 0);
        delete scroller.dataset.dragging;
        if (scroller.hasPointerCapture(event.pointerId))
          scroller.releasePointerCapture(event.pointerId);
      }
      drag = null;
    };
    const click = (event: MouseEvent) => {
      if (!swallowClick) return;
      event.preventDefault();
      event.stopPropagation();
      swallowClick = false;
    };
    scroller.addEventListener("pointerdown", down);
    scroller.addEventListener("pointermove", move);
    scroller.addEventListener("pointerup", up);
    scroller.addEventListener("pointercancel", up);
    scroller.addEventListener("click", click, true);
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", edges);
      scroller.removeEventListener("pointerdown", down);
      scroller.removeEventListener("pointermove", move);
      scroller.removeEventListener("pointerup", up);
      scroller.removeEventListener("pointercancel", up);
      scroller.removeEventListener("click", click, true);
    };
  }, []);

  return (
    <div className={className ? `articles-pillbar ${className}` : "articles-pillbar"}>
      <div
        className="articles-pills-scroller"
        data-fade-end="off"
        data-fade-start="off"
        ref={scrollerRef}
      >
        <div className="articles-pills-track">
          <div aria-label="Categories" className="articles-pills" ref={rowRef} role="group">
            {pills.map((pill, index) => (
              <button
                aria-pressed={pill.slug === current}
                className="articles-pill"
                data-pill={pill.slug ?? ""}
                key={pill.slug ?? "all"}
                onClick={() => onPick(pill.slug === current ? null : pill.slug)}
                style={{ "--pill-i": index } as CSSProperties}
                type="button"
              >
                <span className="articles-pill-name">{pill.name}</span>
                <span className="articles-pill-count">{pill.count}</span>
              </button>
            ))}
          </div>
          <div aria-hidden="true" className="articles-pills is-highlight" ref={layerRef}>
            {pills.map((pill) => (
              <span className="articles-pill" key={pill.slug ?? "all"}>
                <span className="articles-pill-name">{pill.name}</span>
                <span className="articles-pill-count">{pill.count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
