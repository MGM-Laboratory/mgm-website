"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { ProjectCard } from "@/components/projects/project-card";
import {
  gridRevealState,
  resetGridRevealState,
} from "@/components/projects/stage/grid-reveal-state";
import { ProjectsStage } from "@/components/projects/stage/projects-stage";
import {
  getStageMode,
  setStageMode,
  waitForStageMode,
} from "@/components/projects/stage/stage-registry";
import type { CmsProjectRecord } from "@/lib/project-cms";
import { markGridRevealStarted, waitForProjectsIntro } from "@/lib/projects-intro";

// SSR runs useEffect; the browser prefers useLayoutEffect so the list's
// hidden state is settled before first paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// How long the reveal waits for the WebGL stage once the intro is over
// before settling on the DOM covers instead.
const STAGE_SETTLE_MS = 700;
// Reveal the list even if the hero's intro never reports back (a hidden
// list still reserves its full height as blank scrollable space).
const INTRO_FAILSAFE_MS = 13_000;
const RISE_PX = 28;

/**
 * The full project index: every published project, two cards per row on
 * desktop. While the hero's entrance plays, the list stays hidden; once it
 * ends, the page settles how covers render (the WebGL stage or the DOM
 * fallback) and the whole list fades and rises in while the covers on
 * screen play their opening. Further down, each card opens as it scrolls
 * into view (the stage or the DOM cover handles that per card).
 *
 * The list starts at `opacity-0` from the server (opacity only, so no
 * transform ever stacks with an animated one), with a <noscript> override
 * so visitors without JavaScript still see every project.
 */
export function ProjectsGrid({ records }: { records: CmsProjectRecord[] }) {
  const sectionRef = useRef<HTMLElement>(null);

  useIsomorphicLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    resetGridRevealState();

    // The WebGL canvas lives outside this section, so the reveal runs on a
    // shared state object that both this list and the stage apply.
    const reveal = gridRevealState;
    const apply = () => {
      section.style.opacity = String(reveal.opacity);
      section.style.transform = reveal.y ? `translate3d(0, ${reveal.y}px, 0)` : "";
    };

    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      reveal.started = true;
      reveal.opacity = 1;
      apply();
      markGridRevealStarted();
      return;
    }

    let cancelled = false;
    let tween: gsap.core.Tween | null = null;
    const timers: number[] = [];
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    void (async () => {
      await Promise.race([waitForProjectsIntro(), delay(INTRO_FAILSAFE_MS)]);
      if (cancelled) return;
      if (getStageMode() === "pending") {
        await Promise.race([waitForStageMode(), delay(STAGE_SETTLE_MS)]);
        if (cancelled) return;
        if (getStageMode() === "pending") setStageMode("dom");
      }
      reveal.started = true;
      markGridRevealStarted();
      tween = gsap.fromTo(
        reveal,
        { opacity: 0, y: RISE_PX },
        { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", onUpdate: apply, onComplete: apply },
      );
    })();

    return () => {
      cancelled = true;
      tween?.kill();
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <noscript>
        <style>{".projects-grid-reveal{opacity:1 !important}"}</style>
      </noscript>
      <ProjectsStage />
      <section
        ref={sectionRef}
        id="projects"
        className="projects-grid-reveal grid scroll-mt-24 grid-cols-1 gap-x-7 gap-y-16 pb-28 opacity-0 md:grid-cols-2 md:gap-y-20 md:pb-36"
      >
        {records.map((record, index) => (
          <ProjectCard key={record.slug} record={record} index={index} />
        ))}
      </section>
    </>
  );
}
