"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";

// SSR runs useEffect; the browser prefers useLayoutEffect so hover wiring
// and the title measurement happen before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * The card's text: a one-line categories row and a one-line title.
 * Hovering the card indents the title and slides an arrow in from the
 * left; hovering the title itself box-flips every character in 3D.
 */
export function ProjectCardFooter({
  title: fullTitle,
  categories,
}: {
  title: string;
  categories: string[];
}) {
  // The rendered title — starts as the full title and gets trimmed with an
  // ellipsis below when it does not fit on one line.
  const [title, setTitle] = useState(fullTitle);
  // Word groups keep the space between words as a real whitespace-pre span
  // (magicui's approach): a bare space inside an inline-block char box
  // collapses to zero width, which glued words together. Each character
  // also carries its index in the whole title (spaces counted, as lusion
  // counts its empty space columns) for the drop's per-character stagger.
  const titleWords: Array<{ chars: string[]; start: number }> = [];
  for (const word of title.split(" ")) {
    const last = titleWords[titleWords.length - 1];
    const start = last ? last.start + last.chars.length + 1 : 0;
    titleWords.push({ chars: Array.from(word), start });
  }

  const titleRowRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLSpanElement>(null);
  const flipActiveRef = useRef(false);

  // The title must stay on one line: measure the real rendered width
  // against an invisible sizer and trim with an ellipsis when it overflows.
  useIsomorphicLayoutEffect(() => {
    const row = titleRowRef.current;
    const sizer = sizerRef.current;
    if (!row || !sizer) return;

    let cancelled = false;
    const fit = () => {
      const measure = (text: string) => {
        sizer.textContent = text;
        return sizer.offsetWidth;
      };
      if (measure(fullTitle) <= row.clientWidth + 1) {
        setTitle(fullTitle);
        return;
      }
      // Longest prefix whose ellipsized form still fits on one line.
      let lo = 1;
      let hi = fullTitle.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (measure(`${fullTitle.slice(0, mid)}…`) <= row.clientWidth) lo = mid;
        else hi = mid - 1;
      }
      setTitle(`${fullTitle.slice(0, lo)}…`);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(row);
    // Widths can change once the display font loads.
    document.fonts.ready.then(() => {
      if (!cancelled) fit();
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [fullTitle]);

  // Runs after every re-split (the truncation above can swap the title
  // once fonts load or the card resizes), so new flip boxes get their
  // geometry before paint.
  useIsomorphicLayoutEffect(() => {
    const titleRow = titleRowRef.current;
    if (!titleRow) return;
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    // Never animated: each flip box hangs half a line behind its own
    // plane, and the flip's rotationX tweens preserve this offset.
    gsap.set(gsap.utils.toArray<HTMLElement>(".project-card-char", titleRow), {
      z: -0.5 * parseFloat(getComputedStyle(titleRow).lineHeight),
    });
  }, [title]);

  useIsomorphicLayoutEffect(() => {
    const titleRow = titleRowRef.current;
    // The card's <a> root, found from our own element: a parent's ref is
    // not attached yet when a child's layout effect runs on mount.
    const root = titleRow?.closest("a");
    if (!root || !titleRow) return;

    // Every hover effect is decorative; reduced motion keeps the card
    // completely static.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    const icon = titleRow.querySelector<HTMLElement>(".project-card-icon");
    if (!icon) return;

    // The indent/arrow travel distance is one em of the title row.
    const em = () => parseFloat(getComputedStyle(titleRow).fontSize) || 28;

    // Footer hover: the title indents one em and the arrow slides in from
    // the left edge. .fromTo baselines (not .to) so reversing mid-animation
    // can never strand a half-finished value.
    const indent = gsap.timeline({ paused: true });
    indent.fromTo(
      [titleRow.querySelector(".project-card-title"), icon],
      { x: 0 },
      { x: () => em(), duration: 0.5, ease: "power3.out" },
      0,
    );

    // Title hover: the magicui text-3d-flip — every character is a 3D box
    // whose front face sits in the text plane and whose back face is
    // pre-rotated -90deg on X; hovering rotates each box 90deg forward in
    // a staggered wave and snaps all of them back at once. The container
    // z-offset and the two face transforms mirror magicui's CharBox
    // geometry exactly (translateZ offsets of ±0.5lh, no perspective);
    // only the spring is approximated with a power2 ease.
    const chars = () => gsap.utils.toArray<HTMLElement>(".project-card-char", titleRow);
    const flip = () => {
      if (flipActiveRef.current) return;
      flipActiveRef.current = true;
      gsap
        .timeline({
          onComplete: () => {
            flipActiveRef.current = false;
          },
        })
        .to(chars(), { rotationX: 90, duration: 0.5, stagger: 0.05, ease: "power2.out" })
        .add(() => gsap.set(chars(), { rotationX: 0 }));
    };

    const onEnter = () => indent.play();
    const onLeave = () => indent.reverse();

    root.addEventListener("mouseenter", onEnter);
    root.addEventListener("mouseleave", onLeave);
    titleRow.addEventListener("mouseenter", flip);
    return () => {
      root.removeEventListener("mouseenter", onEnter);
      root.removeEventListener("mouseleave", onLeave);
      titleRow.removeEventListener("mouseenter", flip);
      gsap.killTweensOf([icon, ...gsap.utils.toArray(".project-card-char", titleRow)]);
      indent.kill();
    };
  }, []);

  return (
    // data-card-footer: the page's cover stage moves this wrapper with the
    // card's scroll reaction, so nothing in this component may animate the
    // wrapper's own transform (the effects below animate inner elements).
    <div data-card-footer="" className="mt-5">
      {categories.length ? (
        <p
          aria-hidden="true"
          className="mb-3 truncate text-[clamp(0.6875rem,0.9vw,0.875rem)] font-medium tracking-[0.12em] text-[var(--ink-3)] uppercase dark:text-white/50"
        >
          {categories.join(" • ")}
        </p>
      ) : null}
      {/* The row is a fixed one-line window (h = line-height): each
          character below is a four-line column that the drop slides down
          through it, so only the row's overflow clip decides what shows. */}
      <div
        ref={titleRowRef}
        className="relative h-[1.15em] overflow-hidden text-[clamp(1.5rem,3vw,3.5rem)] leading-[1.15em] whitespace-nowrap"
      >
        <span
          aria-hidden="true"
          className="project-card-icon absolute top-[0.15em] left-[-1em] inline-flex size-[0.8em] items-center justify-center text-[#0e1116] dark:text-white"
        >
          <ArrowRight className="size-full" strokeWidth={2} />
        </span>
        {/* Visual only: the card link's aria-label carries the real title. */}
        <span
          aria-hidden="true"
          className="project-card-title relative inline-block font-display font-medium tracking-[-0.02em] text-[#0e1116] dark:text-white"
        >
          {titleWords.map(({ chars, start }, wordIndex) => (
            <span className="inline-flex" key={wordIndex}>
              {chars.map((char, charIndex) => (
                // The drop column: four identical copies stacked in one
                // column, the first on top (it is the one that lands in
                // the window). Only the drop writes this element's
                // transform; its resting (no-JS) position shows copy one.
                <span
                  className="project-card-drop flex flex-col"
                  data-drop-index={start + charIndex}
                  key={`${wordIndex}-${charIndex}`}
                >
                  {/* Copy one is the magicui flip box (the flip owns its
                      rotation); copies two to four are plain glyphs. */}
                  <span className="project-card-char relative inline-block [transform-style:preserve-3d]">
                    <span
                      className="inline-block [backface-visibility:hidden]"
                      style={{ transform: "translateZ(0.5lh)" }}
                    >
                      {char}
                    </span>
                    <span
                      className="absolute inset-0 inline-block [backface-visibility:hidden]"
                      style={{ transform: "rotateX(-90deg) translateZ(0.5lh)" }}
                    >
                      {char}
                    </span>
                  </span>
                  <span>{char}</span>
                  <span>{char}</span>
                  <span>{char}</span>
                </span>
              ))}
              {wordIndex < titleWords.length - 1 && <span className="whitespace-pre"> </span>}
            </span>
          ))}
        </span>
        {/* Invisible sizer mirroring the title typography, used by the
            one-line truncation measurement above. */}
        <span
          ref={sizerRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute top-0 left-0 font-display font-medium tracking-[-0.02em] whitespace-nowrap"
        />
      </div>
    </div>
  );
}
