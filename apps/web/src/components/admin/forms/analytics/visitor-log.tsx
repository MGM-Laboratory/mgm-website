"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowsClockwise, MagnifyingGlass } from "@phosphor-icons/react";
import type { FormEventType, FormRecord, FormVisit } from "@repo/shared";

import { EmptyChart, cardClass } from "@/components/admin/forms/charts/viz";
import { formsAdminApi } from "@/lib/forms/admin-api";
import { countryLabel } from "@/lib/forms/data/columns";

const TYPE_TONE: Record<FormEventType, string> = {
  view: "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/15",
  start: "bg-brand-yellow-50 text-[#8a6412] dark:bg-brand-yellow/15 dark:text-brand-yellow",
  progress: "bg-[#eef1f6] text-[#5c6470] dark:bg-white/10 dark:text-white/60",
  submit: "bg-brand-green-50 text-brand-green dark:bg-brand-green/15",
};

/** The latest visits, one row per event, filterable. */
export function VisitorLog({ form }: { form: FormRecord }) {
  const [visits, setVisits] = useState<FormVisit[] | null>(null);
  const [limit, setLimit] = useState(200);
  const [type, setType] = useState<FormEventType | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const labels = useMemo(
    () => new Map(form.document.fields.map((field) => [field.id, field.label || field.id])),
    [form.document.fields],
  );

  const load = async (count: number) => {
    setLoading(true);
    try {
      const { visits: next } = await formsAdminApi.visits(form.id, count);
      setVisits(next);
    } catch (error) {
      toast.error("Could not load the visitor log", {
        description: error instanceof Error ? error.message : undefined,
      });
      setVisits((current) => current ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    formsAdminApi
      .visits(form.id, 200)
      .then(({ visits: next }) => {
        if (!cancelled) setVisits(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error("Could not load the visitor log", {
          description: error instanceof Error ? error.message : undefined,
        });
        setVisits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.id]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (visits ?? []).filter((visit) => {
      if (type !== "all" && visit.type !== type) return false;
      if (!needle) return true;
      return [
        visit.ip,
        visit.city,
        visit.region,
        visit.country,
        visit.device,
        visit.browser,
        visit.os,
        visit.referer,
        visit.sessionId,
        visit.fieldId ? labels.get(visit.fieldId) : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [visits, type, query, labels]);

  if (!visits)
    return (
      <div className="h-64 animate-pulse rounded-2xl bg-[#f3f5f8] motion-reduce:animate-none dark:bg-white/[0.03]" />
    );

  return (
    <div className={`${cardClass} p-4`} data-testid="visitor-log">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Search visits</span>
          <MagnifyingGlass
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#9ba4b5]"
            size={14}
          />
          <input
            className="h-9 w-full rounded-xl border border-[#d9dfeb] bg-white pr-3 pl-8 text-sm outline-none focus:border-brand-blue dark:border-white/10 dark:bg-white/[0.045]"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="IP, place, device, referrer, question"
            type="search"
            value={query}
          />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Event type">
          {(["all", "view", "start", "progress", "submit"] as const).map((item) => (
            <button
              aria-pressed={type === item}
              className={`h-8 rounded-full px-3 text-xs font-semibold capitalize ${type === item ? "bg-[#171b25] text-white dark:bg-white dark:text-[#171b25]" : "border border-[#d9dfeb] text-[#5c6679] dark:border-white/10 dark:text-white/60"}`}
              key={item}
              onClick={() => {
                setType(item);
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <button
          aria-label="Refresh visits"
          className="inline-flex h-9 items-center rounded-xl border border-[#d9dfeb] px-2.5 text-[#5c6679] hover:text-brand-blue dark:border-white/10"
          onClick={() => void load(limit)}
          type="button"
        >
          <ArrowsClockwise
            className={loading ? "animate-spin motion-reduce:animate-none" : ""}
            size={15}
          />
        </button>
      </div>
      {!filtered.length ? (
        <EmptyChart>No visits match.</EmptyChart>
      ) : (
        <div className="max-h-[70vh] overflow-auto overscroll-contain rounded-xl border border-[#eef0f4] dark:border-white/10">
          <table className="w-full min-w-[860px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[#fbfbfa] text-left text-[#7e899d] dark:bg-[#171b22] dark:text-white/45">
              <tr>
                {["Time", "Event", "Question reached", "IP", "Location", "Device", "Referrer"].map(
                  (title) => (
                    <th className="px-3 py-2 font-semibold" key={title} scope="col">
                      {title}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((visit) => (
                <tr
                  className="border-t border-[#eef0f4] align-top dark:border-white/5"
                  key={visit.id}
                >
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {new Date(visit.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_TONE[visit.type]}`}
                    >
                      {visit.type}
                    </span>
                  </td>
                  <td
                    className="max-w-[220px] truncate px-3 py-2"
                    title={visit.fieldId ? labels.get(visit.fieldId) : undefined}
                  >
                    {visit.fieldId ? (
                      (labels.get(visit.fieldId) ?? visit.fieldId)
                    ) : (
                      <span className="text-[#c3c9d4]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{visit.ip ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {[visit.city, visit.region, visit.country ? countryLabel(visit.country) : null]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {[visit.device, visit.browser, visit.os].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td
                    className="max-w-[200px] truncate px-3 py-2 text-[#778299] dark:text-white/45"
                    title={visit.referer ?? undefined}
                  >
                    {visit.referer ?? "direct"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-[#8a93a6]">
        <span>
          {filtered.length} of the latest {visits.length} events
        </span>
        {visits.length >= limit && limit < 2000 ? (
          <button
            className="font-semibold text-brand-blue hover:underline"
            onClick={() => {
              const next = Math.min(2000, limit * 2);
              setLimit(next);
              void load(next);
            }}
            type="button"
          >
            Load more
          </button>
        ) : null}
      </div>
    </div>
  );
}
