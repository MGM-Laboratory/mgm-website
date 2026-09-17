"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";

import { cn } from "@/lib/utils";
import { COMPETENCIES, type Competency, type CompetencyColor } from "@/data/competencies";
import { CompetencyMotifShape } from "@/components/sections/competency-motif";
import { RevealSection } from "./reveal-section";
import styles from "./flowing-competencies.module.css";

// The same four brand colors CoreCompetenciesSection already assigns per
// competency (see components/sections/core-competencies.tsx CARD_BG) — kept
// in sync here rather than shared, since one is a Tailwind class map and this
// one needs raw values for inline canvas-less style props.
const ITEM_FILL: Record<CompetencyColor, string> = {
  blue: "var(--brand-blue)",
  red: "var(--brand-red)",
  yellow: "var(--brand-yellow)",
  green: "var(--brand-green)",
};
const ITEM_INK: Record<CompetencyColor, string> = {
  blue: "#ffffff",
  red: "#ffffff",
  yellow: "var(--ink)",
  green: "#ffffff",
};

const SPEED = 22;
const ANIMATION_DEFAULTS = { duration: 0.6, ease: "expo" };

function distMetric(x: number, y: number, x2: number, y2: number) {
  const xDiff = x - x2;
  const yDiff = y - y2;
  return xDiff * xDiff + yDiff * yDiff;
}

function findClosestEdge(mouseX: number, mouseY: number, width: number, height: number) {
  const topEdgeDist = distMetric(mouseX, mouseY, width / 2, 0);
  const bottomEdgeDist = distMetric(mouseX, mouseY, width / 2, height);
  return topEdgeDist < bottomEdgeDist ? "top" : "bottom";
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

function FlowingItem({ competency }: { competency: Competency }) {
  const itemRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeInnerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<gsap.core.Tween | null>(null);
  const [repetitions, setRepetitions] = useState(4);

  useEffect(() => {
    const calculateRepetitions = () => {
      const part = marqueeInnerRef.current?.querySelector<HTMLElement>(`.${styles.part}`);
      if (!part) return;
      const needed = Math.ceil(window.innerWidth / part.offsetWidth) + 2;
      const next = Math.max(4, needed);
      setRepetitions((prev) => (prev === next ? prev : next));
    };
    calculateRepetitions();
    window.addEventListener("resize", calculateRepetitions);
    return () => window.removeEventListener("resize", calculateRepetitions);
  }, []);

  useEffect(() => {
    if (reducedMotion()) return;
    const part = marqueeInnerRef.current?.querySelector<HTMLElement>(`.${styles.part}`);
    if (!part || !marqueeInnerRef.current) return;
    const contentWidth = part.offsetWidth;
    if (contentWidth === 0) return;

    animationRef.current?.kill();
    const timer = setTimeout(() => {
      animationRef.current = gsap.to(marqueeInnerRef.current, {
        x: -contentWidth,
        duration: SPEED,
        ease: "none",
        repeat: -1,
      });
    }, 50);

    return () => {
      clearTimeout(timer);
      animationRef.current?.kill();
    };
  }, [repetitions]);

  const reveal = (edge: "top" | "bottom") => {
    if (!marqueeRef.current || !marqueeInnerRef.current) return;
    const d = reducedMotion() ? 0 : 1;
    gsap
      .timeline({ defaults: { ...ANIMATION_DEFAULTS, duration: ANIMATION_DEFAULTS.duration * d } })
      .set(marqueeRef.current, { y: edge === "top" ? "-101%" : "101%" }, 0)
      .set(marqueeInnerRef.current, { y: edge === "top" ? "101%" : "-101%" }, 0)
      .to([marqueeRef.current, marqueeInnerRef.current], { y: "0%" }, 0);
  };

  const hide = (edge: "top" | "bottom") => {
    if (!marqueeRef.current || !marqueeInnerRef.current) return;
    const d = reducedMotion() ? 0 : 1;
    gsap
      .timeline({ defaults: { ...ANIMATION_DEFAULTS, duration: ANIMATION_DEFAULTS.duration * d } })
      .to(marqueeRef.current, { y: edge === "top" ? "-101%" : "101%" }, 0)
      .to(marqueeInnerRef.current, { y: edge === "top" ? "101%" : "-101%" }, 0);
  };

  const handleEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = itemRef.current?.getBoundingClientRect();
    if (!rect) return;
    reveal(findClosestEdge(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height));
  };
  const handleLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = itemRef.current?.getBoundingClientRect();
    if (!rect) return;
    hide(findClosestEdge(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height));
  };

  const ink = ITEM_INK[competency.color];

  return (
    <div className={styles.item} ref={itemRef}>
      <Link
        href={competency.href}
        className={cn(
          styles.itemLink,
          "text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-foreground",
        )}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={() => reveal("top")}
        onBlur={() => hide("top")}
      >
        {competency.title}
      </Link>
      <div
        className={styles.marquee}
        ref={marqueeRef}
        style={{ backgroundColor: ITEM_FILL[competency.color] }}
      >
        <div className={styles.innerWrap}>
          <div className={styles.inner} ref={marqueeInnerRef} aria-hidden="true">
            {Array.from({ length: repetitions }).map((_, idx) => (
              <div className={styles.part} key={idx} style={{ color: ink }}>
                <span>{competency.title}</span>
                <span className={styles.icon}>
                  <CompetencyMotifShape
                    motif={competency.motif}
                    stroke={ink}
                    className="!relative h-full w-full"
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FlowingCompetencies() {
  return (
    <section className="bg-background px-6 pt-12 pb-20 sm:px-10 sm:pt-16 sm:pb-28 lg:px-16">
      <RevealSection className="mx-auto max-w-5xl" stagger={0.08}>
        <h2 className="reveal-item font-display text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-tight text-foreground opacity-0">
          Core Competencies
        </h2>
        <p className="reveal-item mt-4 max-w-2xl text-foreground/60 opacity-0">
          Research, design, and engineering, all under one roof. Pick a focus to see what we build.
        </p>
      </RevealSection>

      <RevealSection className="mx-auto mt-10 max-w-5xl">
        <div className="reveal-item h-[440px] w-full overflow-hidden rounded-3xl border border-[var(--line)] opacity-0 sm:h-[520px]">
          <nav className={styles.menu}>
            {COMPETENCIES.map((c) => (
              <FlowingItem key={c.title} competency={c} />
            ))}
          </nav>
        </div>
      </RevealSection>
    </section>
  );
}
