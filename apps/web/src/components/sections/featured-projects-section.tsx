"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import Link from "next/link";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { PROJECT_CATEGORY_LABELS, projectMediaUrl, type CmsProjectRecord } from "@/lib/project-cms";
import { MorphSlider, type MorphSliderItem } from "@/components/projects/morph-slider";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

/**
 * The homepage's Projects preview: an image side (MorphSlider — a WebGL
 * shader morph between slides, ported from React Bits, replacing the
 * clip-path wipe this section used previously) paired with a text panel
 * (title, description, "View project" CTA) that stays in sync with
 * whichever slide MorphSlider is currently showing — including from its own
 * autoplay, drag, and arrow/dot interactions, via its onIndexChange
 * callback. Renders nothing if no project is currently featured.
 */
export function FeaturedProjectsSection({
  records,
}: Readonly<{ records: readonly CmsProjectRecord[] }>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = records.length;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  // The text panel fades in step with whatever just triggered the image
  // morph, rather than popping instantly — collapses to an instant swap
  // under reduced motion, same as every other transition on this page.
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const reduced = reducedMotion();
    gsap.fromTo(
      text,
      { opacity: reduced ? 1 : 0, y: reduced ? 0 : 14 },
      { opacity: 1, y: 0, duration: reduced ? 0 : 0.5, ease: "power2.out" },
    );
  }, [index]);

  const items = useMemo<MorphSliderItem[]>(
    () =>
      records.map((record) => ({
        image: projectMediaUrl(record.project.coverKey) ?? "",
        caption: record.project.title,
      })),
    [records],
  );

  const active = records[index % Math.max(count, 1)];

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
            <div className="h-80 overflow-hidden rounded-2xl sm:h-96">
              <MorphSlider
                autoplay
                autoplayDelay={6}
                items={items}
                loop
                onIndexChange={setIndex}
                radius={0}
                showCaptions={false}
                transition="melt"
              />
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
