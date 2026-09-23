"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { PatternTile, type PatternKind } from "@/components/process/pattern-tile";
import { registerStageCard } from "@/components/projects/stage/stage-registry";
import { waitForGridReveal } from "@/lib/projects-intro";

// SSR runs useEffect; the browser prefers useLayoutEffect so hover wiring
// happens before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Deterministic fallback motif for the few records without a cover image. */
const FALLBACK_PATTERNS: PatternKind[] = ["fans", "arcs", "circle", "plus"];

// The DOM opening mirrors the WebGL one: a rounded window growing from 70%
// to the full frame while the picture pulls back from 1.333x to its 1.026x
// resting overscan (the same overscan the WebGL stage keeps, so the two
// renderings match when one hands over to the other).
const CLIP_FROM = "inset(15% 15% 15% 15% round 15px)";
const CLIP_TO = "inset(0% 0% 0% 0% round 15px)";
const ZOOM_FROM = 1.333;
const ZOOM_REST = 1.026;

/**
 * The card's forced 3:2 cover frame. The frame registers with the page's
 * cover stage (see stage/stage-registry.ts): when the WebGL stage takes a
 * card over it marks the frame `data-stage="gl"`, which hides the DOM
 * picture and the frame's own background so only the WebGL cover shows.
 *
 * Otherwise (touch, no WebGL2, a lost context) this DOM cover is what
 * visitors see, and it plays a DOM version of the opening whenever the
 * card scrolls into view: the window grows, the picture zooms out through
 * a quick focus pulse, and a blurred, edge-masked copy fades out while it
 * zooms (a cheap edge motion blur). Hovering a DOM cover pulls focus and
 * tilts the picture slightly toward the cursor.
 */
