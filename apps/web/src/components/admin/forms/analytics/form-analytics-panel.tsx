"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowsClockwise, Printer } from "@phosphor-icons/react";
import type { FormAnalytics, FormAnalyticsRange, FormRecord } from "@repo/shared";

import { VIZ_ROOT, formatCount } from "@/components/admin/forms/charts/viz";
import { formsAdminApi } from "@/lib/forms/admin-api";
import { SEGMENTS, isFilterActive } from "@/lib/forms/data/filters";
import { loadResponses, setView, useFormDataset } from "@/lib/forms/data/store";

import { AnalysisLab } from "./analysis-lab";
import {
  BreakdownCards,
  COMPARE_RANGE,
  FunnelCard,
  HeatmapCard,
  MapCard,
  OverviewKpis,
  ResponseTimingCards,
  TrafficCard,
} from "./overview";
import { PrintStyle, printElement } from "./print-report";
import { QuestionInsights } from "./question-insights";
import { VisitorLog } from "./visitor-log";

export type FormAnalyticsPanelProps = {
  form: FormRecord;
};

const RANGES: { id: FormAnalyticsRange; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "365d", label: "1 year" },
  { id: "all", label: "All time" },
];

type Tab = "overview" | "questions" | "lab" | "visitors";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "questions", label: "Question insights" },
  { id: "lab", label: "Analysis lab" },
  { id: "visitors", label: "Visitor log" },
];

type Loaded = { key: string; current: FormAnalytics; compare: FormAnalytics | null };

