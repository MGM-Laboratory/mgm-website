"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import gsap from "gsap";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import {
  PROJECT_CATEGORY_LABELS,
  projectMediaUrl,
  projectThemeId,
  type CmsProjectRecord,
} from "@/lib/project-cms";

/** How long each featured project holds the image before the next one crossfades in. */
const AUTOPLAY_DELAY = 6;

/** The crossfade's length, in seconds. */
const CROSSFADE_DURATION = 0.5;

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

type Slide = { key: string; image: string; alt: string };

/**
 * The homepage's Projects preview: an image side (every project's cover
 * stacked in place, crossfading one into the next) paired with a text panel
 * (title, description, "View project" CTA) that stays in sync with whichever
 * image is showing — including from the carousel's own autoplay — via a
 * shared index. The crossfade replaced a React Bits WebGL morph slider
 * whose "melt" shader transition was far louder than this section calls
 * for; the images, the 6s autoplay, and the arrow/dot controls are
 * unchanged. Renders nothing if no project is currently featured.
 *
 * "View project" opts into the project zoom transition
 * (components/transition/project-transition.tsx): the image box is the
 * frame it zooms from (`data-project-transition-frame` names the project
 * showing) and the active slide's picture is the one it carries in.
 */
export function FeaturedProjectsSection({
  records,
}: Readonly<{ records: readonly CmsProjectRecord[] }>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<Array<HTMLDivElement | null>>([]);
  /** The index the DOM last settled on; null until the first effect run. */
  const shownRef = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  // Hovering or focusing inside the carousel holds it still, so a visitor
  // reading a project (or tabbing through its controls) isn't yanked to the
  // next one mid-sentence.
  const [paused, setPaused] = useState(false);
  const count = records.length;
  const activeIndex = count > 0 ? index % count : 0;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  // The stack crossfades on every index change: the incoming layer eases up
  // from a hair of extra scale while the outgoing one fades away underneath
  // it. A layout effect so it lands before the browser paints — the freshly
  // re-rendered opacity classes would otherwise flash the end state first.
  useLayoutEffect(() => {
    const previous = shownRef.current;
    shownRef.current = index;
    // The first paint already renders the active layer at full opacity.
    if (previous === null || previous === index) return;

    const reduced = reducedMotion();
    const entering = layerRefs.current[activeIndex];
    const leaving = layerRefs.current[previous];

    if (entering) {
      gsap.fromTo(
        entering,
        { opacity: 0, scale: reduced ? 1 : 1.02 },
        { opacity: 1, scale: 1, duration: CROSSFADE_DURATION, ease: "power2.out" },
      );
    }
    if (leaving) {
      gsap.to(leaving, { opacity: 0, duration: CROSSFADE_DURATION, ease: "power2.out" });
    }
  }, [activeIndex, index]);

  // The text panel fades in step with the image crossfade, rather than
  // popping instantly — collapses to an instant swap under reduced motion,
  // same as every other transition on this page.
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const reduced = reducedMotion();
    gsap.fromTo(
      text,
      { opacity: reduced ? 1 : 0, y: reduced ? 0 : 14 },
      { opacity: 1, y: 0, duration: reduced ? 0 : CROSSFADE_DURATION, ease: "power2.out" },
    );
  }, [index]);

  // Each index change (autoplay or a click on the arrows/dots) restarts the
  // clock, so a manual move always gets a full interval of stillness.
  useEffect(() => {
    if (paused || count < 2) return undefined;
    const id = window.setTimeout(() => setIndex((current) => current + 1), AUTOPLAY_DELAY * 1000);
    return () => window.clearTimeout(id);
  }, [count, index, paused]);

  const slides = useMemo<Slide[]>(
    () =>
      records.map((record) => ({
        key: record.slug,
        image: projectMediaUrl(record.project.coverKey) ?? "",
        alt: record.project.coverAlt?.trim() || `${record.project.title} cover image`,
      })),
    [records],
  );

  const step = useCallback((delta: number) => {
    setIndex((current) => current + delta);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      }
    },
    [step],
  );

  const active = records[activeIndex];

  return (
    <section
      id="projects"
      ref={rootRef}
      className="bg-background px-6 py-10 sm:px-10 sm:py-14 lg:px-16"
    >
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>

      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="reveal-card font-display text-[clamp(1.75rem,3vw_+_1rem,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
              Projects
            </h2>
            <p className="reveal-card mt-4 max-w-2xl text-foreground/60 opacity-0">
              A selection of research-driven products the lab has built end to end.
            </p>
          </div>
          <Link
            href="/projects"
            className="reveal-card shrink-0 text-sm font-medium whitespace-nowrap text-foreground/60 opacity-0 transition-colors hover:text-brand-blue"
          >
            See more →
          </Link>
        </div>

        {active ? (
          <div className="reveal-card mt-14 grid gap-8 opacity-0 sm:gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div
              data-project-transition-frame={active.slug}
              aria-label="Featured project images"
              aria-roledescription="carousel"
              className="relative h-80 overflow-hidden rounded-2xl bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/70 sm:h-96"
              onBlur={() => setPaused(false)}
              onFocus={() => setPaused(true)}
              onKeyDown={onKeyDown}
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              role="group"
              tabIndex={0}
            >
              {slides.map((slide, i) => (
                <div
                  aria-hidden={i === activeIndex ? undefined : true}
                  className={cn(
                    "absolute inset-0",
                    i === activeIndex ? "opacity-100" : "opacity-0",
                  )}
                  key={slide.key}
                  ref={(element) => {
                    layerRefs.current[i] = element;
                  }}
                >
                  {slide.image ? (
                    // CMS-uploaded cover art, outside the image loader — same as
                    // the project cards and galleries. Lazy so the covers load as
                    // the section approaches, not on every homepage visit.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      data-project-transition-image={slide.key}
                      alt={slide.alt}
                      className="h-full w-full object-cover"
                      decoding="async"
                      loading="lazy"
                      src={slide.image}
                    />
                  ) : null}
                </div>
              ))}

              {count > 1 ? (
                <>
                  <button
                    aria-label="Previous project"
                    className="absolute top-1/2 left-3 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition-colors hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
                    onClick={() => step(-1)}
                    type="button"
                  >
                    <ChevronLeft aria-hidden="true" className="size-5" />
                  </button>
                  <button
                    aria-label="Next project"
                    className="absolute top-1/2 right-3 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition-colors hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
                    onClick={() => step(1)}
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" className="size-5" />
                  </button>
                  <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center gap-1.5">
                    {slides.map((slide, i) => (
                      <button
                        aria-current={i === activeIndex ? "true" : undefined}
                        aria-label={`Show project ${i + 1} of ${count}`}
                        className={cn(
                          // Cover art is arbitrary, so the dots carry their own
                          // hairline: white dots with a light backdrop (the
                          // established treatment in the project galleries) all
                          // but vanish on the white-background screenshots a lot
                          // of these covers are.
                          "h-1.5 rounded-full bg-white/60 shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_1px_3px_rgba(0,0,0,0.35)] transition-all",
                          i === activeIndex ? "w-5 bg-white" : "w-1.5 hover:bg-white/85",
                        )}
                        key={slide.key}
                        onClick={() => setIndex(i)}
                        type="button"
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div ref={textRef}>
              {active.project.categories[0] ? (
                <p className="text-xs font-semibold tracking-wide text-brand-blue uppercase">
                  {PROJECT_CATEGORY_LABELS[active.project.categories[0]]}
                </p>
              ) : null}
              <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {active.project.title}
              </h3>
              <p className="mt-4 text-foreground/65">{active.project.summary}</p>
              <Link
                href={`/projects/${active.slug}`}
                data-project-transition=""
                data-project-slug={active.slug}
                data-project-theme={projectThemeId(active.project)}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-blue/90"
              >
                View project
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="reveal-card mt-10 rounded-2xl border border-[var(--line)] px-8 py-16 text-center opacity-0">
            <p className="text-foreground/60">
              No featured projects yet — check back once the lab spotlights one.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
