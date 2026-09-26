"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "@phosphor-icons/react";
import type { FormAnalytics, FormAnalyticsRange, FormRecord } from "@repo/shared";

import { BarList, ColumnChart, Donut } from "@/components/admin/forms/charts/bars";
import { Funnel, type FunnelStep } from "@/components/admin/forms/charts/funnel";
import { WeekHourHeatmap } from "@/components/admin/forms/charts/grids";
import { Sparkline, TimeSeriesChart } from "@/components/admin/forms/charts/time-series";
import {
  ChartCard,
  EmptyChart,
  SERIES,
  cardClass,
  formatCount,
  formatMs,
  formatPercent,
  seriesColor,
} from "@/components/admin/forms/charts/viz";
import { WorldMap } from "@/components/admin/forms/charts/world-map";
import { countryLabel, type WorkingRow } from "@/lib/forms/data/columns";
import { histogram, median, mean } from "@/lib/forms/data/stats";

export const RANGE_MS: Record<Exclude<FormAnalyticsRange, "all">, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
  "365d": 365 * 86_400_000,
};

/** The wider range fetched to read the previous period from. */
/** The longer range each range is compared against ("all" has none). */
export const COMPARE_RANGE = new Map<FormAnalyticsRange, FormAnalyticsRange>([
  ["24h", "7d"],
  ["7d", "30d"],
  ["30d", "90d"],
  ["90d", "365d"],
  ["365d", "all"],
]);

type Delta = { value: number | null; goodWhenUp: boolean };

function periodBounds(analytics: FormAnalytics) {
  const first = analytics.series[0]?.bucket;
  const start = first ? Date.parse(first) : Date.now();
  const length = analytics.range === "all" ? Infinity : RANGE_MS[analytics.range];
  return { start, previousStart: start - length };
}

function sumSeries(series: FormAnalytics["series"], from: number, to: number) {
  const total = { views: 0, starts: 0, submissions: 0 };
  for (const point of series) {
    const time = Date.parse(point.bucket);
    if (time >= from && time < to) {
      total.views += point.views;
      total.starts += point.starts;
      total.submissions += point.submissions;
    }
  }
  return total;
}

