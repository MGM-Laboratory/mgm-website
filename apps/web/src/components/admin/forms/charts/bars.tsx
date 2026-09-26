"use client";

import { useState, type ReactNode } from "react";

import {
  ChartTooltip,
  Legend,
  TooltipRow,
  TooltipTitle,
  formatCount,
  formatNumber,
  formatPercent,
  niceTicks,
  growStyle,
  useReveal,
  useSize,
  useTooltip,
} from "./viz";

export type BarRow = {
  key: string;
  label: string;
  value: number;
  /** Shown after the value, e.g. "38%". */
  note?: string;
  color?: string;
  /** Leading visual (a swatch, a thumbnail, a country code). */
  lead?: ReactNode;
};

/**
 * Horizontal bars with the label above/left and the value at the tip: the
 * workhorse for choices, countries, referrers, browsers. HTML, so labels
 * wrap and truncate naturally at phone width. Each row is focusable and
 * carries its tooltip.
 */
export function BarList({
  rows,
  max: maxOverride,
  color = "var(--viz-1)",
  total,
  limit = 10,
  emptyLabel = "No answers yet.",
  valueFormat = formatCount,
  highlightKey,
}: {
  rows: BarRow[];
  max?: number;
  color?: string;
  /** When given, each row shows its share of it. */
  total?: number;
  limit?: number;
  emptyLabel?: string;
  valueFormat?: (value: number) => string;
  highlightKey?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = useReveal(rows.length);
  if (!rows.length)
    return <p className="py-3 text-xs text-[#9ba4b5] dark:text-white/35">{emptyLabel}</p>;
  const max = maxOverride ?? Math.max(1, ...rows.map((row) => row.value));
  const visible = expanded ? rows : rows.slice(0, limit);
  return (
    <div>
      <ul className="space-y-2">
        {visible.map((row, index) => {
          const share = total ? row.value / total : null;
          const width = Math.max(0, Math.min(1, row.value / max));
          const tip = `${row.label}: ${valueFormat(row.value)}${share !== null ? ` (${formatPercent(share)})` : ""}${row.note ? `, ${row.note}` : ""}`;
          return (
            <li
              aria-label={tip}
              className={`group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 ${highlightKey === row.key ? "bg-[#f6f8fc] dark:bg-white/[0.04]" : ""}`}
              key={row.key}
              tabIndex={0}
              title={tip}
            >
              <div className="flex items-baseline gap-2 text-xs">
                {row.lead}
                <span className="min-w-0 flex-1 truncate text-[#3b4150] dark:text-white/75">
                  {row.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[#171b25] dark:text-white">
                  {valueFormat(row.value)}
                </span>
                {share !== null ? (
                  <span className="w-11 shrink-0 text-right tabular-nums text-[#8a93a6] dark:text-white/40">
                    {formatPercent(share, 0)}
                  </span>
                ) : null}
                {row.note ? (
                  <span className="shrink-0 tabular-nums text-[#8a93a6] dark:text-white/40">
                    {row.note}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f0f2f6] dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-[filter] group-hover:brightness-110"
                  style={{
                    width: `${width * 100}%`,
                    background: row.color ?? color,
                    ...growStyle(shown, "x", Math.min(index, 8) * 30),
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > limit ? (
        <button
          className="mt-3 text-xs font-semibold text-brand-blue hover:underline"
          onClick={() => {
            setExpanded((value) => !value);
          }}
          type="button"
        >
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      ) : null}
    </div>
  );
}

export type ColumnDatum = {
  key: string;
  label: string;
  value: number;
  detail?: string;
  color?: string;
};

/**
 * Vertical columns on one baseline (histograms, hours of the day, rating
 * distributions). Columns are capped at 24px and keep a 2px gap.
 */
export function ColumnChart({
  data,
  height = 160,
  color = "var(--viz-1)",
  title,
  labelEvery: labelEveryOverride,
  valueFormat = formatCount,
  showValues,
}: {
  data: ColumnDatum[];
  height?: number;
  color?: string;
  title: string;
  labelEvery?: number;
  valueFormat?: (value: number) => string;
  /** Print the value on each column cap (only when there are few columns). */
  showValues?: boolean;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const { tooltip, show, hide } = useTooltip();
  const shown = useReveal(data.length);
  const padding = { top: showValues ? 16 : 8, right: 4, bottom: 22, left: 34 };
  const innerWidth = Math.max(10, width - padding.left - padding.right);
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.map((item) => item.value));
  const ticks = niceTicks(max, 3);
  const top = ticks[ticks.length - 1];
  const band = innerWidth / Math.max(1, data.length);
  const barWidth = Math.max(2, Math.min(24, band - 2));
  const y = (value: number) => padding.top + innerHeight - (value / top) * innerHeight;
  const [active, setActive] = useState<number | null>(null);
  const geometry = (index: number) => {
    const item = data[index];
    const cx = padding.left + band * index + band / 2;
    const barHeight = Math.max(item.value > 0 ? 2 : 0, (item.value / top) * innerHeight);
    return { cx, barHeight, y0: padding.top + innerHeight - barHeight };
  };
  const tipFor = (index: number) => {
    const item = data[index];
    if (!item) return;
    const { cx, y0 } = geometry(index);
    show({
      x: cx,
      y: y0,
      content: (
        <>
          <TooltipTitle>{item.label}</TooltipTitle>
          <TooltipRow
            color={item.color ?? color}
            label={item.detail ?? ""}
            value={valueFormat(item.value)}
          />
        </>
      ),
    });
  };
  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!data.length) return;
    let next = active ?? -1;
    if (event.key === "ArrowRight") next = Math.min(data.length - 1, next + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, (active ?? data.length) - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = data.length - 1;
    else if (event.key === "Escape") {
      setActive(null);
      hide();
      return;
    } else return;
    event.preventDefault();
    setActive(next);
    tipFor(next);
  };
  const labelEvery =
    labelEveryOverride ??
    Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerWidth / 34))));
  return (
    <div className="relative" ref={ref}>
      <svg
        aria-label={`${title}. Use the arrow keys to read each column.`}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
        height={height}
        onBlur={() => {
          setActive(null);
          hide();
        }}
        onKeyDown={onKeyDown}
        role="img"
        tabIndex={0}
        width={width}
      >
        <title>{title}</title>
        <desc>{data.map((item) => `${item.label}: ${valueFormat(item.value)}`).join("; ")}</desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              stroke="var(--viz-grid)"
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className="fill-[var(--viz-axis)] text-[10px] tabular-nums"
              dominantBaseline="middle"
              textAnchor="end"
              x={padding.left - 6}
              y={y(tick)}
            >
              {formatCount(tick)}
            </text>
          </g>
        ))}
        {data.map((item, index) => {
          const cx = padding.left + band * index + band / 2;
          const barHeight = Math.max(item.value > 0 ? 2 : 0, (item.value / top) * innerHeight);
          const radius = Math.min(4, barWidth / 2, barHeight);
          const x0 = cx - barWidth / 2;
          const y0 = padding.top + innerHeight - barHeight;
          const d =
            barHeight > 0
              ? `M${x0},${y0 + barHeight}V${y0 + radius}Q${x0},${y0} ${x0 + radius},${y0}H${x0 + barWidth - radius}Q${x0 + barWidth},${y0} ${x0 + barWidth},${y0 + radius}V${y0 + barHeight}Z`
              : "";
          const tip = () => {
            tipFor(index);
          };
          return (
            <g key={item.key}>
              {d ? (
                <path
                  d={d}
                  fill={item.color ?? color}
                  style={growStyle(shown, "y", Math.min(index, 20) * 12)}
                />
              ) : null}
              {showValues && item.value > 0 ? (
                <text
                  className="fill-[#5c6679] text-[10px] font-semibold tabular-nums dark:fill-white/60"
                  textAnchor="middle"
                  x={cx}
                  y={y0 - 4}
                >
                  {valueFormat(item.value)}
                </text>
              ) : null}
              {index % labelEvery === 0 ? (
                <text
                  className="fill-[var(--viz-axis)] text-[10px] tabular-nums"
                  textAnchor="middle"
                  x={cx}
                  y={height - 7}
                >
                  {item.label}
                </text>
              ) : null}
              <rect
                aria-label={`${item.label}: ${valueFormat(item.value)}`}
                className="outline-none"
                fill="transparent"
                height={innerHeight + padding.top}
                onPointerEnter={tip}
                onPointerLeave={hide}
                stroke={active === index ? "var(--viz-axis)" : "none"}
                strokeOpacity={0.5}
                width={band}
                x={padding.left + band * index}
                y={0}
              />
            </g>
          );
        })}
        <line
          stroke="var(--viz-axis)"
          strokeOpacity={0.5}
          x1={padding.left}
          x2={width - padding.right}
          y1={y(0)}
          y2={y(0)}
        />
      </svg>
      <ChartTooltip tooltip={tooltip} width={width} />
    </div>
  );
}

export type Segment = { key: string; label: string; value: number; color: string };

/** One 100% bar split into parts with a 2px gap, plus its legend (NPS, yes/no). */
export function SplitBar({
  segments,
  height = 14,
  showLegend = true,
  label,
}: {
  segments: Segment[];
  height?: number;
  showLegend?: boolean;
  label: string;
}) {
  const shown = useReveal(segments.map((segment) => segment.value).join(","));
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const summary = segments
    .map((segment) => `${segment.label} ${formatPercent(total ? segment.value / total : 0)}`)
    .join(", ");
  return (
    <div>
      <div
        aria-label={`${label}: ${summary}`}
        className="flex w-full gap-[2px] overflow-hidden rounded-[5px]"
        role="img"
        style={{ height }}
      >
        {total === 0 ? (
          <div className="h-full w-full rounded-[5px] bg-[#f0f2f6] dark:bg-white/[0.06]" />
        ) : (
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) => {
              const share = segment.value / total;
              return (
                <div
                  className="h-full transition-[flex-grow] duration-700 ease-out first:rounded-l-[5px] last:rounded-r-[5px]"
                  key={segment.key}
                  style={{
                    flexGrow: shown ? share : 1 / segments.length,
                    flexBasis: 0,
                    background: segment.color,
                  }}
                  title={`${segment.label}: ${formatCount(segment.value)} (${formatPercent(share)})`}
                />
              );
            })
        )}
      </div>
      {showLegend ? (
        <div className="mt-2">
          <Legend
            items={segments.map((segment) => ({
              label: segment.label,
              color: segment.color,
              value: `${formatCount(segment.value)} · ${formatPercent(total ? segment.value / total : 0, 0)}`,
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Rows of 100% stacked bars sharing one legend (matrix questions, crosstabs). */
export function StackedRows({
  rows,
  categories,
  label,
}: {
  rows: { key: string; label: string; values: number[] }[];
  categories: { key: string; label: string; color: string }[];
  label: string;
}) {
  return (
    <div>
      <div className="mb-3">
        <Legend
          items={categories.map((category) => ({ label: category.label, color: category.color }))}
        />
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const total = row.values.reduce((a, b) => a + b, 0);
          return (
            <div key={row.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-[#3b4150] dark:text-white/75">
                  {row.label}
                </span>
                <span className="shrink-0 tabular-nums text-[#8a93a6] dark:text-white/40">
                  n = {formatCount(total)}
                </span>
              </div>
              <SplitBar
                height={12}
                label={`${label}, ${row.label}`}
                segments={categories.map((category, index) => ({
                  ...category,
                  value: row.values[index] ?? 0,
                }))}
                showLegend={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Donut for part-to-whole with at most five parts (devices). Center shows the total. */
export function Donut({
  segments,
  size = 132,
  label,
  centerLabel = "total",
}: {
  segments: Segment[];
  size?: number;
  label: string;
  centerLabel?: string;
}) {
  const { tooltip, show, hide } = useTooltip();
  const shown = useReveal(segments.length);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const gap = total ? Math.min(3, circumference / segments.length / 4) : 0;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          aria-label={`${label}: ${segments.map((segment) => `${segment.label} ${formatCount(segment.value)}`).join(", ")}`}
          height={size}
          role="img"
          width={size}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="var(--viz-grid)"
            strokeWidth={14}
          />
          {total
            ? segments.map((segment) => {
                const length = (segment.value / total) * circumference;
                const dash = Math.max(0, length - gap);
                const element = (
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    fill="none"
                    key={segment.key}
                    onPointerEnter={() => {
                      show({
                        x: size / 2,
                        y: 10,
                        content: (
                          <TooltipRow
                            color={segment.color}
                            label={segment.label}
                            value={`${formatCount(segment.value)} · ${formatPercent(segment.value / total)}`}
                          />
                        ),
                      });
                    }}
                    onPointerLeave={hide}
                    r={radius}
                    stroke={segment.color}
                    strokeDasharray={`${shown ? dash : 0} ${circumference}`}
                    strokeDashoffset={-offset}
                    strokeWidth={14}
                    style={{
                      transition: shown
                        ? "stroke-dasharray 700ms cubic-bezier(.2,.8,.2,1)"
                        : "none",
                    }}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  />
                );
                offset += length;
                return element;
              })
            : null}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-[#171b25] dark:text-white">
            {formatCount(total)}
          </span>
          <span className="text-[10px] text-[#8a93a6] dark:text-white/40">{centerLabel}</span>
        </div>
        <ChartTooltip tooltip={tooltip} width={size} />
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {segments.map((segment) => (
          <li className="flex items-center gap-2" key={segment.key}>
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: segment.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[#3b4150] dark:text-white/75">
              {segment.label}
            </span>
            <span className="font-semibold tabular-nums">{formatCount(segment.value)}</span>
            <span className="w-10 text-right tabular-nums text-[#8a93a6] dark:text-white/40">
              {formatPercent(total ? segment.value / total : 0, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A single horizontal box plot (min whisker, Q1, median, Q3, max whisker, outliers). */
export function BoxPlot({
  q1,
  median,
  q3,
  whiskers,
  outliers,
  mean,
  domain,
  label,
  format = (value: number) => formatNumber(value),
}: {
  q1: number;
  median: number;
  q3: number;
  whiskers: [number, number];
  outliers: number[];
  mean?: number;
  domain?: [number, number];
  label: string;
  format?: (value: number) => string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const low = domain?.[0] ?? Math.min(whiskers[0], ...outliers);
  const high = domain?.[1] ?? Math.max(whiskers[1], ...outliers);
  const span = high - low || 1;
  const pad = 12;
  const x = (value: number) => pad + ((value - low) / span) * (width - pad * 2);
  const mid = 22;
  const summary = `min whisker ${format(whiskers[0])}, Q1 ${format(q1)}, median ${format(median)}, Q3 ${format(q3)}, max whisker ${format(whiskers[1])}, ${outliers.length} outlier${outliers.length === 1 ? "" : "s"}`;
  return (
    <div ref={ref}>
      <svg
        aria-label={`${label}: ${summary}`}
        className="block"
        height={56}
        role="img"
        width={width}
      >
        <title>{label}</title>
        <desc>{summary}</desc>
        <line stroke="var(--viz-axis)" x1={x(whiskers[0])} x2={x(q1)} y1={mid} y2={mid} />
        <line stroke="var(--viz-axis)" x1={x(q3)} x2={x(whiskers[1])} y1={mid} y2={mid} />
        <line
          stroke="var(--viz-axis)"
          x1={x(whiskers[0])}
          x2={x(whiskers[0])}
          y1={mid - 6}
          y2={mid + 6}
        />
        <line
          stroke="var(--viz-axis)"
          x1={x(whiskers[1])}
          x2={x(whiskers[1])}
          y1={mid - 6}
          y2={mid + 6}
        />
        <rect
          fill="var(--viz-1-soft)"
          height={20}
          rx={4}
          stroke="var(--viz-1)"
          strokeWidth={1.5}
          width={Math.max(1, x(q3) - x(q1))}
          x={x(q1)}
          y={mid - 10}
        />
        <line
          stroke="var(--viz-1)"
          strokeWidth={2.5}
          x1={x(median)}
          x2={x(median)}
          y1={mid - 10}
          y2={mid + 10}
        />
        {mean !== undefined && Number.isFinite(mean) ? (
          <path
            d={`M${x(mean)},${mid - 4}l4,4l-4,4l-4,-4z`}
            fill="var(--viz-2)"
            stroke="var(--viz-surface)"
            strokeWidth={1.5}
          >
            <title>Mean {format(mean)}</title>
          </path>
        ) : null}
        {outliers.slice(0, 200).map((value, index) => (
          <circle
            cx={x(value)}
            cy={mid}
            fill="none"
            key={`${value}-${index}`}
            r={3}
            stroke="var(--viz-2)"
            strokeWidth={1.5}
          >
            <title>Outlier {format(value)}</title>
          </circle>
        ))}
        {[whiskers[0], q1, median, q3, whiskers[1]].map((value, index) => (
          <text
            className="fill-[var(--viz-axis)] text-[10px] tabular-nums"
            key={index}
            textAnchor="middle"
            x={x(value)}
            y={index % 2 ? 52 : 52}
            opacity={index === 1 || index === 3 ? (x(q3) - x(q1) > 60 ? 1 : 0) : 1}
          >
            {format(value)}
          </text>
        ))}
      </svg>
    </div>
  );
}
