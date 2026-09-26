"use client";

import type { FormRecord } from "@repo/shared";

export type FormResponsesPanelProps = {
  form: FormRecord;
  canWrite: boolean;
  canDelete: boolean;
};

/** Placeholder until the responses workspace lands. */
export function FormResponsesPanel({ form }: FormResponsesPanelProps) {
  return <p className="text-sm text-[#69748a]">{form.stats.responses} responses</p>;
}
