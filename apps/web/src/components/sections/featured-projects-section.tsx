"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImageIcon } from "lucide-react";
import gsap from "gsap";
import Link from "next/link";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PROJECT_CATEGORY_LABELS, projectMediaUrl, type CmsProjectRecord } from "@/lib/project-cms";

const AUTO_ADVANCE_MS = 6000;
// Kept well under AUTO_ADVANCE_MS so the Ken Burns drift (see playEnter)
// never gets cut off mid-motion by the next auto-advance.
const KEN_BURNS_MS = AUTO_ADVANCE_MS - 800;

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

function FeaturedProjectSlide({ record }: Readonly<{ record: CmsProjectRecord }>) {
  const { project } = record;
  const cover = projectMediaUrl(project.coverKey);

  return (
    <div className="grid gap-8 sm:gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
      <div className="overflow-hidden rounded-2xl [clip-path:inset(0)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" data-slide-image className="aspect-[4/3] w-full object-cover" src={cover} />
        ) : (
          <div
            data-slide-image
            className="flex aspect-[4/3] w-full items-center justify-center bg-[var(--surface-muted)]"
          >
            <ImageIcon className="size-12 text-foreground/25" strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div>
        {project.categories[0] ? (
          <p className="slide-el text-xs font-semibold tracking-wide text-brand-blue uppercase opacity-0">
            {PROJECT_CATEGORY_LABELS[project.categories[0]]}
          </p>
        ) : null}
        <h3 className="slide-el mt-2 font-display text-2xl font-semibold tracking-tight text-foreground opacity-0 sm:text-3xl">
          {project.title}
        </h3>
        <p className="slide-el mt-4 text-foreground/65 opacity-0">{project.summary}</p>
        <Link
          href={`/projects/${record.slug}`}
          className="slide-el mt-6 inline-flex items-center gap-2 rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white opacity-0 transition-colors hover:bg-brand-blue/90"
        >
          View project
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

/**
 * The homepage's Projects preview: a single-slide carousel that cycles
 * through the projects an admin has flagged "Featured" (see
 * project-cms-editor.tsx) — each slide pairs the project's cover with its
 * title, description, and a "View project" CTA. Transitions are a clip-path
 * wipe on the image (a real morph, not a crossfade) plus a staggered
 * text/CTA entrance, followed by a slow Ken Burns drift while the slide sits
 * — all skipped in favor of an instant, fully-settled swap under reduced
 * motion, same as every other decorative loop on the site. Renders nothing
 * if no project is currently featured.
 */
export function FeaturedProjectsSection({
  records,
}: Readonly<{ records: readonly CmsProjectRecord[] }>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const transitioning = useRef(false);
  const [index, setIndex] = useState(0);
  const count = records.length;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  function playEnter() {
    // Cleared unconditionally, not just on the timeline's own onComplete: if
    // the slide ref isn't attached yet (or any other early return below),
    // leaving this true forever would permanently disable every arrow/dot.
    transitioning.current = false;
    const slide = slideRef.current;
    if (!slide) return;
    tlRef.current?.kill();
    const reduced = reducedMotion();
    const d = reduced ? 0 : 1;
    const image = slide.querySelector<HTMLElement>("[data-slide-image]");
    const els = slide.querySelectorAll<HTMLElement>(".slide-el");

    const tl = gsap.timeline();
    if (image) {
      // The wipe is a real clip-path morph (0% revealed → fully revealed),
      // not an opacity crossfade — paired with a slight scale-out-of-zoom so
      // the image reads as sliding into frame rather than just uncovering.
      tl.fromTo(
        image,
        { clipPath: "inset(0 0 0 100%)", scale: 1.12 },
        { clipPath: "inset(0 0 0 0%)", scale: 1, duration: 0.9 * d, ease: "power3.out" },
        0,
      );
    }
    tl.fromTo(
      els,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.55 * d, ease: "back.out(1.7)", stagger: 0.08 * d },
      reduced ? 0 : 0.2,
    );
    // A slow, continuous drift while the slide sits on screen — killed the
    // instant the next transition starts (tlRef.current?.kill() above).
    if (image && !reduced) {
      tl.to(image, { scale: 1.06, duration: KEN_BURNS_MS / 1000, ease: "none" });
    }
    tlRef.current = tl;
  }

  useLayoutEffect(playEnter, [index]);

  function playExitThenGo(next: number) {
    if (transitioning.current) return;
    const slide = slideRef.current;
    const reduced = reducedMotion();
    if (!slide || reduced) {
      setIndex(next);
      return;
    }
    transitioning.current = true;
    tlRef.current?.kill();
    gsap.to(slide, {
      opacity: 0,
      scale: 0.98,
      duration: 0.25,
      ease: "power2.in",
      onComplete: () => {
        gsap.set(slide, { opacity: 1, scale: 1 });
        setIndex(next);
      },
    });
  }

  const [paused, setPaused] = useState(false);
  useLayoutEffect(() => {
    if (count < 2 || paused || reducedMotion()) return;
    const id = window.setInterval(() => {
      playExitThenGo((index + 1) % count);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [count, paused, index]);

  const active = useMemo(() => records[index % Math.max(count, 1)], [records, index, count]);

  function go(delta: 1 | -1) {
    playExitThenGo((index + delta + count) % count);
  }

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
          <div
            className="reveal-card mt-14 opacity-0"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div ref={slideRef}>
              <FeaturedProjectSlide key={active.slug} record={active} />
            </div>

            {count > 1 ? (
              <div className="mt-8 flex items-center justify-between gap-4">
                <div className="flex gap-2">
                  {records.map((record, i) => (
                    <button
                      aria-current={i === index}
                      aria-label={`Show ${record.project.title}`}
                      className={`size-2 rounded-full transition-colors ${
                        i === index ? "bg-brand-blue" : "bg-[var(--line)] hover:bg-foreground/30"
                      }`}
                      key={record.slug}
                      onClick={() => playExitThenGo(i)}
                      type="button"
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    aria-label="Previous project"
                    className="flex size-9 items-center justify-center rounded-full border border-[var(--line)] text-foreground/60 transition-colors hover:text-foreground"
                    onClick={() => go(-1)}
                    type="button"
                  >
                    <ArrowLeft className="size-4" strokeWidth={2.25} />
                  </button>
                  <button
                    aria-label="Next project"
                    className="flex size-9 items-center justify-center rounded-full border border-[var(--line)] text-foreground/60 transition-colors hover:text-foreground"
                    onClick={() => go(1)}
                    type="button"
                  >
                    <ArrowRight className="size-4" strokeWidth={2.25} />
                  </button>
                </div>
              </div>
            ) : null}
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
