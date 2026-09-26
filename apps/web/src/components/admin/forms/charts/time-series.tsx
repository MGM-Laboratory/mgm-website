"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import {
  ChartTooltip,
  Legend,
  TooltipRow,
  TooltipTitle,
  formatCount,
  niceTicks,
  useReveal,
  useSize,
  useTooltip,
} from "./viz";

export type TimeSeries = { key: string; label: string; color: string; values: number[] };

/**
 * Lines (or soft areas) over time buckets, one shared y axis, with a
 * crosshair that snaps to the nearest bucket and one tooltip listing every
 * series. Arrow keys move the crosshair when the chart has focus.
 */
export function TimeSeriesChart({
  buckets,
  series,
  mode = "line",
  height = 220,
  formatBucket,
  title,
}: {
  /** ISO starts of each bucket. */
  buckets: string[];
  series: TimeSeries[];
  mode?: "line" | "area";
  height?: number;
  formatBucket: (iso: string, short: boolean) => string;
  title: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const { tooltip, show, hide } = useTooltip();
  const [active, setActive] = useState<number | null>(null);
  const shown = useReveal(`${buckets.length}:${mode}`);
  const clipId = useId().replace(/:/g, "");
  const padding = { top: 12, right: 12, bottom: 26, left: 40 };
  const innerWidth = Math.max(10, width - padding.left - padding.right);
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...series.flatMap((item) => item.values));
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1];
  const n = buckets.length;
  const x = (index: number) =>
    padding.left + (n <= 1 ? innerWidth / 2 : (index / (n - 1)) * innerWidth);
  const y = (value: number) => padding.top + innerHeight - (value / top) * innerHeight;

  const paths = useMemo(
    () =>
      series.map((item) => {
        const line = item.values
          .map(
            (value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`,
          )
          .join("");
        const area = `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
        return { ...item, line, area };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, width, height, top, n],
  );

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerWidth / 70))));

  const focusIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(n - 1, index));
    setActive(clamped);
    show({
      x: x(clamped),
      y: padding.top + 8,
      content: (
        <>
          <TooltipTitle>{formatBucket(buckets[clamped], false)}</TooltipTitle>
          {series.map((item) => (
            <TooltipRow
              color={item.color}
              key={item.key}
              label={item.label}
              value={formatCount(item.values[clamped])}
            />
          ))}
        </>
      ),
    });
  };

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    focusIndex(Math.round(ratio * (n - 1)));
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusIndex(
        (active ?? (event.key === "ArrowRight" ? -1 : n)) + (event.key === "ArrowRight" ? 1 : -1),
      );
    } else if (event.key === "Home") focusIndex(0);
    else if (event.key === "End") focusIndex(n - 1);
    else if (event.key === "Escape") {
      setActive(null);
      hide();
    }
  };

  const totals = series.map((item) => item.values.reduce((a, b) => a + b, 0));
  const description = series
    .map((item, index) => `${item.label}: ${formatCount(totals[index])} in total`)
    .join("; ");

  return (
    <div>
      {series.length > 1 ? (
        <div className="mb-2">
          <Legend
            items={series.map((item, index) => ({
              label: item.label,
              color: item.color,
              value: formatCount(totals[index]),
            }))}
            shape={mode === "line" ? "line" : "rect"}
          />
        </div>
      ) : null}
      <div className="relative" ref={ref}>
        <svg
          aria-describedby={`${clipId}-desc`}
          aria-label={`${title}. Use the arrow keys to read each point.`}
          className="block overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 rounded-lg"
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
          <desc id={`${clipId}-desc`}>{description}</desc>
          <defs>
            <clipPath id={clipId}>
              <rect
                height={height}
                style={{ transition: shown ? "width 700ms cubic-bezier(.2,.8,.2,1)" : "none" }}
                width={shown ? width : 0}
                x={0}
                y={0}
              />
            </clipPath>
          </defs>
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
                x={padding.left - 8}
                y={y(tick)}
              >
                {formatCount(tick)}
              </text>
            </g>
          ))}
          {buckets.map((bucket, index) =>
            index % labelEvery === 0 ? (
              <text
                className="fill-[var(--viz-axis)] text-[10px] tabular-nums"
                key={bucket}
                textAnchor="middle"
                x={x(index)}
                y={height - 8}
              >
                {formatBucket(bucket, true)}
              </text>
            ) : null,
          )}
          <g clipPath={`url(#${clipId})`}>
            {mode === "area"
              ? paths.map((item) => (
                  <path
                    d={item.area}
                    fill={item.color}
                    fillOpacity={0.1}
                    key={`${item.key}-area`}
                  />
                ))
              : null}
            {paths.map((item) => (
              <path
                d={item.line}
                fill="none"
                key={item.key}
                stroke={item.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            ))}
          </g>
          {active !== null ? (
            <g>
              <line
                stroke="var(--viz-axis)"
                strokeOpacity={0.6}
                x1={x(active)}
                x2={x(active)}
                y1={padding.top}
                y2={padding.top + innerHeight}
              />
              {series.map((item) => (
                <circle
                  cx={x(active)}
                  cy={y(item.values[active])}
                  fill={item.color}
                  key={item.key}
                  r={4}
                  stroke="var(--viz-surface)"
                  strokeWidth={2}
                />
              ))}
            </g>
          ) : null}
          <rect
            fill="transparent"
            height={innerHeight + padding.top}
            onPointerLeave={() => {
              setActive(null);
              hide();
            }}
            onPointerMove={onPointerMove}
            width={innerWidth + 16}
            x={padding.left - 8}
            y={0}
          />
        </svg>
        <ChartTooltip tooltip={tooltip} width={width} />
      </div>
    </div>
  );
}

/** A 12-ish point trend line for a KPI tile; the last point is accented. */
export function Sparkline({
  values,
  color = "var(--viz-1)",
  height = 28,
  label,
}: {
  values: number[];
  color?: string;
  height?: number;
  label: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>(120);
  if (values.length < 2) return <div className="h-7" ref={ref} />;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const x = (index: number) => 2 + (index / (values.length - 1)) * (width - 6);
  const y = (value: number) => 3 + (1 - (value - min) / (max - min || 1)) * (height - 6);
  const d = values
    .map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`)
    .join("");
  const last = values.length - 1;
  return (
    <div ref={ref}>
      <svg aria-label={label} className="block" height={height} role="img" width={width}>
        <path d={`${d}L${x(last)},${height}L${x(0)},${height}Z`} fill={color} fillOpacity={0.08} />
        <path
          d={d}
          fill="none"
          stroke="var(--viz-other)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
        <path
          d={`M${x(last - 1).toFixed(1)},${y(values[last - 1]).toFixed(1)}L${x(last).toFixed(1)},${y(values[last]).toFixed(1)}`}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth={2}
        />
        <circle cx={x(last)} cy={y(values[last])} fill={color} r={2.5} />
      </svg>
    </div>
  );
}
