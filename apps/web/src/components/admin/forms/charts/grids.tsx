"use client";

import { useMemo, type ReactNode } from "react";

import {
  ChartTooltip,
  Legend,
  TooltipRow,
  TooltipTitle,
  formatCount,
  formatNumber,
  niceTicks,
  useSize,
  useTooltip,
} from "./viz";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Monday first, the way the admins read a week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** A sequential single-hue ramp (blue) for magnitude, from the surface to full. */
function rampColor(share: number) {
  if (share <= 0) return "var(--viz-grid)";
  const alpha = 0.14 + share * 0.86;
  return `color-mix(in oklab, var(--viz-1) ${Math.round(alpha * 100)}%, var(--viz-surface))`;
}

/** Weekday by hour cells, one hue light to dark, with a small scale legend. */
export function WeekHourHeatmap({
  cells,
  title,
}: {
  cells: { weekday: number; hour: number; count: number }[];
  title: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const { tooltip, show, hide } = useTooltip();
  const grid = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of cells)
      map.set(
        `${cell.weekday}:${cell.hour}`,
        (map.get(`${cell.weekday}:${cell.hour}`) ?? 0) + cell.count,
      );
    return map;
  }, [cells]);
  const max = Math.max(1, ...grid.values());
  const left = 34;
  const cell = Math.max(8, Math.min(26, (width - left) / 24));
  const gap = 2;
  const height = 7 * cell + 18;
  const busiest = [...grid.entries()].sort((a, b) => b[1] - a[1])[0];
  return (
    <div>
      <div className="relative" ref={ref}>
        <svg aria-label={title} className="block" height={height} role="img" width={width}>
          <title>{title}</title>
          <desc>
            {busiest
              ? `Busiest: ${WEEKDAYS[Number(busiest[0].split(":")[0])]} at ${busiest[0].split(":")[1]}:00 with ${busiest[1]} views.`
              : "No views yet."}
          </desc>
          {WEEK_ORDER.map((weekday, row) => (
            <g key={weekday}>
              <text
                className="fill-[var(--viz-axis)] text-[10px]"
                dominantBaseline="middle"
                x={0}
                y={row * cell + cell / 2}
              >
                {WEEKDAYS[weekday]}
              </text>
              {Array.from({ length: 24 }, (_, hour) => {
                const count = grid.get(`${weekday}:${hour}`) ?? 0;
                const x = left + hour * cell;
                const y = row * cell;
                const tip = () =>
                  show({
                    x: x + cell / 2,
                    y,
                    content: (
                      <>
                        <TooltipTitle>
                          {WEEKDAYS[weekday]} {String(hour).padStart(2, "0")}:00–
                          {String(hour).padStart(2, "0")}:59
                        </TooltipTitle>
                        <TooltipRow label="views" value={formatCount(count)} />
                      </>
                    ),
                  });
                return (
                  <rect
                    fill={rampColor(count / max)}
                    height={cell - gap}
                    key={hour}
                    onPointerEnter={tip}
                    onPointerLeave={hide}
                    rx={3}
                    width={cell - gap}
                    x={x}
                    y={y}
                  />
                );
              })}
            </g>
          ))}
          {[0, 6, 12, 18, 23].map((hour) => (
            <text
              className="fill-[var(--viz-axis)] text-[10px] tabular-nums"
              key={hour}
              textAnchor="middle"
              x={left + hour * cell + cell / 2}
              y={height - 3}
            >
              {String(hour).padStart(2, "0")}
            </text>
          ))}
        </svg>
        <ChartTooltip tooltip={tooltip} width={width} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-[#8a93a6] dark:text-white/40">
        <span>Fewer</span>
        {[0.05, 0.25, 0.5, 0.75, 1].map((share) => (
          <span
            aria-hidden
            className="size-3 rounded-[3px]"
            key={share}
            style={{ background: rampColor(share) }}
          />
        ))}
        <span>More (max {formatCount(max)})</span>
      </div>
    </div>
  );
}

/** Diverging colour for a correlation: red for negative, blue for positive, grey at zero. */
export function divergingColor(value: number) {
  if (!Number.isFinite(value)) return "var(--viz-grid)";
  const strength = Math.min(1, Math.abs(value));
  const hue = value >= 0 ? "var(--viz-1)" : "var(--viz-2)";
  return `color-mix(in oklab, ${hue} ${Math.round(strength * 88)}%, var(--viz-neutral) ${Math.round((1 - strength) * 30)}%, var(--viz-surface))`;
}

