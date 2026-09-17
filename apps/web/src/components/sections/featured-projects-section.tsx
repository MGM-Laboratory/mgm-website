"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImageIcon } from "lucide-react";
import gsap from "gsap";
import Link from "next/link";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PROJECT_CATEGORY_LABELS, projectMediaUrl, type CmsProjectRecord } from "@/lib/project-cms";

const AUTO_ADVANCE_MS = 6000;

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

function FeaturedProjectSlide({ record }: Readonly<{ record: CmsProjectRecord }>) {
  const { project } = record;
  const cover = projectMediaUrl(project.coverKey);

  return (
    <div className="grid gap-8 sm:gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" src={cover} />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-[var(--surface-muted)]">
          <ImageIcon className="size-12 text-foreground/25" strokeWidth={1.5} />
        </div>
      )}

      <div>
        {project.categories[0] ? (
          <p className="text-xs font-semibold tracking-wide text-brand-blue uppercase">
            {PROJECT_CATEGORY_LABELS[project.categories[0]]}
          </p>
        ) : null}
        <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {project.title}
        </h3>
        <p className="mt-4 text-foreground/65">{project.summary}</p>
        <Link
          href={`/projects/${record.slug}`}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-blue/90"
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
 * title, description, and a "View project" CTA rather than a bare card.
 * Renders nothing if no project is currently featured, same empty-state
 * convention as the other homepage preview rows.
 */
export function FeaturedProjectsSection({
  records,
}: Readonly<{ records: readonly CmsProjectRecord[] }>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = records.length;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  // Every slide change (auto-advance, arrows, or dots) re-enters through
  // this same effect, so the fade-in plays consistently regardless of what
  // triggered it — and collapses to an instant swap under reduced motion,
  // matching the rest of the site's decorative-loop rule.
  useLayoutEffect(() => {
    const slide = slideRef.current;
    if (!slide) return;
    const reduced = reducedMotion();
    gsap.fromTo(
      slide,
      { opacity: reduced ? 1 : 0, y: reduced ? 0 : 14 },
      { opacity: 1, y: 0, duration: reduced ? 0 : 0.5, ease: "power2.out" },
    );
  }, [index]);

  const [paused, setPaused] = useState(false);
  useLayoutEffect(() => {
    if (count < 2 || paused || reducedMotion()) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [count, paused]);

  const active = useMemo(() => records[index % Math.max(count, 1)], [records, index, count]);

  function go(delta: 1 | -1) {
    setIndex((current) => (current + delta + count) % count);
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
                      onClick={() => setIndex(i)}
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
