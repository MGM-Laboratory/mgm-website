"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";

import type { HomeContent } from "@repo/shared";
import { ReelController } from "@/components/reel/reel-controller";
import { startReelGl } from "@/components/reel/reel-gl-driver";
import { ReelPlayerHost } from "@/components/reel/player/reel-player-host";
import { REEL_COPY } from "@/data/reel";
import { homeVideoSource } from "@/lib/home-cms";
import { attachMagnetic } from "@/lib/motion/magnetic";
import styles from "@/components/reel/reel.module.css";

// A layout effect on purpose (docs/animation-system.md gotcha #13): the
// snap scrolls the page, so its cleanup must run in the commit that leaves
// the route, before the root layout resets the scroll.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(" ");

/** The five marks the frame's corners and quarters cycle through. */
function MarkShapes() {
  return (
    <svg className={styles.mark} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <g className={styles.kindPlus}>
        <rect x="0" y="7" width="16" height="2" fill="currentColor" />
        <rect x="7" y="0" width="2" height="16" fill="currentColor" />
      </g>
      <g className={styles.kindX} transform="rotate(45 8 8)">
        <rect x="-0.5" y="7" width="17" height="2.2" style={{ fill: "var(--brand-red)" }} />
        <rect x="6.9" y="-0.5" width="2.2" height="17" style={{ fill: "var(--brand-red)" }} />
      </g>
      <g className={styles.kindCircle}>
        <circle cx="8" cy="8" r="7" style={{ fill: "var(--brand-yellow)" }} />
      </g>
      <g className={styles.kindTriangle}>
        <path d="M8 1.2 15.2 14.4H.8Z" style={{ fill: "var(--brand-blue)" }} />
      </g>
      <g className={styles.kindHalf}>
        <path d="M.8 11.5a7.2 7.2 0 0 1 14.4 0Z" style={{ fill: "var(--brand-green)" }} />
      </g>
    </svg>
  );
}

