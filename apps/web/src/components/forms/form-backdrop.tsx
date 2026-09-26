"use client";

import { useMemo, type CSSProperties } from "react";
import type { FormDesign, FormPattern } from "@repo/shared";

import { focalPosition, formMediaSrc } from "@/lib/forms/public-media";
import type { ProjectColorScheme } from "@/lib/project-themes";

import type { SceneBus } from "./scene/bus";
import { SceneHost } from "./scene/scene-host";
import { buildPieces } from "./scene/vocabulary";

/**
 * Everything behind the questions, back to front: the background picture
 * or video (dimmed toward the page colour), a quote of the brand pattern
 * tiles in two corners, and the scene. All of it is decoration: hidden
 * from assistive technology and never in the tab order.
 */

const PATTERN_COLOURS = ["blue", "red", "yellow", "green"] as const;
const PATTERN_NAMES: Exclude<FormPattern, "none" | "mixed">[] = [
  "arcs",
  "circle",
  "clover",
  "domes",
  "fans",
  "leaves",
  "plus",
  "quads",
  "square",
  "x",
];

function tileFor(pattern: FormPattern, index: number) {
  const name =
    pattern === "mixed"
      ? PATTERN_NAMES[(index * 7 + 3) % PATTERN_NAMES.length]
      : (pattern as (typeof PATTERN_NAMES)[number]);
  const colour = PATTERN_COLOURS[(index * 3 + 1) % PATTERN_COLOURS.length];
  // Alternate the two variants so the block reads as a poster excerpt.
  return index % 2 === 0
    ? `/patterns/${name}-${colour}-on-white.svg`
    : `/patterns/${name}-white-on-${colour}.svg`;
}

function PatternBlock({
  pattern,
  corner,
  cols,
  rows,
  offset,
}: {
  pattern: FormPattern;
  corner: "tr" | "br";
  cols: number;
  rows: number;
  offset: number;
}) {
  const cells = cols * rows;
  // Leave a stepped edge toward the page, like a torn corner of the poster.
  const kept = (index: number) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const fromEdge = corner === "tr" ? cols - 1 - col + row : cols - 1 - col + (rows - 1 - row);
    return fromEdge < Math.max(cols, rows);
  };
  return (
    <div
      className="fx-pattern-block"
      data-corner={corner}
      style={{ ["--cols" as string]: cols } as CSSProperties}
    >
      {Array.from({ length: cells }, (_, index) =>
        kept(index) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={index} src={tileFor(pattern, index + offset)} alt="" draggable={false} />
        ) : (
          <span key={index} />
        ),
      )}
    </div>
  );
}

export function FormBackdrop({
  slug,
  design,
  scheme,
  progress,
  complete,
  stage,
  bus,
  forceStatic,
}: {
  slug: string;
  design: FormDesign;
  scheme: ProjectColorScheme;
  progress: number;
  complete: boolean;
  stage: "welcome" | "form" | "ending" | "status";
  bus?: SceneBus;
  forceStatic?: boolean;
}) {
  const { background } = design;
  const media = background.media;
  const mediaSrc = formMediaSrc(media);
  const pieces = useMemo(
    () => buildPieces(slug, background.scene, background.intensity),
    [slug, background.scene, background.intensity],
  );

  return (
    <>
      {mediaSrc && media ? (
        <div
          className="fx-layer fx-layer-media"
          aria-hidden
          style={{ ["--fx-dim" as string]: background.dim / 100 } as CSSProperties}
        >
          {media.kind === "video" ? (
            <video
              src={mediaSrc}
              autoPlay
              muted
              loop
              playsInline
              style={{ objectPosition: focalPosition(media) }}
            />
          ) : media.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc} alt="" style={{ objectPosition: focalPosition(media) }} />
          ) : null}
        </div>
      ) : null}
      {background.pattern !== "none" ? (
        <div
          className="fx-layer fx-layer-pattern"
          aria-hidden
          style={{ opacity: Math.max(0.25, 1 - background.dim / 100) }}
        >
          <PatternBlock pattern={background.pattern} corner="tr" cols={3} rows={2} offset={0} />
          <PatternBlock pattern={background.pattern} corner="br" cols={4} rows={3} offset={5} />
        </div>
      ) : null}
      {background.scene !== "none" ? (
        <SceneHost
          slug={slug}
          design={design}
          scheme={scheme}
          pieces={pieces}
          progress={progress}
          complete={complete}
          stage={stage}
          bus={bus}
          forceStatic={forceStatic}
        />
      ) : null}
    </>
  );
}
