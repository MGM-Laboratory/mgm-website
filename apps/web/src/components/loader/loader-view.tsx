"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

import "./loader-view.css";

import {
  ARC_RADIUS,
  ARC_TIMES,
  ARCS,
  ART,
  ART_BOX,
  CUTS,
  DIMENSIONS,
  FOLDS,
  MARKS,
  PANELS,
  PEN_PATH,
  SHEET,
  SHEET_CENTRE,
  SLITS,
  SWATCHES,
  TITLE_BLOCK,
  type NetPanel,
  type PanelId,
  type Stroke,
  type Toy,
  type ToyKind,
  DRAW,
  TOYS,
  barText,
  polyPath,
  starPoints,
} from "@/components/loader/loader-net";
import { LoaderShow } from "@/components/loader/loader-show";
import type { LoaderViewProps } from "@/components/loader/site-loader";
import { LOADER_COPY } from "@/data/story";

/**
 * "The deal", the site loader's visuals. The core (`loader-core.ts`) owns
 * the rules and the host (`site-loader.tsx`) the progressbar and the live
 * region; this is everything the visitor sees, and all of it is decoration
 * (`aria-hidden`, nothing focusable).
 *
 * The markup is static, so the server HTML paints the first frame before
 * any script runs: the cutting mat, the four-point star tracing the box's
 * dieline, the fold lines, dimensions and marks (CSS animations on
 * transform and opacity, which keep playing on the compositor while the
 * page hydrates). Once the bundle runs, `LoaderShow` deals the cards,
 * prints the panels, turns the counter, rotates the status lines, lets the
 * shapes be played with, and at the end folds the net into the box and
 * opens the page through a star. A reload in the same tab
 * (`html[data-loader-fast]`) starts on the finished box and only plays the
 * reveal.
 */

const u = (n: number) => `calc(var(--u) * ${Math.round(n * 10) / 10})`;
const sx = (x: number) => x - SHEET.x0;
const sy = (y: number) => y - SHEET.y0;
const s3 = (n: number) => `${Math.round(n * 1000) / 1000}s`;

type Vars = CSSProperties & Record<`--${string}`, string | number>;

function penKeyframes() {
  const pct = (t: number) => `${Math.round((t / DRAW.pen) * 10000) / 100}%`;
  const at = (x: number, y: number, scale: number) =>
    `transform:translate(${u(sx(x))},${u(sy(y))}) scale(${scale})`;
  const [cx, cy] = SHEET_CENTRE;
  const frames: string[] = [`0%{${at(cx, cy, 1.25)}}`, `${pct(DRAW.penMove)}{${at(cx, cy, 1.25)}}`];
  for (const { p, at: f } of PEN_PATH) {
    frames.push(`${pct(DRAW.traceStart + f * DRAW.trace)}{${at(p[0], p[1], 0.85)}}`);
  }
  const [x0, y0] = PEN_PATH[0]?.p ?? [0, 0];
  frames.push(`${pct(DRAW.pen - 0.06)}{${at(x0, y0, 1.2)};opacity:1}`);
  frames.push(`100%{${at(x0, y0, 0)};opacity:0}`);
  return `@keyframes ld-pen{${frames.join("")}}`;
}

/** A glint that keeps running along the cut line while the page waits (70% of each loop, then a rest). */
function glintKeyframes() {
  const frames = PEN_PATH.map(
    ({ p, at }) =>
      `${Math.round(at * 7000) / 100}%{transform:translate(${u(sx(p[0]))},${u(sy(p[1]))})}`,
  );
  frames.push("0%,70%,100%{opacity:0}", "3%,66%{opacity:1}");
  return `@keyframes ld-glint{${frames.join("")}}`;
}

const PEN_CSS = penKeyframes() + glintKeyframes();

function StarShape({ glow = true }: Readonly<{ glow?: boolean }>) {
  const core = polyPath(starPoints(50, 50, 50));
  return (
    <svg viewBox="0 0 100 100" className="ld-star-shape">
      {glow ? <path className="ld-star-glow" d={polyPath(starPoints(50, 50, 50, 0.5))} /> : null}
      <path className="ld-star-core" d={core} />
    </svg>
  );
}

