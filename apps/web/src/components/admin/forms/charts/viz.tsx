"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useMotionPreference } from "@/lib/reduced-motion";

/**
 * Chart primitives shared by the forms responses and analytics panels: the
 * palette (as CSS variables, stepped separately for dark mode), a
 * ResizeObserver size hook, the reveal animation gate, number formatting,
 * the tooltip and the chart card with its table view.
 *
 * Categorical slots follow the brand order blue, red, yellow, green; the
 * yellow is stepped darker than the brand swatch so marks stay inside the
 * readable lightness band (validated for colour-vision deficiency, light
 * and dark). A fifth series never gets a new hue: it folds into "Other".
 */
export const VIZ_ROOT =
  "[--viz-1:#3a6dc5] [--viz-2:#f94141] [--viz-3:#e0a82a] [--viz-4:#0f8657] [--viz-other:#aab2c0] [--viz-1-soft:#ecf1fa] [--viz-2-soft:#fee5e5] [--viz-3-soft:#fef6e0] [--viz-4-soft:#e2f1ea] [--viz-grid:#edf0f5] [--viz-axis:#8a93a6] [--viz-surface:#ffffff] [--viz-land:#dfe4ec] [--viz-good:#0f8657] [--viz-warn:#e0a82a] [--viz-bad:#f94141] [--viz-neutral:#aab2c0] dark:[--viz-1:#5b8ae0] dark:[--viz-2:#cc3333] dark:[--viz-3:#d9a21e] dark:[--viz-4:#1a9a68] dark:[--viz-other:#5d6574] dark:[--viz-1-soft:#1d2a44] dark:[--viz-2-soft:#3a1f22] dark:[--viz-3-soft:#3a3120] dark:[--viz-4-soft:#15322a] dark:[--viz-grid:#232833] dark:[--viz-axis:#7c8596] dark:[--viz-surface:#14171d] dark:[--viz-land:#2a303c] dark:[--viz-good:#1a9a68] dark:[--viz-warn:#d9a21e] dark:[--viz-bad:#cc3333] dark:[--viz-neutral:#5d6574]";

export const SERIES = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"] as const;
export const SERIES_SOFT = [
  "var(--viz-1-soft)",
  "var(--viz-2-soft)",
  "var(--viz-3-soft)",
  "var(--viz-4-soft)",
] as const;
export const OTHER_COLOR = "var(--viz-other)";

/** The colour of the n-th category; past four everything is "Other" grey. */
export function seriesColor(index: number) {
  return index < SERIES.length ? SERIES[index] : OTHER_COLOR;
}

export const labelClass =
  "text-[11px] font-bold uppercase tracking-[0.14em] text-[#7e899d] dark:text-white/35";
export const cardClass =
  "rounded-2xl border border-[#e4e8f0] bg-white dark:border-white/10 dark:bg-white/[0.02]";
export const mutedText = "text-[#778299] dark:text-white/45";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return Math.abs(value) >= 10_000 ? compact.format(value) : whole.format(value);
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  const rounded = Number(value.toFixed(digits));
  return rounded.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return `${(value * 100).toFixed(value === 0 || value === 1 ? 0 : digits)}%`;
}

export function formatMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "–";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Clean axis ticks from 0 (or `min`) to at least `max`. */
export function niceTicks(max: number, count = 4, min = 0): number[] {
  const span = Math.max(1e-9, max - min);
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const step =
    (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) *
    power;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.5 && ticks.length < 12; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  if (ticks[ticks.length - 1] < max)
    ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)));
  return ticks;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The element's content width (and height), kept current with a ResizeObserver. */
export function useSize<T extends HTMLElement>(initialWidth = 600) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: initialWidth, height: 0 });
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize((current) =>
        Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * False on the first paint and true right after, so marks can transition in
 * from their baseline. True at once when reduced motion is on.
 */
export function useReveal(key: unknown = null) {
  const motion = useMotionPreference();
  const [revealed, setRevealed] = useState<unknown>(Symbol.for("unrevealed"));
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(key)));
    return () => cancelAnimationFrame(frame);
  }, [key]);
  return !motion || revealed === key;
}

/** Inline style that grows an SVG mark from its baseline (horizontal or vertical). */
export function growStyle(shown: boolean, axis: "x" | "y", delay = 0): CSSProperties {
  return {
    transformBox: "fill-box",
    transformOrigin: axis === "x" ? "left center" : "center bottom",
    transform: shown ? "none" : axis === "x" ? "scaleX(0)" : "scaleY(0)",
    transition: shown ? `transform 520ms cubic-bezier(.2,.8,.2,1) ${delay}ms` : "none",
  };
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export type TooltipState = { x: number; y: number; content: ReactNode } | null;

export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  return { tooltip, show: setTooltip, hide: () => setTooltip(null) };
}

