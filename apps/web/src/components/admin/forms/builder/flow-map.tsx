"use client";

import { useId, useMemo } from "react";

import { buildPages, isInputType, type FormDocument } from "@repo/shared";

import { describeGroup } from "./rule-builder";

const NODE_W = 280;
const NODE_H = 52;
const ROW_GAP = 30;
const TOP = 12;
const JUMP_LANE = 16;
const END_LANE = 9;

type Node = {
  key: string;
  kind: "page" | "submit" | "ending";
  title: string;
  detail: string;
  /** page id (`start` or a page_break id) for pages. */
  pageId?: string;
};

type Edge = {
  from: number;
  to: number;
  kind: "next" | "jump" | "ending";
  label?: string;
  title?: string;
  lane: number;
};

/**
 * The page flow: pages as nodes top to bottom, the default "next" as solid
 * arrows, jumps as dashed arrows curving on the right, and the submit step
 * fanning out to the endings on the left.
 */
export function FlowMap({
  document,
  onSelectPage,
}: {
  document: FormDocument;
  onSelectPage?: (pageBreakId: string | "start") => void;
}) {
  const markerId = useId().replace(/:/g, "");
  const { nodes, edges, routes, jumpLanes } = useMemo(() => {
    const pages = buildPages(document.fields);
    const nodes: Node[] = pages.map((page, index) => {
      const questions = page.fields.filter(
        (field) => isInputType(field.type) && field.type !== "hidden",
      ).length;
      return {
        key: page.id,
        kind: "page",
        pageId: page.id,
        title: page.title?.trim() || (index === 0 ? "First page" : `Page ${index + 1}`),
        detail: `Page ${index + 1} · ${questions} question${questions === 1 ? "" : "s"}`,
      };
    });
    const submitIndex = nodes.length;
    nodes.push({ key: "submit", kind: "submit", title: "Submit", detail: "Answers are sent" });
    document.endings.forEach((ending, index) => {
      nodes.push({
        key: `ending:${ending.id}`,
        kind: "ending",
        title: ending.title || `Ending ${index + 1}`,
        detail: ending.when?.rules.length
          ? "By rule"
          : index === document.endings.findIndex((item) => !item.when?.rules.length)
            ? "Default ending"
            : "Ending",
      });
    });

    const edges: Edge[] = [];
    const routes: string[] = [];
    pages.forEach((page, index) => {
      edges.push({ from: index, to: index + 1, kind: "next", lane: 0 });
    });
    let lane = 0;
    pages.forEach((page, index) => {
      (page.closer?.jumps ?? []).forEach((jump, jumpIndex) => {
        let to: number;
        if (jump.to === "end") to = submitIndex;
        else if (jump.to.startsWith("ending:"))
          to = nodes.findIndex((node) => node.key === jump.to);
        else to = pages.findIndex((candidate) => candidate.id === jump.to);
        if (to < 0) return;
        const summary = describeGroup(document, jump.when) || "Always";
        edges.push({
          from: index,
          to,
          kind: "jump",
          label: `Jump ${jumpIndex + 1}`,
          title: summary,
          lane: lane++,
        });
        routes.push(
          `${nodes[index].title}, jump ${jumpIndex + 1}: ${summary}, go to ${nodes[to].title}.`,
        );
      });
      routes.push(`${nodes[index].title} then ${nodes[index + 1].title} by default.`);
    });
    document.endings.forEach((ending, index) => {
      edges.push({
        from: submitIndex,
        to: submitIndex + 1 + index,
        kind: "ending",
        title: describeGroup(document, ending.when) || "Default",
        lane: index,
      });
      routes.push(
        `Submit shows ${ending.title || `ending ${index + 1}`}: ${describeGroup(document, ending.when) || "when no other ending matches"}.`,
      );
    });
    return { nodes, edges, routes, jumpLanes: lane };
  }, [document]);

  const endLanes = document.endings.length;
  const nodeX = 16 + endLanes * END_LANE + 8;
  const width = nodeX + NODE_W + 24 + jumpLanes * JUMP_LANE + 56;
  const height = TOP * 2 + nodes.length * NODE_H + (nodes.length - 1) * ROW_GAP;
  const rowY = (index: number) => TOP + index * (NODE_H + ROW_GAP);
  const right = nodeX + NODE_W;

  const tone = {
    next: "stroke-brand-blue",
    jump: "stroke-brand-yellow",
    ending: "stroke-brand-green",
  } as const;

  return (
    <figure className="min-w-0">
      <svg
        aria-label={`Page flow: ${nodes.filter((node) => node.kind === "page").length} pages, ${jumpLanes} jumps, ${document.endings.length} endings.`}
        className="block h-auto w-full max-w-2xl"
        role="group"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          {(["next", "jump", "ending"] as const).map((kind) => (
            <marker
              id={`${markerId}-${kind}`}
              key={kind}
              markerHeight="7"
              markerWidth="7"
              orient="auto-start-reverse"
              refX="6"
              refY="3.5"
              viewBox="0 0 7 7"
            >
              <path
                className={
                  kind === "next"
                    ? "fill-brand-blue"
                    : kind === "jump"
                      ? "fill-brand-yellow"
                      : "fill-brand-green"
                }
                d="M0,0 L7,3.5 L0,7 Z"
              />
            </marker>
          ))}
        </defs>
        {edges.map((edge, index) => {
          const fromY = rowY(edge.from);
          const toY = rowY(edge.to);
          if (edge.kind === "next") {
            const x = nodeX + NODE_W / 2;
            return (
              <line
                className={`${tone.next} opacity-70`}
                key={`e${index}`}
                markerEnd={`url(#${markerId}-next)`}
                strokeWidth="2"
                x1={x}
                x2={x}
                y1={fromY + NODE_H}
                y2={toY - 2}
              />
            );
          }
          if (edge.kind === "jump") {
            const x = right + 18 + edge.lane * JUMP_LANE;
            const y1 = fromY + NODE_H / 2 + 6;
            const y2 = toY + NODE_H / 2 - 6;
            const r = 8;
            const d = `M${right},${y1} H${x - r} Q${x},${y1} ${x},${y1 + r} V${y2 - r} Q${x},${y2} ${x - r},${y2} H${right + 3}`;
            return (
              <g key={`e${index}`}>
                <title>{`${edge.label}: ${edge.title}`}</title>
                <path
                  className={tone.jump}
                  d={d}
                  fill="none"
                  markerEnd={`url(#${markerId}-jump)`}
                  strokeDasharray="5 4"
                  strokeWidth="2"
                />
                <text
                  className="fill-[#8a6412] font-mono text-[9px] font-bold dark:fill-brand-yellow"
                  x={x + 4}
                  y={(y1 + y2) / 2}
                >
                  {edge.label}
                </text>
              </g>
            );
          }
          const x = nodeX - 10 - edge.lane * END_LANE;
          const y1 = fromY + NODE_H / 2;
          const y2 = toY + NODE_H / 2;
          const r = 6;
          return (
            <g key={`e${index}`}>
              <title>{edge.title}</title>
              <path
                className={`${tone.ending} opacity-50`}
                d={`M${nodeX},${y1} H${x + r} Q${x},${y1} ${x},${y1 + r} V${y2 - r} Q${x},${y2} ${x + r},${y2} H${nodeX - 3}`}
                fill="none"
                markerEnd={`url(#${markerId}-ending)`}
                strokeWidth="1.5"
              />
            </g>
          );
        })}
        {nodes.map((node, index) => {
          const y = rowY(index);
          const interactive = node.kind === "page" && onSelectPage;
          const box =
            node.kind === "page"
              ? "fill-white stroke-brand-blue/50 dark:fill-[#1a1f2b]"
              : node.kind === "submit"
                ? "fill-[#171b25] stroke-[#171b25] dark:fill-white dark:stroke-white"
                : "fill-brand-green-50 stroke-brand-green/50 dark:fill-brand-green/15";
          const text =
            node.kind === "submit"
              ? "fill-white dark:fill-[#0e1116]"
              : "fill-[#171b25] dark:fill-white";
          const sub =
            node.kind === "submit"
              ? "fill-white/70 dark:fill-[#0e1116]/70"
              : "fill-[#69748a] dark:fill-white/50";
          const title = node.title.length > 34 ? `${node.title.slice(0, 34)}…` : node.title;
          return (
            <g
              aria-label={interactive ? `${node.title}, ${node.detail}` : undefined}
              className={
                interactive
                  ? "cursor-pointer outline-none [&:focus-visible>rect]:stroke-[3]"
                  : undefined
              }
              key={node.key}
              onClick={
                interactive
                  ? () => {
                      onSelectPage(node.pageId as string);
                    }
                  : undefined
              }
              onKeyDown={
                interactive
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectPage(node.pageId as string);
                      }
                    }
                  : undefined
              }
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
            >
              <rect
                className={box}
                height={NODE_H}
                rx="12"
                strokeWidth="1.5"
                width={NODE_W}
                x={nodeX}
                y={y}
              />
              <text className={`${text} text-[13px] font-semibold`} x={nodeX + 14} y={y + 22}>
                {title}
              </text>
              <text className={`${sub} text-[10px]`} x={nodeX + 14} y={y + 39}>
                {node.detail}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        <ul>
          {routes.map((route, index) => (
            <li key={index}>{route}</li>
          ))}
        </ul>
      </figcaption>
      <div
        aria-hidden="true"
        className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#69748a] dark:text-white/50"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-brand-blue" /> Next page
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-5 border-t-2 border-dashed border-brand-yellow" /> Jump by rule
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-brand-green" /> Ending
        </span>
      </div>
    </figure>
  );
}