/** A matrix of coefficients (-1..1) with values printed; clicking a cell calls `onPick`. */
export function CorrelationGrid({
  labels,
  values,
  onPick,
  selected,
  title,
}: {
  labels: string[];
  values: number[][];
  onPick?: (row: number, column: number) => void;
  selected?: [number, number] | null;
  title: string;
}) {
  const size = labels.length;
  return (
    <div className="overflow-x-auto">
      <table aria-label={title} className="border-separate border-spacing-[2px] text-[11px]">
        <thead>
          <tr>
            <th />
            {labels.map((label) => (
              <th
                className="max-w-24 truncate px-1 pb-1 text-left font-semibold text-[#7e899d] dark:text-white/45"
                key={label}
                scope="col"
                title={label}
              >
                <span className="block max-w-24 truncate">{label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {values.map((row, rowIndex) => (
            <tr key={labels[rowIndex]}>
              <th
                className="max-w-40 pr-2 text-left font-semibold text-[#7e899d] dark:text-white/45"
                scope="row"
                title={labels[rowIndex]}
              >
                <span className="block max-w-40 truncate">{labels[rowIndex]}</span>
              </th>
              {row.slice(0, size).map((value, columnIndex) => {
                const strong = Math.abs(value) > 0.55;
                const isSelected =
                  selected && selected[0] === rowIndex && selected[1] === columnIndex;
                return (
                  <td className="p-0" key={columnIndex}>
                    <button
                      aria-label={`${labels[rowIndex]} and ${labels[columnIndex]}: ${formatNumber(value)}`}
                      className={`flex h-9 w-14 items-center justify-center rounded-md font-semibold tabular-nums outline-none transition hover:ring-2 hover:ring-[#171b25]/30 focus-visible:ring-2 focus-visible:ring-brand-blue dark:hover:ring-white/40 ${strong ? "text-white" : "text-[#171b25] dark:text-white/85"} ${isSelected ? "ring-2 ring-[#171b25] dark:ring-white" : ""}`}
                      disabled={!onPick || rowIndex === columnIndex}
                      onClick={() => onPick?.(rowIndex, columnIndex)}
                      style={{ background: divergingColor(value) }}
                      type="button"
                    >
                      {Number.isFinite(value) ? value.toFixed(2) : "–"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-[#8a93a6] dark:text-white/40">
        <span>-1</span>
        {[-1, -0.5, 0, 0.5, 1].map((value) => (
          <span
            aria-hidden
            className="h-3 w-5 rounded-[3px]"
            key={value}
            style={{ background: divergingColor(value) }}
          />
        ))}
        <span>+1</span>
      </div>
    </div>
  );
}

export type ScatterPoint = { x: number; y: number; group?: string; id?: string; label?: ReactNode };

/**
 * Two numeric axes, optional colour by group (at most four hues, the rest
 * grey), a least-squares line, and nearest-point hover so the pointer only
 * has to be close.
 */
export function ScatterPlot({
  points,
  xLabel,
  yLabel,
  groups,
  line,
  height = 280,
  title,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  groups?: { key: string; label: string; color: string }[];
  line?: { slope: number; intercept: number } | null;
  height?: number;
  title: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const { tooltip, show, hide } = useTooltip();
  const padding = { top: 12, right: 14, bottom: 34, left: 46 };
  const innerWidth = Math.max(10, width - padding.left - padding.right);
  const innerHeight = height - padding.top - padding.bottom;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xTicks = niceTicks(xMax, 4, xMin);
  const yTicks = niceTicks(yMax, 4, yMin);
  const x0 = xTicks[0];
  const x1 = xTicks[xTicks.length - 1];
  const y0 = yTicks[0];
  const y1 = yTicks[yTicks.length - 1];
  const sx = (value: number) => padding.left + ((value - x0) / (x1 - x0 || 1)) * innerWidth;
  const sy = (value: number) =>
    padding.top + innerHeight - ((value - y0) / (y1 - y0 || 1)) * innerHeight;
  const colorOf = new Map(groups?.map((group) => [group.key, group.color]));
  // Identical points pile up on rating scales; a little deterministic jitter reveals them.
  const jitter = (index: number, axis: number) =>
    (((index * 9301 + axis * 49297) % 233280) / 233280 - 0.5) * 4;
  const drawn = points.slice(0, 5000);
  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left + padding.left;
    const py = event.clientY - rect.top + padding.top;
    let best = -1;
    let bestDistance = 24 * 24;
    drawn.forEach((point, index) => {
      const dx = sx(point.x) - px;
      const dy = sy(point.y) - py;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best < 0) return hide();
    const point = drawn[best];
    show({
      x: sx(point.x),
      y: sy(point.y),
      content: (
        <>
          {point.label ? <TooltipTitle>{point.label}</TooltipTitle> : null}
          <TooltipRow label={xLabel} value={formatNumber(point.x)} />
          <TooltipRow label={yLabel} value={formatNumber(point.y)} />
          {point.group ? (
            <TooltipRow
              color={colorOf.get(point.group)}
              label="group"
              value={groups?.find((group) => group.key === point.group)?.label ?? point.group}
            />
          ) : null}
        </>
      ),
    });
  };
  return (
    <div>
      {groups && groups.length > 1 ? (
        <div className="mb-2">
          <Legend items={groups} shape="dot" />
        </div>
      ) : null}
      <div className="relative" ref={ref}>
        <svg aria-label={title} className="block" height={height} role="img" width={width}>
          <title>{title}</title>
          <desc>{`${points.length} points, ${xLabel} against ${yLabel}.`}</desc>
          {yTicks.map((tick) => (
            <g key={`y${tick}`}>
              <line
                stroke="var(--viz-grid)"
                x1={padding.left}
                x2={width - padding.right}
                y1={sy(tick)}
                y2={sy(tick)}
              />
              <text
                className="fill-[var(--viz-axis)] text-[10px] tabular-nums"
                dominantBaseline="middle"
                textAnchor="end"
                x={padding.left - 6}
                y={sy(tick)}
              >
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text
              className="fill-[var(--viz-axis)] text-[10px] tabular-nums"
              key={`x${tick}`}
              textAnchor="middle"
              x={sx(tick)}
              y={padding.top + innerHeight + 14}
            >
              {formatNumber(tick)}
            </text>
          ))}
          <text
            className="fill-[#5c6679] text-[10px] font-semibold dark:fill-white/55"
            textAnchor="middle"
            x={padding.left + innerWidth / 2}
            y={height - 3}
          >
            {xLabel}
          </text>
          <text
            className="fill-[#5c6679] text-[10px] font-semibold dark:fill-white/55"
            textAnchor="middle"
            transform={`translate(10 ${padding.top + innerHeight / 2}) rotate(-90)`}
          >
            {yLabel}
          </text>
          {drawn.map((point, index) => (
            <circle
              cx={sx(point.x) + jitter(index, 1)}
              cy={sy(point.y) + jitter(index, 2)}
              fill={(point.group && colorOf.get(point.group)) || "var(--viz-1)"}
              fillOpacity={0.7}
              key={point.id ?? index}
              r={4}
              stroke="var(--viz-surface)"
              strokeWidth={1}
            />
          ))}
          {line && Number.isFinite(line.slope) ? (
            <line
              stroke="var(--viz-2)"
              strokeLinecap="round"
              strokeWidth={2}
              x1={sx(x0)}
              x2={sx(x1)}
              y1={Math.max(
                padding.top,
                Math.min(padding.top + innerHeight, sy(line.intercept + line.slope * x0)),
              )}
              y2={Math.max(
                padding.top,
                Math.min(padding.top + innerHeight, sy(line.intercept + line.slope * x1)),
              )}
            />
          ) : null}
          <rect
            fill="transparent"
            height={innerHeight}
            onPointerLeave={hide}
            onPointerMove={onMove}
            width={innerWidth}
            x={padding.left}
            y={padding.top}
          />
        </svg>
        <ChartTooltip tooltip={tooltip} width={width} />
      </div>
    </div>
  );
}

/** Means with their confidence intervals, one row per group. */
export function MeanCiChart({
  groups,
  title,
}: {
  groups: { label: string; n: number; mean: number; ci: [number, number] }[];
  title: string;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const finiteValues = groups.flatMap((group) => [group.mean, ...group.ci]).filter(Number.isFinite);
  const low = Math.min(...finiteValues);
  const high = Math.max(...finiteValues);
  const ticks = niceTicks(high, 4, low);
  const t0 = ticks[0];
  const t1 = ticks[ticks.length - 1];
  const labelWidth = Math.min(160, width * 0.35);
  const plot = Math.max(10, width - labelWidth - 16);
  const x = (value: number) => labelWidth + ((value - t0) / (t1 - t0 || 1)) * plot;
  const rowHeight = 30;
  const height = groups.length * rowHeight + 22;
  return (
    <div ref={ref}>
      <svg aria-label={title} className="block" height={height} role="img" width={width}>
        <title>{title}</title>
        <desc>
          {groups
            .map(
              (group) =>
                `${group.label}: mean ${formatNumber(group.mean)} (95% CI ${formatNumber(group.ci[0])} to ${formatNumber(group.ci[1])}), n ${group.n}`,
            )
            .join("; ")}
        </desc>
        {ticks.map((tick) => (
          <g key={tick}>
            <line stroke="var(--viz-grid)" x1={x(tick)} x2={x(tick)} y1={0} y2={height - 18} />
            <text
              className="fill-[var(--viz-axis)] text-[10px] tabular-nums"
              textAnchor="middle"
              x={x(tick)}
              y={height - 4}
            >
              {formatNumber(tick)}
            </text>
          </g>
        ))}
        {groups.map((group, index) => {
          const y = index * rowHeight + rowHeight / 2;
          return (
            <g key={group.label}>
              <text
                className="fill-[#3b4150] text-[11px] dark:fill-white/75"
                dominantBaseline="middle"
                x={0}
                y={y}
              >
                {group.label.length > 22 ? `${group.label.slice(0, 21)}…` : group.label}
                <title>{group.label}</title>
              </text>
              {Number.isFinite(group.ci[0]) ? (
                <line
                  stroke="var(--viz-1)"
                  strokeLinecap="round"
                  strokeWidth={2}
                  x1={x(group.ci[0])}
                  x2={x(group.ci[1])}
                  y1={y}
                  y2={y}
                />
              ) : null}
              <circle
                cx={x(group.mean)}
                cy={y}
                fill="var(--viz-1)"
                r={5}
                stroke="var(--viz-surface)"
                strokeWidth={2}
              >
                <title>{`${group.label}: ${formatNumber(group.mean)} (n ${group.n})`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