function strokeStyle(stroke: Stroke, delay: number, duration: number): Vars {
  return {
    left: u(sx(stroke.a[0])),
    top: u(sy(stroke.a[1])),
    width: u(stroke.length),
    "--a": `${Math.round(stroke.angle * 100) / 100}deg`,
    "--d": s3(delay),
    "--t": s3(Math.max(0.02, duration)),
  };
}

function Blueprint() {
  const nodes: ReactNode[] = [];
  CUTS.forEach((stroke, i) => {
    nodes.push(
      <i
        key={`c${i}`}
        className="ld-cut"
        style={strokeStyle(
          stroke,
          DRAW.traceStart + stroke.at * DRAW.trace,
          stroke.span * DRAW.trace,
        )}
      />,
    );
  });
  ARCS.forEach((arc) => {
    const time = ARC_TIMES.get(arc.segment);
    const left = arc.corner === "tl" || arc.corner === "bl" ? arc.cx - ARC_RADIUS : arc.cx;
    const top = arc.corner === "tl" || arc.corner === "tr" ? arc.cy - ARC_RADIUS : arc.cy;
    nodes.push(
      <i
        key={`a${arc.segment}`}
        className="ld-arc"
        data-corner={arc.corner}
        style={
          {
            left: u(sx(left)),
            top: u(sy(top)),
            "--d": s3(DRAW.traceStart + ((time?.at ?? 0) + (time?.span ?? 0) / 2) * DRAW.trace),
          } as Vars
        }
      />,
    );
  });
  SLITS.forEach((stroke, i) => {
    nodes.push(
      <i
        key={`s${i}`}
        className="ld-cut"
        style={strokeStyle(stroke, DRAW.slits + i * 0.05, 0.14)}
      />,
    );
  });
  FOLDS.forEach((stroke, i) => {
    nodes.push(
      <i
        key={`f${i}`}
        className="ld-fold"
        style={strokeStyle(stroke, DRAW.folds + i * DRAW.foldStep, DRAW.foldDraw)}
      />,
    );
  });
  DIMENSIONS.forEach((dim, i) => {
    const axis = dim.a[1] === dim.b[1] ? "x" : "y";
    const span = 68;
    const style: Vars =
      axis === "x"
        ? {
            left: u(sx(dim.a[0])),
            top: u(sy(dim.a[1] - span / 2)),
            width: u(dim.b[0] - dim.a[0]),
            height: u(span),
            "--d": s3(DRAW.dims + i * 0.07),
          }
        : {
            left: u(sx(dim.a[0] - span / 2)),
            top: u(sy(dim.a[1])),
            width: u(span),
            height: u(dim.b[1] - dim.a[1]),
            "--d": s3(DRAW.dims + i * 0.07),
          };
    nodes.push(
      <span key={`d${i}`} className="ld-dim" data-axis={axis} style={style}>
        <span className="ld-dim-line" />
        <span className="ld-label">{dim.label}</span>
      </span>,
    );
  });
  nodes.push(
    <span
      key="title"
      className="ld-title-block"
      style={
        {
          left: u(sx(TITLE_BLOCK.x)),
          top: u(sy(TITLE_BLOCK.y)),
          width: u(TITLE_BLOCK.w),
          height: u(TITLE_BLOCK.h),
          "--d": s3(DRAW.title),
        } as Vars
      }
    >
      <strong>{LOADER_COPY.sheet.title}</strong>
      <span>{LOADER_COPY.sheet.size}</span>
      <span>{LOADER_COPY.sheet.maker}</span>
    </span>,
  );
  MARKS.forEach(([x, y], i) => {
    nodes.push(
      <i
        key={`m${i}`}
        className="ld-mark"
        style={{ left: u(sx(x)), top: u(sy(y)), "--d": s3(DRAW.marks + i * 0.05) } as Vars}
      />,
    );
  });
  [
    "var(--brand-blue)",
    "var(--brand-yellow)",
    "var(--brand-red)",
    "var(--brand-green)",
    "var(--ld-ink)",
  ].forEach((colour, i) => {
    nodes.push(
      <i
        key={`w${i}`}
        className="ld-swatch"
        data-swatch={i}
        style={
          {
            left: u(sx(SWATCHES.x + i * (SWATCHES.size + SWATCHES.gap))),
            top: u(sy(SWATCHES.y)),
            width: u(SWATCHES.size),
            height: u(SWATCHES.size),
            "--c": colour,
            "--d": s3(DRAW.swatches + i * 0.04),
          } as Vars
        }
      >
        <span />
      </i>,
    );
  });
  return (
    <div className="ld-print-sheet" data-ld="blueprint">
      {nodes}
      <i className="ld-glint" />
      <div className="ld-pen" data-ld="pen">
        <div className="ld-pen-star">
          <StarShape />
        </div>
      </div>
    </div>
  );
}