function Band({
  position,
  firstLine,
  longestLine,
}: {
  position: "top" | "bottom";
  firstLine: string;
  longestLine: string;
}) {
  return (
    <div className={styles.band} data-reel-band={position}>
      <div className={styles.marks}>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={styles.markSlot} data-reel="mark-slot">
            <span className={styles.markEmerge} data-reel="mark-emerge">
              <span className={styles.markSwap} data-reel="mark-swap" data-kind="plus">
                <MarkShapes />
              </span>
            </span>
          </span>
        ))}
      </div>
      <div className={styles.strip} data-reel="strip">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className={styles.stripItem} data-reel="strip-item">
            <svg
              className={styles.stripArrows}
              viewBox="0 0 26 8"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M0 0 7 4 0 8ZM9.5 0l7 4-7 4ZM19 0l7 4-7 4Z" fill="currentColor" />
            </svg>
            <span className={styles.stripMask}>
              <span className={styles.stripSizer}>{longestLine}</span>
              <span className={styles.stripText} data-reel="strip-text">
                {firstLine}
              </span>
              <span className={styles.stripText} data-reel="strip-text" />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PlayWord({ text }: { text: string }) {
  return (
    <span className={styles.playWord} data-reel="play-word">
      {Array.from(text.toUpperCase()).map((char, index) => (
        <span key={index} className={styles.char} data-reel="char">
          <span className={styles.charMask}>
            <span className={styles.charTrack} data-reel="char-track">
              <span className={styles.glyph}>{char}</span>
              <span className={styles.glyph}>{char}</span>
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * "Meet the lab": the chapter below the process magnets. A small, already
 * playing video under the title stretches into the big frame as the page
 * scrolls (pulled into place like cloth), holds there, and a play button
 * opens the full-screen player. A ribbon draws itself through the section
 * as you go. Without an uploaded video, a Bauhaus test card stands in and
 * a caption says the film is on its way.
 *
 * Desktop with a fine pointer and hardware WebGL draws the picture and the
 * ribbon in WebGL (reel-gl-driver.ts); everything else runs the DOM
 * version of the same choreography. Phones stack the section and skip the
 * morph and the pin; reduced motion shows the finished state, still.
 */
export function ReelSection({ content }: Readonly<{ content: HomeContent }>) {
  const rootRef = useRef<HTMLElement>(null);
  const src = homeVideoSource(content);
  const copy = REEL_COPY;
  const stripLines = src ? copy.stripLines : copy.placeholderStripLines;

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let stopGl: (() => void) | null = null;
    let disposed = false;
    const controller = new ReelController(root, {
      src,
      stripLines,
      coordinates: copy.coordinates,
      onApproach: () => {
        if (disposed || stopGl) return;
        stopGl = startReelGl(controller);
      },
    });
    const magnets = [
      root.querySelector<HTMLElement>("[data-reel='cta-magnet']"),
      root.querySelector<HTMLElement>("[data-reel='watch-magnet']"),
    ]
      .filter((el): el is HTMLElement => Boolean(el))
      .map((el, index) =>
        attachMagnetic(
          el,
          index === 0
            ? { radius: 70, strength: 0.3, max: 14 }
            : { radius: 110, strength: 0.28, max: 22 },
        ),
      );
    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, { __reel: controller });
    }
    return () => {
      disposed = true;
      for (const off of magnets) off();
      stopGl?.();
      controller.dispose();
    };
  }, [src, stripLines, copy.coordinates]);

  const descWords = copy.description.split(" ");
  const longestLine = stripLines.reduce((a, b) => (b.length > a.length ? b : a), "");

  return (
    <section
      ref={rootRef}
      id="reel"
      aria-labelledby="reel-title"
      className={cx(styles.section, "reel-section")}
      data-reel-video={src ? "yes" : "none"}
    >
      <svg className={styles.lineSvg} data-reel="line-svg" aria-hidden="true" focusable="false">
        <path className={styles.linePath} data-reel="line-path" pathLength={1} />
      </svg>

      <h2 id="reel-title" className={styles.title} data-reel="title">
        <span className={styles.titleInner} data-reel="title-inner">
          {copy.titleLines.map((line, lineIndex) => (
            <span
              key={lineIndex}
              className={cx(styles.titleLine, lineIndex === 0 && styles.titleLineFirst)}
              data-reel="title-line"
            >
              {line.map((word, wordIndex) => (
                <span key={wordIndex}>
                  <span className={styles.word} data-reel="title-word">
                    {word}
                  </span>
                  {wordIndex < line.length - 1 ? " " : null}
                </span>
              ))}
              {lineIndex < copy.titleLines.length - 1 ? " " : null}
            </span>
          ))}
        </span>
      </h2>

      <div className={styles.content} data-reel="content">
        <p className={styles.desc} data-reel="desc">
          {descWords.map((word, index) => (
            <span key={index}>
              <span className={styles.descWord} data-reel="desc-word">
                {word}
              </span>
              {index < descWords.length - 1 ? " " : null}
            </span>
          ))}
        </p>
        <div className={styles.ctaLift} data-reel="cta-lift">
          <span className={styles.ctaMagnet} data-reel="cta-magnet">
            <Link href={copy.cta.href} className={cx(styles.cta, "reel-cta")}>
              <span className={styles.ctaDot} aria-hidden="true" />
              <span className={styles.ctaText}>{copy.cta.label}</span>
              <svg
                className={styles.ctaArrow}
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M2.3 8h11.4m0 0L8.7 3M13.7 8l-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </span>
        </div>
      </div>

      <div className={styles.thumbWrap} aria-hidden="true">
        <div className={styles.thumb} data-reel="thumb" />
      </div>

      <div className={styles.container}>
        <div className={styles.videoContainer} data-reel="pin">
          <div className={styles.deco} aria-hidden="true">
            <Band position="top" firstLine={stripLines[0]} longestLine={longestLine} />
            <Band position="bottom" firstLine={stripLines[0]} longestLine={longestLine} />
          </div>

          <div className={styles.frame} data-reel="frame">
            <div className={styles.visual} data-reel="visual" aria-hidden="true">
              <div className={styles.media} data-reel="media">
                {src ? (
                  <video
                    className={styles.video}
                    data-reel="video"
                    src={src}
                    muted
                    loop
                    playsInline
                    preload="none"
                    disablePictureInPicture
                    disableRemotePlayback
                    tabIndex={-1}
                  />
                ) : (
                  <canvas className={styles.card} data-reel="card" />
                )}
              </div>
              <div className={styles.tintGrey} data-reel="tint" />
              <div className={styles.tintBlue} data-reel="tint" />
            </div>

            <div className={styles.readout} data-reel="readout" aria-hidden="true">
              <span className={styles.readoutDot} />
              <span className={styles.readoutMask}>
                <span className={styles.readoutLine} data-reel="readout-line">
                  {copy.coordinates}
                </span>
                <span className={styles.readoutLine} data-reel="readout-line" />
              </span>
            </div>

            {src ? (
              <>
                <div className={styles.words} aria-hidden="true">
                  <PlayWord text={copy.playWords[0]} />
                  <PlayWord text={copy.playWords[1]} />
                </div>
                <div className={styles.watchMagnet} data-reel="watch-magnet">
                  <button
                    type="button"
                    className={cx(styles.watch, "reel-watch")}
                    data-reel="watch"
                    aria-label={copy.watchLabel}
                  >
                    <span className={styles.watchFill} aria-hidden="true" />
                    <svg
                      className={styles.watchIcon}
                      viewBox="0 0 36 36"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M12 9.6v16.8c0 1.3 1.4 2.1 2.5 1.4l13.3-8.4c1-.6 1-2.1 0-2.8L14.5 8.2c-1.1-.7-2.5.1-2.5 1.4Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.captionWrap}>
                <p className={styles.caption} data-reel="caption">
                  <svg
                    className={styles.captionMark}
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M.8 11.5a7.2 7.2 0 0 1 14.4 0Z" style={{ fill: "var(--brand-red)" }} />
                  </svg>
                  {copy.placeholderCaption}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ReelPlayerHost />
    </section>
  );
}
