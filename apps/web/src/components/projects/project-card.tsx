"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { PatternTile, type PatternKind } from "@/components/process/pattern-tile";
import {
  projectGalleryKeys,
  projectMediaUrl,
  PROJECT_CATEGORY_LABELS,
  type CmsProjectRecord,
} from "@/lib/project-cms";
import { cn } from "@/lib/utils";

// SSR runs useEffect; the browser prefers useLayoutEffect so hover wiring
// and the title measurement happen before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Deterministic fallback motif for the few records without a cover image. */
const FALLBACK_PATTERNS: PatternKind[] = ["fans", "arcs", "circle", "plus"];

/**
 * The public list card, modeled on lusion.co/projects: a forced 16:9 cover
 * with rounded corners, a one-line categories row, and a one-line title.
 * Hovering the card plays the "camera focus" blur on the cover, tilts the
 * image in 3D toward the cursor (the frame itself stays a flat 2D
 * rectangle), indents the footer text, and slides an arrow in from the
 * left. Hovering the title itself box-flips every character in 3D.
 */
export function ProjectCard({
  record,
  className,
}: {
  record: CmsProjectRecord;
  className?: string;
}) {
  const { project } = record;
  const coverUrl = projectGalleryKeys(project)
    .map((key) => projectMediaUrl(key))
    .find((url): url is string => Boolean(url));
  const categories = project.categories
    .map((category) => PROJECT_CATEGORY_LABELS[category])
    .filter(Boolean);
  const fallbackPattern = FALLBACK_PATTERNS[record.slug.length % FALLBACK_PATTERNS.length];

  // The rendered title — starts as the full title and gets trimmed with an
  // ellipsis below when it does not fit on one line.
  const [title, setTitle] = useState(project.title);

  const rootRef = useRef<HTMLAnchorElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
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
      if (measure(project.title) <= row.clientWidth + 1) {
        setTitle(project.title);
        return;
      }
      // Longest prefix whose ellipsized form still fits on one line.
      let lo = 1;
      let hi = project.title.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (measure(`${project.title.slice(0, mid)}…`) <= row.clientWidth) lo = mid;
        else hi = mid - 1;
      }
      setTitle(`${project.title.slice(0, lo)}…`);
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
  }, [project.title]);

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Every hover effect is decorative; reduced motion keeps the card
    // completely static.
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    const img = imageRef.current;
    const titleRow = titleRowRef.current;
    const icon = root.querySelector<HTMLElement>(".project-card-icon");
    if (!titleRow || !icon) return;

    // The indent/arrow travel distance is one em of the title row.
    const em = () => parseFloat(getComputedStyle(titleRow).fontSize) || 28;

    // Camera focus: blur in fast, then pull focus back to sharp. Built per
    // enter from the current filter so re-hovering mid-blur stays smooth.
    const focusIn = () => {
      if (!img) return;
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
    // Leaving blurs the cover back out and leaves it blurred, like a camera
    // pulling away from the card.
    const blurOut = () => {
      if (!img) return;
      gsap.killTweensOf(img, "filter");
      gsap.to(img, { filter: "blur(10px)", duration: 0.45, ease: "power2.inOut" });
    };

    // Slight 3D tilt of the image toward the cursor. Only the image
    // rotates (inside the flat, rounded frame); quickTo keeps each axis
    // independently smoothed.
    let tilt: { x: gsap.QuickToFunc; y: gsap.QuickToFunc } | null = null;
    if (img) {
      gsap.set(img, { transformPerspective: 900 });
      tilt = {
        x: gsap.quickTo(img, "rotationX", { duration: 0.5, ease: "power2.out" }),
        y: gsap.quickTo(img, "rotationY", { duration: 0.5, ease: "power2.out" }),
      };
    }

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

    // Title hover: every character box-flips 90deg forward and back in a
    // wave. Only the character containers rotate; the two faces hold
    // static transforms (front at 0deg, back pre-rotated -90deg on X).
    const chars = () => gsap.utils.toArray<HTMLElement>(".project-card-char", titleRow);
    const flip = () => {
      if (flipActiveRef.current) return;
      flipActiveRef.current = true;
      const tl = gsap.timeline({
        onComplete: () => {
          flipActiveRef.current = false;
        },
      });
      tl.to(chars(), { rotationX: 90, duration: 0.45, stagger: 0.05, ease: "power2.inOut" }).to(
        chars(),
        {
          rotationX: 0,
          duration: 0.45,
          stagger: { each: 0.05, from: "end" },
          ease: "power2.inOut",
        },
        "+=0.3",
      );
    };

    const onEnter = () => {
      focusIn();
      indent.play();
    };
    const onLeave = () => {
      blurOut();
      indent.reverse();
      if (tilt) {
        tilt.x(0);
        tilt.y(0);
      }
    };
    const onMove = (event: MouseEvent) => {
      if (!tilt) return;
      const rect = root.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      tilt.x(-py * 7);
      tilt.y(px * 7);
    };

    root.addEventListener("mouseenter", onEnter);
    root.addEventListener("mouseleave", onLeave);
    root.addEventListener("mousemove", onMove);
    titleRow.addEventListener("mouseenter", flip);

    return () => {
      root.removeEventListener("mouseenter", onEnter);
      root.removeEventListener("mouseleave", onLeave);
      root.removeEventListener("mousemove", onMove);
      titleRow.removeEventListener("mouseenter", flip);
      gsap.killTweensOf(
        [img, icon, ...gsap.utils.toArray(".project-card-char", titleRow)].filter(
          (target): target is object => Boolean(target),
        ),
      );
      indent.kill();
    };
  }, []);

  return (
    <Link ref={rootRef} href={`/projects/${record.slug}`} className={cn("group block", className)}>
      <div className="aspect-video overflow-hidden rounded-[15px] bg-[var(--surface-muted)] dark:bg-white/[0.04]">
        {coverUrl ? (
          // CMS media is served through the storage proxy; next/image
          // cannot optimize it, so a plain img matches the rest of the site.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={coverUrl}
            alt={project.coverAlt || project.title}
            loading="lazy"
            className="h-full w-full object-cover will-change-transform"
          />
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

      <div className="mt-5">
        {categories.length ? (
          <p className="mb-3 truncate text-[clamp(0.6875rem,0.9vw,0.875rem)] font-medium tracking-[0.12em] text-[var(--ink-3)] uppercase dark:text-white/50">
            {categories.join(" • ")}
          </p>
        ) : null}
        <div
          ref={titleRowRef}
          className="relative overflow-hidden text-[clamp(1.5rem,3vw,3.5rem)] leading-[1.15em] whitespace-nowrap"
        >
          <span
            aria-hidden="true"
            className="project-card-icon absolute top-[0.15em] left-[-1em] inline-flex size-[0.8em] items-center justify-center text-[#0e1116] dark:text-white"
          >
            <ArrowRight className="size-full" strokeWidth={2} />
          </span>
          <span className="project-card-title relative inline-block font-display font-medium tracking-[-0.02em] text-[#0e1116] [perspective:600px] dark:text-white">
            {Array.from(title).map((char, index) => (
              <span
                className="project-card-char relative inline-block [transform-style:preserve-3d]"
                key={`${index}-${char}`}
              >
                <span className="inline-block [backface-visibility:hidden]">{char}</span>
                <span className="absolute inset-0 inline-block [transform:rotateX(-90deg)] [backface-visibility:hidden]">
                  {char}
                </span>
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
    </Link>
  );
}
