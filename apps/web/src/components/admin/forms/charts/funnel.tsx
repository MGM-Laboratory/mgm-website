"use client";

import { WarningCircle } from "@phosphor-icons/react";

import { formatCount, formatPercent, growStyle, useReveal } from "./viz";

export type FunnelStep = {
  key: string;
  label: string;
  sessions: number;
  kind?: "view" | "start" | "question" | "submit";
};

/**
 * Views → starts → each question → submissions, each bar relative to the
 * first step, with the drop from the previous step. The biggest drop is
 * marked with an icon and a label, not colour alone.
 */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const shown = useReveal(steps.length);
  if (!steps.length) return null;
  const first = Math.max(1, steps[0].sessions);
  let biggest = -1;
  let biggestDrop = 0;
  steps.forEach((step, index) => {
    if (!index) return;
    const previous = steps[index - 1].sessions;
    const drop = previous > 0 ? (previous - step.sessions) / previous : 0;
    if (drop > biggestDrop) {
      biggestDrop = drop;
      biggest = index;
    }
  });
  return (
    <ol className={`gap-x-8 ${steps.length > 10 ? "lg:columns-2" : ""}`}>
      {steps.map((step, index) => {
        const previous = index ? steps[index - 1].sessions : step.sessions;
        const drop = index && previous > 0 ? (previous - step.sessions) / previous : 0;
        const isBiggest = index === biggest && biggestDrop > 0.05;
        const color =
          step.kind === "submit"
            ? "var(--viz-4)"
            : step.kind === "view"
              ? "var(--viz-other)"
              : "var(--viz-1)";
        return (
          <li
            className={`mb-2 break-inside-avoid rounded-lg px-2 py-1.5 ${isBiggest ? "bg-brand-red-50/60 dark:bg-brand-red/10" : ""}`}
            key={step.key}
          >
            <div className="flex items-baseline gap-2 text-xs">
              <span className="w-5 shrink-0 tabular-nums text-[#9ba4b5] dark:text-white/30">
                {index + 1}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[#3b4150] dark:text-white/75"
                title={step.label}
              >
                {step.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatCount(step.sessions)}
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums text-[#8a93a6] dark:text-white/40">
                {formatPercent(step.sessions / first, 0)}
              </span>
              <span
                className={`inline-flex w-20 shrink-0 items-center justify-end gap-1 tabular-nums ${isBiggest ? "font-semibold text-brand-red" : "text-[#8a93a6] dark:text-white/40"}`}
              >
                {isBiggest ? <WarningCircle aria-hidden size={13} weight="bold" /> : null}
                {index ? `−${formatPercent(drop, 0)}` : ""}
              </span>
            </div>
            <div className="mt-1 ml-7 h-2 overflow-hidden rounded-full bg-[#f0f2f6] dark:bg-white/[0.06]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(step.sessions / first) * 100}%`,
                  background: color,
                  ...growStyle(shown, "x", index * 25),
                }}
              />
            </div>
            {isBiggest ? (
              <p className="mt-1 ml-7 text-[11px] font-semibold text-brand-red">Biggest drop-off</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