function change(current: number | null, previous: number | null): number | null {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  )
    return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.value === null)
    return <span className="text-[11px] text-[#9ba4b5] dark:text-white/30">no earlier data</span>;
  const up = delta.value > 0.0005;
  const down = delta.value < -0.0005;
  const good = (up && delta.goodWhenUp) || (down && !delta.goodWhenUp);
  const tone = !up && !down ? "text-[#8a93a6]" : good ? "text-brand-green" : "text-brand-red";
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
    >
      <Icon aria-hidden size={12} weight="bold" />
      {`${up ? "+" : ""}${(delta.value * 100).toFixed(Math.abs(delta.value) < 0.1 ? 1 : 0)}%`}
      <span className="sr-only">
        {good ? " (better)" : up || down ? " (worse)" : ""} than the previous period
      </span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  trend,
  color = SERIES[0],
  hint,
}: {
  label: string;
  value: string;
  delta?: Delta;
  trend?: number[];
  color?: string;
  hint?: string;
}) {
  return (
    <div className={`${cardClass} flex min-w-0 flex-col gap-1 p-3.5`} title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-semibold text-[#5c6679] dark:text-white/55">
          {label}
        </span>
        {delta ? <DeltaBadge delta={delta} /> : null}
      </div>
      <span className="text-2xl font-semibold tracking-[-0.02em] text-[#171b25] dark:text-white">
        {value}
      </span>
      {trend && trend.length > 1 ? (
        <Sparkline color={color} label={`${label} trend`} values={trend} />
      ) : (
        <div className="h-7" />
      )}
    </div>
  );
}

function downsample(values: number[], points = 24): number[] {
  if (values.length <= points) return values;
  const size = values.length / points;
  return Array.from({ length: points }, (_, index) => {
    const start = Math.floor(index * size);
    const end = Math.floor((index + 1) * size);
    return values.slice(start, end).reduce((a, b) => a + b, 0);
  });
}

export function OverviewKpis({
  form,
  analytics,
  compare,
  rows,
}: {
  form: FormRecord;
  analytics: FormAnalytics;
  compare: FormAnalytics | null;
  rows: WorkingRow[];
}) {
  const { start, previousStart } = periodBounds(analytics);
  const totals = analytics.totals;
  const previous = compare ? sumSeries(compare.series, previousStart, start) : null;
  const hasPrevious = Boolean(
    compare && compare.series.some((point) => Date.parse(point.bucket) < start),
  );
  const prev = hasPrevious ? previous : null;

  const inRange = (row: WorkingRow, from: number, to: number) => {
    const time = Date.parse(row.record.createdAt);
    return time >= from && time < to;
  };
  const current = rows.filter((row) => !row.record.spam && inRange(row, start, Infinity));
  const earlier = hasPrevious
    ? rows.filter((row) => !row.record.spam && inRange(row, previousStart, start))
    : [];
  const durations = (list: WorkingRow[]) =>
    list
      .map((row) => row.record.meta.durationMs)
      .filter((value): value is number => typeof value === "number");
  const scores = (list: WorkingRow[]) =>
    list
      .map((row) => row.record.score)
      .filter((value): value is number => typeof value === "number");
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const todayCount = rows.filter(
    (row) => !row.record.spam && Date.parse(row.record.createdAt) >= todayStart,
  ).length;
  const yesterdayCount = rows.filter(
    (row) => !row.record.spam && inRange(row, todayStart - 86_400_000, todayStart),
  ).length;

  const series = analytics.series;
  const trend = (pick: (point: (typeof series)[number]) => number) => downsample(series.map(pick));
  const scoring = form.document.settings.scoring.enabled;
  const previousMedian =
    hasPrevious && durations(earlier).length ? median(durations(earlier)) : null;
  const previousMean = hasPrevious && durations(earlier).length ? mean(durations(earlier)) : null;

  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      data-testid="analytics-kpis"
    >
      <KpiCard
        delta={{ value: change(totals.views, prev?.views ?? null), goodWhenUp: true }}
        label="Views"
        trend={trend((point) => point.views)}
        value={formatCount(totals.views)}
      />
      <KpiCard
        hint="Distinct visitors (by device) that viewed the form"
        label="Unique visitors"
        value={formatCount(totals.uniqueVisitors)}
      />
      <KpiCard
        delta={{ value: change(totals.starts, prev?.starts ?? null), goodWhenUp: true }}
        label="Starts"
        trend={trend((point) => point.starts)}
        value={formatCount(totals.starts)}
      />
      <KpiCard
        color={SERIES[3]}
        delta={{ value: change(totals.submissions, prev?.submissions ?? null), goodWhenUp: true }}
        label="Submissions"
        trend={trend((point) => point.submissions)}
        value={formatCount(totals.submissions)}
      />
      <KpiCard
        delta={{
          value: change(
            totals.conversion,
            prev && prev.views ? prev.submissions / prev.views : null,
          ),
          goodWhenUp: true,
        }}
        hint="Submissions divided by views"
        label="Conversion"
        value={formatPercent(totals.conversion)}
      />
      <KpiCard
        delta={{
          value: change(
            totals.completion,
            prev && prev.starts ? prev.submissions / prev.starts : null,
          ),
          goodWhenUp: true,
        }}
        hint="Submissions divided by starts"
        label="Completion"
        value={formatPercent(totals.completion)}
      />
      <KpiCard
        delta={{ value: change(totals.medianDurationMs, previousMedian), goodWhenUp: false }}
        label="Median time"
        value={formatMs(totals.medianDurationMs)}
      />
      <KpiCard
        delta={{ value: change(totals.averageDurationMs, previousMean), goodWhenUp: false }}
        label="Average time"
        value={formatMs(totals.averageDurationMs)}
      />
      <KpiCard
        delta={{ value: change(todayCount, yesterdayCount), goodWhenUp: true }}
        hint="Compared with yesterday"
        label="Responses today"
        value={formatCount(todayCount)}
      />
      {scoring ? (
        <KpiCard
          delta={{
            value: change(
              scores(current).length ? mean(scores(current)) : null,
              scores(earlier).length ? mean(scores(earlier)) : null,
            ),
            goodWhenUp: true,
          }}
          label="Average score"
          value={scores(current).length ? mean(scores(current)).toFixed(2) : "–"}
        />
      ) : (
        <KpiCard label="Responses in range" value={formatCount(current.length)} />
      )}
    </div>
  );
}

