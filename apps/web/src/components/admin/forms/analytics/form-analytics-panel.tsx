"use client";

import type { FormRecord } from "@repo/shared";

export type FormAnalyticsPanelProps = {
  form: FormRecord;
};

/** Placeholder until the analytics workspace lands. */
export function FormAnalyticsPanel({ form }: FormAnalyticsPanelProps) {
  return <p className="text-sm text-[#69748a]">{form.stats.views} views</p>;
}
