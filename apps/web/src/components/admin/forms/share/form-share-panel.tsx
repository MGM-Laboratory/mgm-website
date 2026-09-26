"use client";

import type { FormRecord } from "@repo/shared";

export type FormSharePanelProps = {
  form: FormRecord;
  /** The public origin links are built on (window.location.origin in the studio). */
  origin: string;
  /** The admin may list and create short links (the `links` permission). */
  canReadLinks: boolean;
  canWriteLinks: boolean;
  /** The admin may change the form (publish from the share panel). */
  canWrite: boolean;
  onFormChange: (form: FormRecord) => void;
};

/** Placeholder until the share panel lands. */
export function FormSharePanel({ form, origin }: FormSharePanelProps) {
  return <p className="text-sm text-[#69748a]">{`${origin}/forms/${form.slug}`}</p>;
}