function bucketFormatter(range: FormAnalyticsRange) {
  const hour = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const full = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const fullHour = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (iso: string, short: boolean) => {
    const date = new Date(iso);
    if (range === "24h") return short ? hour.format(date) : fullHour.format(date);
    return short ? day.format(date) : full.format(date);
  };
}

export function TrafficCard({ analytics }: { analytics: FormAnalytics }) {
  const [mode, setMode] = useState<"line" | "area">("area");
  const series = [
    {
      key: "views",
      label: "Views",
      color: SERIES[0],
      values: analytics.series.map((point) => point.views),
    },
    {
      key: "starts",
      label: "Starts",
      color: SERIES[2],
      values: analytics.series.map((point) => point.starts),
    },
    {
      key: "submissions",
      label: "Submissions",
      color: SERIES[3],
      values: analytics.series.map((point) => point.submissions),
    },
  ];
  const format = bucketFormatter(analytics.range);
  return (
    <ChartCard
      actions={
        <div
          className="flex rounded-lg border border-[#e4e8f0] p-0.5 dark:border-white/10"
          role="group"
          aria-label="Chart style"
        >
          {(["line", "area"] as const).map((item) => (
            <button
              aria-pressed={mode === item}
              className={`h-6 rounded-md px-2 text-[11px] font-semibold capitalize ${mode === item ? "bg-[#171b25] text-white dark:bg-white dark:text-[#171b25]" : "text-[#5c6679] dark:text-white/55"}`}
              key={item}
              onClick={() => {
                setMode(item);
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      }
      subtitle={
        analytics.range === "24h" ? "Per hour, your local time" : "Per day, your local time"
      }
      table={{
        columns: ["Period", "Views", "Starts", "Submissions"],
        rows: analytics.series.map((point) => [
          format(point.bucket, false),
          point.views,
          point.starts,
          point.submissions,
        ]),
      }}
      testId="traffic-card"
      title="Traffic over time"
    >
      {analytics.series.length ? (
        <TimeSeriesChart
          buckets={analytics.series.map((point) => point.bucket)}
          formatBucket={format}
          mode={mode}
          series={series}
          title="Views, starts and submissions over time"
        />
      ) : (
        <EmptyChart />
      )}
    </ChartCard>
  );
}

export function FunnelCard({ form, analytics }: { form: FormRecord; analytics: FormAnalytics }) {
  const sessions = new Map(analytics.funnel.map((item) => [item.fieldId, item.sessions]));
  const questions = form.document.fields.filter((field) => sessions.has(field.id));
  const steps: FunnelStep[] = [
    {
      key: "views",
      label: "Viewed the form",
      sessions: analytics.totals.views,
      kind: "view",
    },
    { key: "starts", label: "Started", sessions: analytics.totals.starts, kind: "start" },
    ...questions.map((field, index) => ({
      key: field.id,
      label: `Q${index + 1}. ${field.label || field.id}`,
      sessions: sessions.get(field.id) ?? 0,
      kind: "question" as const,
    })),
    { key: "submit", label: "Submitted", sessions: analytics.totals.submissions, kind: "submit" },
  ];
  return (
    <ChartCard
      className="lg:col-span-2"
      subtitle="Sessions that reached each step, in form order. Drops are from the step before."
      table={{
        columns: ["Step", "Sessions", "Share of first"],
        rows: steps.map((step) => [
          step.label,
          step.sessions,
          formatPercent(step.sessions / Math.max(1, steps[0].sessions)),
        ]),
      }}
      testId="funnel-card"
      title="Drop-off funnel"
    >
      {analytics.totals.views ? <Funnel steps={steps} /> : <EmptyChart />}
    </ChartCard>
  );
}

export function HeatmapCard({ analytics }: { analytics: FormAnalytics }) {
  return (
    <ChartCard
      subtitle="Views by weekday and hour, your local time"
      table={{
        columns: ["Weekday", "Hour", "Views"],
        rows: [...analytics.heatmap]
          .sort((a, b) => b.count - a.count)
          .map((cell) => [
            ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][cell.weekday],
            `${String(cell.hour).padStart(2, "0")}:00`,
            cell.count,
          ]),
      }}
      title="When people visit"
    >
      {analytics.heatmap.length ? (
        <WeekHourHeatmap cells={analytics.heatmap} title="Views by weekday and hour" />
      ) : (
        <EmptyChart />
      )}
    </ChartCard>
  );
}

export function MapCard({ analytics }: { analytics: FormAnalytics }) {
  const points = analytics.points.map((point) => ({ ...point }));
  return (
    <ChartCard
      className="lg:col-span-2"
      subtitle={`${formatCount(analytics.points.length)} geolocated points`}
      table={{
        columns: ["Latitude", "Longitude", "Kind", "Count"],
        rows: analytics.points
          .slice(0, 500)
          .map((point) => [
            point.latitude.toFixed(2),
            point.longitude.toFixed(2),
            point.kind === "view" ? "View" : "Submission",
            point.count,
          ]),
      }}
      testId="map-card"
      title="Where visitors are"
    >
      <WorldMap points={points} title="Visitors and submissions on a world map" />
    </ChartCard>
  );
}

function listRows<T extends { count: number }>(
  items: T[],
  label: (item: T) => string,
  key: (item: T) => string,
) {
  return items.map((item) => ({ key: key(item), label: label(item), value: item.count }));
}

export function BreakdownCards({ analytics }: { analytics: FormAnalytics }) {
  const views = Math.max(1, analytics.totals.views);
  const devices = analytics.devices.slice(0, 4);
  const otherDevices = analytics.devices.slice(4).reduce((sum, item) => sum + item.count, 0);
  const deviceSegments = [
    ...devices.map((item, index) => ({
      key: item.device,
      label: item.device || "Unknown",
      value: item.count,
      color: seriesColor(index),
    })),
    ...(otherDevices
      ? [{ key: "other", label: "Other", value: otherDevices, color: "var(--viz-other)" }]
      : []),
  ];
  const card = (
    title: string,
    rows: { key: string; label: string; value: number }[],
    columns: string[],
    total = views,
  ) => (
    <ChartCard
      table={{
        columns,
        rows: rows.map((row) => [row.label, row.value, formatPercent(row.value / total)]),
      }}
      title={title}
    >
      <BarList rows={rows} total={total} />
    </ChartCard>
  );
  return (
    <>
      {card(
        "Countries",
        listRows(
          analytics.countries,
          (item) => countryLabel(item.country) || "Unknown",
          (item) => item.country,
        ),
        ["Country", "Views", "Share"],
      )}
      {card(
        "Cities",
        listRows(
          analytics.cities,
          (item) =>
            [item.city || "Unknown", item.country ? countryLabel(item.country) : null]
              .filter(Boolean)
              .join(", "),
          (item) => `${item.city}-${item.country}`,
        ),
        ["City", "Views", "Share"],
      )}
      {card(
        "Referrers",
        listRows(
          analytics.referrers,
          (item) => item.host || "Direct",
          (item) => item.host,
        ),
        ["Referrer", "Views", "Share"],
      )}
      <ChartCard
        table={{
          columns: ["Device", "Views", "Share"],
          rows: deviceSegments.map((segment) => [
            segment.label,
            segment.value,
            formatPercent(segment.value / views),
          ]),
        }}
        title="Devices"
      >
        {deviceSegments.length ? (
          <Donut centerLabel="views" label="Views by device" segments={deviceSegments} />
        ) : (
          <EmptyChart />
        )}
      </ChartCard>
      {card(
        "Browsers",
        listRows(
          analytics.browsers,
          (item) => item.browser || "Unknown",
          (item) => item.browser,
        ),
        ["Browser", "Views", "Share"],
      )}
      {card(
        "Operating systems",
        listRows(
          analytics.oss,
          (item) => item.os || "Unknown",
          (item) => item.os,
        ),
        ["OS", "Views", "Share"],
      )}
      {card(
        "Languages",
        listRows(
          analytics.languages,
          (item) => item.language || "Unknown",
          (item) => item.language,
        ),
        ["Language", "Views", "Share"],
      )}
      {card(
        "UTM sources",
        listRows(
          analytics.utmSources,
          (item) => item.source || "None",
          (item) => item.source,
        ),
        ["Source", "Views", "Share"],
      )}
    </>
  );
}

/** Completion time histogram and responses by hour, from the (filtered, cleaned) responses. */
export function ResponseTimingCards({
  rows,
  only,
}: {
  rows: WorkingRow[];
  only?: "duration" | "hours";
}) {
  const { durationBins, hours } = useMemo(() => {
    const seconds = rows
      .map((row) => row.record.meta.durationMs)
      .filter((value): value is number => typeof value === "number" && value > 0)
      .map((value) => value / 1000);
    // Long tails (tabs left open) would squash everything: cap at the 95th percentile.
    const sortedSeconds = [...seconds].sort((a, b) => a - b);
    const cap = sortedSeconds[Math.floor(sortedSeconds.length * 0.95)] ?? 0;
    const minutes = seconds.map((value) => Math.min(value, cap) / 60);
    const bins = minutes.length
      ? histogram(minutes, Math.min(16, Math.max(5, Math.ceil(Math.sqrt(minutes.length)))))
      : [];
    const byHour = Array.from({ length: 24 }, () => 0);
    for (const row of rows) byHour[new Date(row.record.createdAt).getHours()] += 1;
    return { durationBins: bins, hours: byHour };
  }, [rows]);
  return (
    <>
      {only !== "hours" ? (
        <ChartCard
          className={only ? "lg:col-span-2" : ""}
          subtitle="Minutes from start to submit (the slowest 5% are grouped in the last bar)"
          table={{
            columns: ["Minutes", "Responses"],
            rows: durationBins.map((bin) => [
              `${bin.x0.toFixed(1)}–${bin.x1.toFixed(1)}`,
              bin.count,
            ]),
          }}
          title="Completion time"
        >
          {durationBins.length ? (
            <ColumnChart
              data={durationBins.map((bin, index) => ({
                key: String(index),
                label: bin.x0.toFixed(bin.x1 - bin.x0 < 1 ? 1 : 0),
                value: bin.count,
                detail: `${bin.x0.toFixed(1)}–${bin.x1.toFixed(1)} min`,
              }))}
              title="Completion time histogram"
            />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      ) : null}
      {only !== "duration" ? (
        <ChartCard
          subtitle="Your local time"
          table={{
            columns: ["Hour", "Responses"],
            rows: hours.map((count, hour) => [`${String(hour).padStart(2, "0")}:00`, count]),
          }}
          title="Responses by hour of day"
        >
          <ColumnChart
            data={hours.map((count, hour) => ({
              key: String(hour),
              label: String(hour).padStart(2, "0"),
              value: count,
              detail: `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59`,
            }))}
            labelEvery={3}
            title="Responses by hour of day"
          />
        </ChartCard>
      ) : null}
    </>
  );
}
