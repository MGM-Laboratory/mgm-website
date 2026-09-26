"use client";

import { Fragment, useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { useMotionPreference } from "@/lib/reduced-motion";
import type { ChapterShape, ChapterTone, HomeChapter } from "./chapters";
import { startKinetic } from "./kinetic-play";

const TONE: Record<ChapterTone, string> = {
  blue: "var(--brand-blue)",
  red: "var(--brand-red)",
  yellow: "var(--brand-yellow)",
  green: "var(--brand-green)",
};

function ChapterGlyph({ shape, color }: { shape: ChapterShape; color: string }) {
  switch (shape) {
    case "square":
      return <rect x="0.5" y="0.5" width="9" height="9" fill={color} />;
    case "triangle":
      return <polygon points="0.5,0.5 0.5,9.5 9.5,9.5" fill={color} />;
    case "plus":
      return (
        <path d="M5 0.5V9.5M0.5 5H9.5" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      );
    default:
      return <circle cx="5" cy="5" r="4.6" fill={color} />;
  }
}

/** The small "04 · What we do" chapter mark above a homepage heading. */
function ChapterMark({ chapter }: { chapter: HomeChapter }) {
  return (
    <p className="kh-chapter mb-4 flex items-center gap-2.5 text-xs leading-none font-semibold tracking-[0.12em] text-foreground/60 uppercase opacity-0">
      <span className="sr-only">{`Chapter ${chapter.number}: ${chapter.label}`}</span>
      <svg
        aria-hidden
        className="kh-chapter-shape size-2.5 shrink-0 overflow-visible"
        viewBox="0 0 10 10"
      >
        <ChapterGlyph shape={chapter.shape} color={TONE[chapter.tone]} />
      </svg>
      <span aria-hidden className="kh-chapter-number font-mono tracking-normal tabular-nums">
        {chapter.number}
      </span>
      <span aria-hidden className="kh-chapter-rule h-px w-5 bg-current opacity-50" />
      <span aria-hidden className="kh-chapter-label">
        {chapter.label}
      </span>
    </p>
  );
}

type KineticHeadingProps = {
  text: string;
  /** Heading level; section headings are h2. */
  as?: "h2" | "h3";
  /** Classes for the heading itself (type, colour). */
  className?: string;
  /** Classes for the wrapper around the chapter mark and the heading. */
  wrapperClassName?: string;
  /** A chapter mark above the heading (homepage story sections only). */
  chapter?: HomeChapter;
  /** One word to set in brand blue, a deliberate highlight for a big moment. */
  accent?: string;
  id?: string;
};

/**
 * A section heading whose letters are alive (kinetic-play.ts): they drop in
 * with a spin when the heading scrolls in, lean and gain weight around the
 * cursor, and hop when pressed.
 *
 * The letters are split here, in the server HTML, so nothing re-lays out at
 * hydration. Screen readers get the plain sentence from an sr-only copy;
 * the letters are `aria-hidden`. The heading renders hidden (opacity only)
 * until its effect runs, with a noscript override, like the sections'
 * `.reveal-card` blocks.
 */
export function KineticHeading({
  text,
  as: Tag = "h2",
  className,
  wrapperClassName,
  chapter,
  accent,
  id,
}: KineticHeadingProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const motion = useMotionPreference();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return startKinetic(root);
  }, [motion]);

  const words = text.split(" ");
  const accentWord = accent?.toLowerCase();

  return (
    <div ref={rootRef} className={cn("kinetic", wrapperClassName)}>
      <noscript>
        <style>{".kinetic-heading,.kh-chapter{opacity:1 !important}"}</style>
      </noscript>
      {chapter ? <ChapterMark chapter={chapter} /> : null}
      <Tag id={id} className={cn("kinetic-heading opacity-0", className)}>
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          {words.map((word, wi) => {
            const bare = word.replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase();
            const highlighted = accentWord !== undefined && bare === accentWord;
            return (
              <Fragment key={wi}>
                {wi > 0 ? " " : null}
                <span
                  className={cn(
                    "kh-word inline-block whitespace-nowrap",
                    highlighted && "text-brand-blue",
                  )}
                >
                  {Array.from(word).map((ch, ci) => (
                    <span key={ci} className="kh-char inline-flex justify-center">
                      <span className="kh-glyph inline-block">{ch}</span>
                    </span>
                  ))}
                </span>
              </Fragment>
            );
          })}
        </span>
      </Tag>
    </div>
  );
}