/** The Analytics tab: traffic from the form's events, and insights from its (cleaned, filtered) responses. */
export function FormAnalyticsPanel({ form }: FormAnalyticsPanelProps) {
  const [range, setRange] = useState<FormAnalyticsRange>("30d");
  const [tab, setTab] = useState<Tab>("overview");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const data = useFormDataset(form);
  const requestKey = `${form.id}:${range}:${nonce}`;
  const loading = loaded?.key !== requestKey && !failed;

  useEffect(() => {
    void loadResponses(form.id).catch(() => undefined);
  }, [form.id]);

  useEffect(() => {
    let cancelled = false;
    const tz = -new Date().getTimezoneOffset();
    const compareRange = COMPARE_RANGE[range];
    Promise.all([
      formsAdminApi.analytics(form.id, range, tz),
      compareRange
        ? formsAdminApi.analytics(form.id, compareRange, tz).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([current, compare]) => {
        if (cancelled) return;
        setFailed(null);
        setLoaded({ key: requestKey, current, compare });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not load analytics.";
        setFailed(message);
        toast.error("Could not load analytics", { description: message });
      });
    return () => {
      cancelled = true;
    };
  }, [form.id, range, requestKey]);

  // Responses inside the chosen range (for insights and the lab), after the Responses view.
  // The range starts where the API's first bucket does, so both halves agree.
  const rangeStart = range === "all" ? null : (loaded?.current.series[0]?.bucket ?? null);
  const rangeRows = useMemo(() => {
    if (!rangeStart) return data.filtered;
    const since = Date.parse(rangeStart);
    return data.filtered.filter((row) => Date.parse(row.record.createdAt) >= since);
  }, [data.filtered, rangeStart]);

  const view = data.state.view;
  const activeFilters = view.filters.filter(isFilterActive).length + (view.search.trim() ? 1 : 0);
  const analytics = loaded?.current;

  return (
    <div className={`${VIZ_ROOT} space-y-4`} data-testid="analytics-panel" ref={rootRef}>
      <PrintStyle />
      <div className="flex flex-wrap items-center gap-2" data-forms-print-hide="">
        <div
          aria-label="Range"
          className="flex flex-wrap rounded-xl border border-[#d9dfeb] bg-white p-0.5 dark:border-white/10 dark:bg-white/[0.03]"
          role="group"
        >
          {RANGES.map((item) => (
            <button
              aria-pressed={range === item.id}
              className={`h-8 rounded-[10px] px-2.5 text-xs font-semibold transition ${range === item.id ? "bg-brand-blue text-white" : "text-[#5c6679] hover:text-brand-blue dark:text-white/60"}`}
              key={item.id}
              onClick={() => {
                setFailed(null);
                setRange(item.id);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          aria-label="Refresh analytics"
          className="inline-flex h-9 items-center rounded-xl border border-[#d9dfeb] bg-white px-2.5 text-[#5c6679] hover:text-brand-blue dark:border-white/10 dark:bg-white/[0.03]"
          onClick={() => {
            setFailed(null);
            setNonce((value) => value + 1);
            void loadResponses(form.id, { force: true }).catch(() => undefined);
          }}
          type="button"
        >
          <ArrowsClockwise
            className={loading ? "animate-spin motion-reduce:animate-none" : ""}
            size={15}
          />
        </button>
        <button
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm font-semibold text-[#3b4150] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:bg-white/[0.03] dark:text-white/75"
          onClick={() => printElement(rootRef.current)}
          type="button"
        >
          <Printer size={15} /> <span className="hidden sm:inline">Print report</span>
        </button>
      </div>

      <div
        className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1"
        data-forms-print-hide=""
        role="tablist"
        aria-label="Analytics views"
      >
        {TABS.map((item) => (
          <button
            aria-selected={tab === item.id}
            className={`h-9 shrink-0 rounded-xl px-3 text-sm font-semibold transition ${tab === item.id ? "bg-[#171b25] text-white dark:bg-white dark:text-[#171b25]" : "text-[#5c6679] hover:bg-white dark:text-white/60 dark:hover:bg-white/5"}`}
            key={item.id}
            onClick={() => setTab(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "questions" || tab === "lab" ? (
        <div className="flex flex-wrap items-center gap-1.5" data-forms-print-hide="">
          <span className="mr-1 text-xs text-[#5c6679] dark:text-white/55">
            <b className="tabular-nums">{formatCount(rangeRows.length)}</b> of{" "}
            {formatCount(data.state.responses?.length ?? 0)} responses
            {activeFilters
              ? ` · ${activeFilters} filter${activeFilters === 1 ? "" : "s"} from the Responses tab`
              : ""}
            {data.state.pipeline.some((step) => step.enabled) ? " · cleaned" : ""}
          </span>
          {SEGMENTS.map((segment) => (
            <button
              aria-pressed={view.segment === segment.id}
              className={`h-7 rounded-full px-2.5 text-[11px] font-semibold ${view.segment === segment.id ? "bg-[#171b25] text-white dark:bg-white dark:text-[#171b25]" : "border border-[#d9dfeb] text-[#5c6679] hover:border-brand-blue dark:border-white/10 dark:text-white/60"}`}
              key={segment.id}
              onClick={() => setView(form.id, { segment: segment.id })}
              type="button"
            >
              {segment.label}
            </button>
          ))}
        </div>
      ) : null}

      {failed && !analytics && tab === "overview" ? (
        <div className="rounded-2xl border border-[#e4e8f0] bg-white p-8 text-center dark:border-white/10 dark:bg-white/[0.02]">
          <p className="text-sm font-semibold">Analytics didn&apos;t load.</p>
          <p className="mt-1 text-xs text-[#8a93a6]">{failed}</p>
          <button
            className="mt-4 h-9 rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white"
            onClick={() => {
              setFailed(null);
              setNonce((value) => value + 1);
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {tab === "overview" ? (
        !analytics ? (
          !failed ? (
            <div aria-busy="true" className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 10 }, (_, index) => (
                <div
                  className="h-28 animate-pulse rounded-2xl bg-[#eef0f4] motion-reduce:animate-none dark:bg-white/5"
                  key={index}
                />
              ))}
            </div>
          ) : null
        ) : (
          <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
            <OverviewKpis
              analytics={analytics}
              compare={loaded?.compare ?? null}
              form={form}
              rows={data.rows}
            />
            <TrafficCard analytics={analytics} />
            <div className="grid gap-4 lg:grid-cols-2">
              <FunnelCard analytics={analytics} form={form} />
              <HeatmapCard analytics={analytics} />
              <MapCard analytics={analytics} />
              <BreakdownCards analytics={analytics} />
              <ResponseTimingCards rows={rangeRows} />
            </div>
          </div>
        )
      ) : null}

      {tab === "questions" ? (
        data.state.responses ? (
          <QuestionInsights columns={data.columns} formId={form.id} rows={rangeRows} />
        ) : (
          <div className="h-64 animate-pulse rounded-2xl bg-[#f3f5f8] motion-reduce:animate-none dark:bg-white/[0.03]" />
        )
      ) : null}

      {tab === "lab" ? (
        <AnalysisLab
          columns={data.columns}
          rows={rangeRows}
          total={data.state.responses?.length ?? 0}
        />
      ) : null}

      {tab === "visitors" ? <VisitorLog form={form} /> : null}
    </div>
  );
}