/** A tooltip positioned inside a `relative` chart box, kept within its width. */
export function ChartTooltip({ tooltip, width }: { tooltip: TooltipState; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 160, h: 40 });
  useIsomorphicLayoutEffect(() => {
    if (!ref.current || !tooltip) return;
    const rect = ref.current.getBoundingClientRect();
    if (Math.abs(rect.width - box.w) > 1 || Math.abs(rect.height - box.h) > 1)
      setBox({ w: rect.width, h: rect.height });
  });
  if (!tooltip) return null;
  const left = Math.max(0, Math.min(width - box.w, tooltip.x - box.w / 2));
  const top = tooltip.y - box.h - 10 < 0 ? tooltip.y + 14 : tooltip.y - box.h - 10;
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[260px] rounded-xl border border-[#e4e8f0] bg-white px-3 py-2 text-xs shadow-[0_12px_32px_-12px_rgba(14,17,22,0.25)] dark:border-white/10 dark:bg-[#1c212a]"
      ref={ref}
      role="status"
      style={{ left, top }}
    >
      {tooltip.content}
    </div>
  );
}

/** One row of a tooltip: a short line key, the value first, then the label. */
export function TooltipRow({
  color,
  value,
  label,
}: {
  color?: string;
  value: ReactNode;
  label: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color ? (
        <span
          aria-hidden
          className="h-0.5 w-3 shrink-0 rounded-full"
          style={{ background: color }}
        />
      ) : null}
      <span className="font-semibold tabular-nums text-[#171b25] dark:text-white">{value}</span>
      <span className="min-w-0 truncate text-[#778299] dark:text-white/50">{label}</span>
    </div>
  );
}

export function TooltipTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1 font-semibold text-[#3b4150] dark:text-white/80">{children}</div>;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export function Legend({
  items,
  shape = "rect",
}: {
  items: { label: string; color: string; value?: ReactNode }[];
  shape?: "rect" | "line" | "dot";
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5c6679] dark:text-white/55">
      {items.map((item) => (
        <li className="inline-flex items-center gap-1.5" key={item.label}>
          <span
            aria-hidden
            className={
              shape === "line"
                ? "h-0.5 w-3.5 rounded-full"
                : shape === "dot"
                  ? "size-2 rounded-full"
                  : "size-2.5 rounded-[3px]"
            }
            style={{ background: item.color }}
          />
          {item.label}
          {item.value !== undefined ? (
            <span className="font-semibold tabular-nums text-[#3b4150] dark:text-white/80">
              {item.value}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Chart card with a table view
// ---------------------------------------------------------------------------

export type ChartTable = {
  columns: string[];
  rows: (string | number)[][];
};

export function ChartCard({
  title,
  subtitle,
  actions,
  table,
  children,
  className = "",
  footer,
  testId,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** The same numbers as a table (the accessible twin of the chart). */
  table?: ChartTable;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  testId?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section
      className={`${cardClass} flex min-w-0 flex-col p-4 sm:p-5 ${className}`}
      data-testid={testId}
    >
      <header className="mb-3 flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-[#171b25] dark:text-white">{title}</h3>
          {subtitle ? <p className={`mt-0.5 text-xs ${mutedText}`}>{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 print:hidden">
          {actions}
          {table ? (
            <button
              aria-pressed={asTable}
              className="h-7 rounded-lg border border-[#e4e8f0] px-2 text-[11px] font-semibold text-[#5c6679] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/55"
              onClick={() => setAsTable((value) => !value)}
              type="button"
            >
              {asTable ? "Chart" : "Table"}
            </button>
          ) : null}
        </div>
      </header>
      <div className="min-w-0 flex-1">
        {asTable && table ? <DataTable table={table} /> : children}
      </div>
      {footer ? (
        <div className="mt-3 border-t border-[#eef0f4] pt-3 dark:border-white/5">{footer}</div>
      ) : null}
    </section>
  );
}

export function DataTable({ table, maxHeight = 320 }: { table: ChartTable; maxHeight?: number }) {
  return (
    <div
      className="overflow-auto rounded-xl border border-[#eef0f4] dark:border-white/10"
      style={{ maxHeight }}
    >
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-[#fbfbfa] dark:bg-[#171b22]">
          <tr>
            {table.columns.map((column, index) => (
              <th
                className={`px-3 py-2 font-semibold text-[#7e899d] dark:text-white/45 ${index ? "text-right" : "text-left"}`}
                key={column}
                scope="col"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr className="border-t border-[#eef0f4] dark:border-white/5" key={rowIndex}>
              {row.map((cell, index) => (
                <td
                  className={`px-3 py-1.5 ${index ? "text-right tabular-nums" : "text-left"} text-[#3b4150] dark:text-white/75`}
                  key={index}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyChart({
  children = "No data yet.",
  height = 120,
}: {
  children?: ReactNode;
  height?: number;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-[#e4e8f0] px-4 text-center text-xs text-[#9ba4b5] dark:border-white/10 dark:text-white/35"
      style={{ minHeight: height }}
    >
      {children}
    </div>
  );
}
