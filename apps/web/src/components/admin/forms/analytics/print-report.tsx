"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { FormRecord } from "@repo/shared";

import { VIZ_ROOT, formatCount, formatMs } from "@/components/admin/forms/charts/viz";
import type { DataColumn, WorkingRow } from "@/lib/forms/data/columns";

import { QuestionInsights } from "./question-insights";

/**
 * Print-only CSS: everything but the element marked `data-forms-print` is
 * hidden while printing, and that element flows from the top of the page.
 */
export const PRINT_STYLE = `@media print {
  body * { visibility: hidden !important; }
  [data-forms-print], [data-forms-print] * { visibility: visible !important; }
  [data-forms-print] { position: absolute !important; left: 0; top: 0; width: 100% !important; padding: 0 !important; }
  [data-forms-print] section { break-inside: avoid; }
  [data-forms-print-hide] { display: none !important; }
  @page { margin: 14mm; }
}`;

export function PrintStyle() {
  return <style>{PRINT_STYLE}</style>;
}

/**
 * Prints the element: marks it, narrows it to the printable A4 width so the
 * ResizeObserver-sized charts redraw to fit the page, prints, then restores.
 */
export function printElement(element: HTMLElement | null) {
  if (!element) return;
  const previousWidth = element.style.width;
  element.setAttribute("data-forms-print", "");
  element.style.width = "720px";
  const done = () => {
    element.removeAttribute("data-forms-print");
    element.style.width = previousWidth;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  // Two frames plus a beat for the observers to measure and the charts to redraw.
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        window.print();
        // Browsers that don't fire afterprint.
        window.setTimeout(done, 1000);
      }, 120),
    ),
  );
}

/** A printable summary of the shown responses and every question's chart. */
export function PrintReport({
  form,
  rows,
  total,
  columns,
  onDone,
}: {
  form: FormRecord;
  rows: WorkingRow[];
  total: number;
  columns: DataColumn[];
  onDone: () => void;
}) {
  useEffect(() => {
    const onAfter = () => onDone();
    window.addEventListener("afterprint", onAfter);
    // Two frames so the charts measure and draw before the print dialog snapshots them.
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        window.setTimeout(onDone, 1500);
      }),
    );
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", onAfter);
    };
  }, [onDone]);
  const durations = rows
    .map((row) => row.record.meta.durationMs)
    .filter((value): value is number => typeof value === "number");
  const average = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  return createPortal(
    <div
      aria-hidden
      className={`${VIZ_ROOT} pointer-events-none fixed top-0 left-[-10000px] w-[720px] bg-white p-0 text-[#171b25]`}
      data-forms-print=""
    >
      <PrintStyle />
      <h1 className="text-2xl font-semibold">{form.document.title}</h1>
      <p className="mt-1 text-sm text-[#5c6679]">
        Report of {formatCount(rows.length)} of {formatCount(total)} responses · average time{" "}
        {formatMs(average)} · printed {new Date().toLocaleString()}
      </p>
      <div className="mt-6">
        <QuestionInsights columns={columns} formId={form.id} rows={rows} />
      </div>
    </div>,
    document.body,
  );
}