export function ProjectCardCover({
  coverUrl,
  alt,
  slug,
  index,
}: {
  coverUrl?: string;
  alt: string;
  slug: string;
  index: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const edgeRef = useRef<HTMLImageElement>(null);
  const fallbackPattern = FALLBACK_PATTERNS[slug.length % FALLBACK_PATTERNS.length];

  useIsomorphicLayoutEffect(() => {
    const frame = frameRef.current;
    const root = frame?.closest("a");
    if (!frame || !root) return;
    return registerStageCard({ root, frame, image: imageRef.current, index });
  }, [index]);

  // DOM opening: plays for every card the WebGL stage isn't drawing, in any
  // mode (touch, no WebGL2, a lost context, or a stage that hasn't taken
  // this card over yet), so no card ever enters as a static picture.
  useIsomorphicLayoutEffect(() => {
    const frame = frameRef.current;
    const lens = lensRef.current;
    const edge = edgeRef.current;
    const root = frame?.closest("a");
    if (!frame || !lens || !edge || !root) return;
    // Reduced motion: completely static.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let timeline: gsap.core.Timeline | null = null;
    // Waiting to play on the next entry (re-armed once fully out of view).
    let armed = false;
    let inView = false;
    const ownedByStage = () => frame.dataset.stage === "gl";
    // The stage only takes a card over on screen while its DOM cover
    // rests (which matches the stage's own rest), so it reads this.
    const setOpening = (state: "start" | "play" | null) => {
      if (state) frame.dataset.domOpening = state;
      else delete frame.dataset.domOpening;
    };

    // The DOM cover rests at the stage's 1.026x overscan (set here, never
    // by a class: GSAP owns this element's transform).
    gsap.set(lens, { scale: ZOOM_REST });

    const toStart = () => {
      timeline?.kill();
      gsap.set(frame, { clipPath: CLIP_FROM });
      gsap.set(lens, { scale: ZOOM_FROM, filter: "blur(8px)" });
      gsap.set(edge, { autoAlpha: 1 });
      setOpening("start");
    };
    const toRest = () => {
      timeline?.kill();
      gsap.set(frame, { clearProps: "clipPath" });
      gsap.set(lens, { scale: ZOOM_REST, filter: "blur(0px)" });
      gsap.set(edge, { autoAlpha: 0 });
      setOpening(null);
    };
    const play = () => {
      timeline?.kill();
      setOpening("play");
      timeline = gsap
        .timeline({
          onComplete: () => {
            gsap.set(frame, { clearProps: "clipPath" });
            setOpening(null);
          },
        })
        .fromTo(
          frame,
          { clipPath: CLIP_FROM },
          { clipPath: CLIP_TO, duration: 1.5, ease: "expo.out" },
          0,
        )
        .fromTo(
          lens,
          { scale: ZOOM_FROM },
          { scale: ZOOM_REST, duration: 1.5, ease: "expo.out" },
          0,
        )
        // Focus pulse: blurred, sharp, a little soft again, sharp; it
        // always lands on exactly blur(0px).
        // (">" chains each beat right after the previous one, not after the
        // 1.5 s zoom.)
        .fromTo(
          lens,
          { filter: "blur(8px)" },
          { filter: "blur(0px)", duration: 0.12, ease: "power2.out" },
          0,
        )
        .to(lens, { filter: "blur(3px)", duration: 0.14, ease: "sine.inOut" }, ">")
        .to(lens, { filter: "blur(0px)", duration: 0.24, ease: "power2.out" }, ">")
        // The blurred copy only shows at the edges (radial mask) and fades
        // out while the zoom is fastest.
        .fromTo(edge, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.7, ease: "power2.out" }, 0);
    };

    // From the list's reveal on: every card the stage doesn't draw starts
    // on the opening's first frame, and plays it whenever it comes into
    // view after having been fully out.
    const arm = () => {
      if (cancelled || observer) return;
      armed = true;
      if (!ownedByStage()) toStart();
      observer = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        inView = entry.isIntersecting;
        if (ownedByStage()) {
          if (!inView) armed = true;
          return;
        }
        if (!inView) {
          // Fully out of view: rewind so the next entry replays it.
          toStart();
          armed = true;
        } else if (armed) {
          armed = false;
          play();
        }
      });
      observer.observe(root);
    };
    void waitForGridReveal().then(arm);

    // The stage taking this card over, or handing it back (a lost context).
    const ownership = new MutationObserver(() => {
      if (ownedByStage()) {
        // Hidden behind the stage's cover: park it at rest, so a later
        // handback never uncovers a half-played or rewound opening.
        toRest();
      } else if (inView) {
        // Handed back on screen: it stays at rest (jumping to the start
        // frame would show); the next entry plays the opening again.
        armed = false;
      } else if (observer) {
        toStart();
        armed = true;
      }
    });
    ownership.observe(frame, { attributes: true, attributeFilter: ["data-stage"] });

    return () => {
      cancelled = true;
      ownership.disconnect();
      observer?.disconnect();
      timeline?.kill();
      setOpening(null);
    };
  }, []);

  // DOM hover (skipped while the WebGL stage draws this cover).
  useIsomorphicLayoutEffect(() => {
    const frame = frameRef.current;
    // The card's <a> root, found from our own element: a parent's ref is
    // not attached yet when a child's layout effect runs on mount.
    const root = frame?.closest("a");
    const img = imageRef.current;
    if (!frame || !root || !img) return;

    // Every hover effect is decorative; reduced motion keeps the card
    // completely static.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const ownedByStage = () => frame.dataset.stage === "gl";

    // Camera focus: blur in fast, then pull focus back to sharp. Built per
    // enter from the current filter so re-hovering mid-blur stays smooth.
    const focusIn = () => {
      gsap.killTweensOf(img, "filter");
      gsap
        .timeline()
        .fromTo(
          img,
          { filter: () => getComputedStyle(img).filter },
          { filter: "blur(12px)", duration: 0.15, ease: "power1.in" },
        )
        .to(img, { filter: "blur(0px)", duration: 0.55, ease: "power3.out" });
    };
    // Leaving pulls the cover back to sharp instead of leaving it blurred:
    // the image must end clear when the hover ends (and a mid-blur kill
    // lands on blur(0) too), so every new hover replays the same cycle.
    const blurOut = () => {
      gsap.killTweensOf(img, "filter");
      gsap.to(img, { filter: "blur(0px)", duration: 0.35, ease: "power2.out" });
    };

    // Slight 3D tilt of the image toward the cursor. Only the image
    // rotates (inside the flat, rounded frame); quickTo keeps each axis
    // independently smoothed.
    gsap.set(img, { transformPerspective: 900 });
    const tiltX = gsap.quickTo(img, "rotationX", { duration: 0.5, ease: "power2.out" });
    const tiltY = gsap.quickTo(img, "rotationY", { duration: 0.5, ease: "power2.out" });

    // Marked busy while the hover plays or settles back (the blur-out and
    // the tilt's return both end within 0.55 s): the stage never takes a
    // card over on screen mid-hover, where its resting cover would jump.
    let settle: gsap.core.Tween | null = null;
    const markBusy = () => {
      settle?.kill();
      settle = null;
      frame.dataset.domHover = "";
    };
    const markSettling = () => {
      if (frame.dataset.domHover === undefined) return;
      settle?.kill();
      settle = gsap.delayedCall(0.55, () => {
        settle = null;
        delete frame.dataset.domHover;
      });
    };

    const onEnter = () => {
      if (ownedByStage()) return;
      markBusy();
      focusIn();
    };
    const onLeave = () => {
      blurOut();
      tiltX(0);
      tiltY(0);
      markSettling();
    };
    const onMove = (event: MouseEvent) => {
      if (ownedByStage()) return;
      if (frame.dataset.domHover === undefined || settle) markBusy();
      const rect = root.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      tiltX(-py * 7);
      tiltY(px * 7);
    };

    root.addEventListener("mouseenter", onEnter);
    root.addEventListener("mouseleave", onLeave);
    root.addEventListener("mousemove", onMove);
    return () => {
      root.removeEventListener("mouseenter", onEnter);
      root.removeEventListener("mouseleave", onLeave);
      root.removeEventListener("mousemove", onMove);
      gsap.killTweensOf(img);
      settle?.kill();
      delete frame.dataset.domHover;
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className="group/cover relative aspect-[3/2] overflow-hidden rounded-[15px] bg-[var(--surface-muted)] data-[stage=gl]:bg-transparent dark:bg-white/[0.04]"
    >
      {coverUrl ? (
        // Hidden while the WebGL stage draws this cover. Nothing animates
        // this wrapper, so no inline style can ever override the rule.
        <div className="h-full w-full group-data-[stage=gl]/cover:invisible">
          {/* The DOM opening's zoom and focus pulse (scale + filter). */}
          <div ref={lensRef} className="relative h-full w-full">
            {/* CMS media is served through the storage proxy; next/image
                cannot optimize it, so a plain img matches the rest of the
                site. The WebGL stage switches it to eager loading once
                it exists (stage/cover-engine.ts). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={coverUrl}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover will-change-transform"
            />
            {/* Edge motion blur for the DOM opening: a blurred copy masked
                to the edges, faded out as the picture zooms. The same URL,
                so it never costs a second download. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={edgeRef}
              src={coverUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="pointer-events-none invisible absolute inset-0 h-full w-full object-cover opacity-0 blur-[6px] [mask-image:radial-gradient(ellipse_at_center,transparent_42%,black_100%)]"
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <PatternTile
            bg="canvas"
            fg="blue"
            kind={fallbackPattern}
            className="h-[45%] w-auto opacity-60"
          />
        </div>
      )}
    </div>
  );
}