const CHILDREN = new Map<PanelId | null, NetPanel[]>();
for (const panel of PANELS) {
  const list = CHILDREN.get(panel.parent) ?? [];
  list.push(panel);
  CHILDREN.set(panel.parent, list);
}

function Panel({ panel }: Readonly<{ panel: NetPanel }>) {
  const [vw, vh] = ART_BOX[panel.art];
  const root = panel.parent === null;
  const style: Vars = {
    left: u(root ? sx(panel.x) : panel.x),
    top: u(root ? sy(panel.y) : panel.y),
    width: u(panel.w),
    height: u(panel.h),
    transformOrigin: panel.origin,
    "--fold": panel.fold,
  };
  const face: CSSProperties = {
    clipPath: panel.clip,
    borderRadius: panel.radius,
    overflow: panel.radius ? "hidden" : undefined,
  };
  const shade: Vars = {
    "--ld-shade-c": panel.shade < 0 ? "#000" : "#fff",
    "--shade-a": Math.abs(panel.shade),
  };
  return (
    <div className="ld-p" data-panel={panel.id} data-print={panel.print} style={style}>
      <div className="ld-face ld-out" style={face}>
        <div className="ld-ink">
          <div className="ld-ink-in">
            <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none">
              <use href={`#ld-art-${panel.art}`} />
            </svg>
          </div>
          <i className="ld-edge" />
        </div>
        <div className="ld-shade" style={shade} />
      </div>
      <div className="ld-face ld-in" style={face} />
      {(CHILDREN.get(panel.id) ?? []).map((child) => (
        <Panel key={child.id} panel={child} />
      ))}
      {root ? (
        <>
          <div className="ld-deck3d" data-ld="deck3d" />
          <div className="ld-eyes" data-ld="eyes">
            <span className="ld-eye">
              <span className="ld-pupil" />
              <span className="ld-lash" />
            </span>
            <span className="ld-eye">
              <span className="ld-pupil" />
              <span className="ld-lash" />
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ArtDefs() {
  return (
    <svg width="0" height="0" className="absolute">
      <defs>
        {Object.entries(ART).map(([key, d]) => (
          <path key={key} id={`ld-art-${key}`} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </defs>
    </svg>
  );
}

function Counter() {
  return (
    <div className="ld-count" data-ld="count">
      <span className="ld-odo">
        <span className="ld-digit" data-ld="tens">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </span>
        <span className="ld-digit" data-ld="ones">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </span>
      </span>
      <span className="ld-of">/ 52</span>
    </div>
  );
}

const SHEET_BOTTOM = "(var(--ld-sheet-top) + var(--ld-sheet-h))";

/** A toy's top on portrait screens (see `Toy.band`). */
function portraitY(toy: Toy) {
  const y = toy.portrait[1];
  if (toy.band === "above") return `calc(var(--ld-sheet-top) * ${y})`;
  if (toy.band === "below") return `calc(${SHEET_BOTTOM} + (100cqh - ${SHEET_BOTTOM}) * ${y})`;
  return `${y}cqh`;
}

function ToyShape({ kind, colour }: Readonly<{ kind: ToyKind; colour: string }>) {
  const fill = { fill: colour } as CSSProperties;
  switch (kind) {
    case "circle":
      return <circle cx="50" cy="50" r="50" style={fill} />;
    case "half":
      return <path d="M0 74a50 50 0 0 1 100 0z" style={fill} />;
    case "triangle":
      return <path d="M0 100H100L0 0z" style={fill} />;
    case "plus":
      return <path d="M37 0h26v37h37v26H63v37H37V63H0V37h37z" style={fill} />;
    case "ring":
      return (
        <circle cx="50" cy="50" r="38" style={{ fill: "none", stroke: colour, strokeWidth: 24 }} />
      );
    case "leaf":
      return <path d="M50 0C80 24 80 76 50 100C20 76 20 24 50 0z" style={fill} />;
    case "cross":
      return (
        <path
          d="M18 0L50 32L82 0L100 18L68 50L100 82L82 100L50 68L18 100L0 82L32 50L0 18z"
          style={fill}
        />
      );
    case "square":
      return <rect width="100" height="100" style={fill} />;
    case "star":
      return <path d={polyPath(starPoints(50, 50, 50))} style={fill} />;
  }
}

function Toys() {
  return (
    <div className="ld-toys" data-ld="toys">
      {TOYS.map((toy, i) => (
        <span
          key={toy.kind}
          className="ld-toy"
          data-toy={i}
          data-wide={toy.wide ? "" : undefined}
          style={
            {
              "--x": `${toy.at[0]}cqw`,
              "--y": `${toy.at[1]}cqh`,
              "--px": `${toy.portrait[0]}cqw`,
              "--py": portraitY(toy),
              "--sx": `${toy.short[0]}cqw`,
              "--sy": `${toy.short[1]}cqh`,
              "--s": `clamp(${Math.round(toy.size * 0.62)}px, ${Math.round((toy.size / 14.4) * 100) / 100}cqw, ${toy.size}px)`,
              "--d": s3(0.5 + i * 0.07),
              "--dur": s3(3.2 + (i % 4) * 0.7),
              "--dx": `${toy.drift[0]}px`,
              "--dy": `${toy.drift[1]}px`,
              "--dr": `${toy.drift[2]}deg`,
            } as Vars
          }
        >
          <span className="ld-toy-drift">
            <span className="ld-toy-push">
              <span className="ld-toy-play">
                <svg viewBox="0 0 100 100">
                  <ToyShape kind={toy.kind} colour={toy.colour} />
                </svg>
              </span>
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

export function LoaderView({ state, onExited, onRevealing }: LoaderViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const showRef = useRef<LoaderShow | null>(null);
  const exitedRef = useRef(onExited);
  const revealingRef = useRef(onRevealing);

  useLayoutEffect(() => {
    exitedRef.current = onExited;
    revealingRef.current = onRevealing;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const show = new LoaderShow(root, {
      exited: () => {
        exitedRef.current();
      },
      revealing: () => {
        revealingRef.current?.();
      },
    });
    showRef.current = show;
    return () => {
      showRef.current = null;
      show.dispose();
    };
  }, []);

  useEffect(() => {
    showRef.current?.update(state);
  }, [state]);

  return (
    <div ref={rootRef} className="ld" aria-hidden="true">
      <style>{PEN_CSS}</style>
      <ArtDefs />
      <div className="ld-mat" />
      <div className="ld-stage">
        <div className="ld-sheet" data-ld="sheet">
          <Blueprint />
          <div className="ld-pose" data-ld="pose">
            {(CHILDREN.get(null) ?? []).map((panel) => (
              <Panel key={panel.id} panel={panel} />
            ))}
          </div>
        </div>
      </div>
      <Toys />
      <div className="ld-hub" data-ld="hub">
        <div className="ld-fan" data-ld="fan" />
        <div className="ld-hub-star" data-ld="hub-star">
          <StarShape />
        </div>
        <Counter />
        <span className="ld-caption">{LOADER_COPY.counter}</span>
      </div>
      <p className="ld-status" data-ld="status">
        {LOADER_COPY.statuses[0]}
      </p>
      <div className="ld-iris" data-ld="iris" />
      <p className="ld-bar" data-ld="bar">
        {barText(0)}
      </p>
    </div>
  );
}
