"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";

import { CONNECTED_TOOLS } from "@/data/website-focus";
import { TOOL_ICONS } from "@/data/tool-icons";
import { cn } from "@/lib/utils";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// Positions around an ellipse, as percentages of the container — the ring
// layout is authored here in CSS-space; the SVG beam paths are measured
// from the real rendered DOM (getBoundingClientRect) rather than computed
// from these percentages, so they stay correct through any reflow.
function ringPosition(i: number, total: number) {
  const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
  const x = 50 + 45 * Math.cos(angle);
  const y = 50 + 42 * Math.sin(angle);
  return { left: `${x}%`, top: `${y}%` };
}

export function ToolConnections() {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [diagram, setDiagram] = useState(false);

  useLayoutEffect(() => {
    const canDiagram = window.matchMedia("(min-width: 768px)").matches;
    queueMicrotask(() => setDiagram(canDiagram));
  }, []);

  useLayoutEffect(() => {
    if (!diagram) return undefined;
    const container = containerRef.current;
    const center = centerRef.current;
    if (!container || !center) return undefined;

    function draw() {
      const box = container!.getBoundingClientRect();
      const centerBox = center!.getBoundingClientRect();
      const cx = centerBox.left + centerBox.width / 2 - box.left;
      const cy = centerBox.top + centerBox.height / 2 - box.top;

      nodeRefs.current.forEach((node, i) => {
        const path = pathRefs.current[i];
        if (!node || !path) return;
        const nodeBox = node.getBoundingClientRect();
        const nx = nodeBox.left + nodeBox.width / 2 - box.left;
        const ny = nodeBox.top + nodeBox.height / 2 - box.top;
        const mx = (nx + cx) / 2;
        const my = (ny + cy) / 2 - 20;
        path.setAttribute("d", `M ${nx} ${ny} Q ${mx} ${my} ${cx} ${cy}`);
      });
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);

    const reduced = reducedMotion();
    const tweens = reduced
      ? []
      : pathRefs.current.map((path) =>
          path
            ? gsap.to(path, { strokeDashoffset: -48, duration: 1.8, ease: "none", repeat: -1 })
            : null,
        );

    return () => {
      ro.disconnect();
      tweens.forEach((t) => t?.kill());
    };
  }, [diagram]);

  return (
    <section className="bg-background px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-xs font-semibold tracking-wide text-brand-blue uppercase">
          Everything connects
        </p>
        <h2 className="mt-3 max-w-2xl font-display text-[clamp(1.75rem,3vw+1rem,2.5rem)] font-semibold tracking-tight text-foreground">
          One lab, wired into all of it.
        </h2>
        <p className="mt-4 max-w-2xl text-foreground/60">
          No separate silo per tool — the same project touches all of these on its way out the door.
        </p>

        <p className="sr-only">
          Connected tools: {CONNECTED_TOOLS.join(", ")}, and everything else on this page.
        </p>

        {diagram ? (
          <div ref={containerRef} aria-hidden="true" className="relative mt-14 h-[420px] w-full">
            <svg className="absolute inset-0 h-full w-full overflow-visible">
              {CONNECTED_TOOLS.map((tool, i) => (
                <path
                  key={tool}
                  ref={(el) => {
                    pathRefs.current[i] = el;
                  }}
                  fill="none"
                  stroke="var(--brand-blue)"
                  strokeWidth={1.5}
                  strokeOpacity={0.55}
                  strokeDasharray="3 9"
                  strokeLinecap="round"
                  className="drop-shadow-[0_0_3px_rgba(58,109,197,0.7)]"
                />
              ))}
            </svg>

            <div
              ref={centerRef}
              className="absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--line)] bg-background shadow-lg shadow-black/[0.06]"
            >
              <Image src="/logo.svg" alt="" width={34} height={34} />
            </div>

            {CONNECTED_TOOLS.map((tool, i) => {
              const Icon = TOOL_ICONS[tool];
              const pos = ringPosition(i, CONNECTED_TOOLS.length);
              return (
                <div
                  key={tool}
                  ref={(el) => {
                    nodeRefs.current[i] = el;
                  }}
                  style={{ left: pos.left, top: pos.top }}
                  className="absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--line)] bg-background text-foreground/70 shadow-md shadow-black/[0.05]"
                >
                  {Icon ? <Icon size={20} /> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-10 flex flex-wrap gap-3">
            {CONNECTED_TOOLS.map((tool) => {
              const Icon = TOOL_ICONS[tool];
              return (
                <span
                  key={tool}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-foreground/70",
                  )}
                >
                  {Icon ? <Icon size={16} /> : null}
                  {tool}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
