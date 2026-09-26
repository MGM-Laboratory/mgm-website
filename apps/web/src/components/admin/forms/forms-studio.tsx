"use client";

import type { FormSummary } from "@repo/shared";

export type FormsStudioProps = {
  initialForms: FormSummary[];
  canWrite: boolean;
  canDelete: boolean;
  canReadLinks: boolean;
  canWriteLinks: boolean;
};

/**
 * The Forms workspace: the forms list, the builder, and each form's share,
 * responses and analytics tabs. Full-bleed, like the events workspace.
 * Placeholder until the builder lands.
 */
export function FormsStudio({ initialForms }: FormsStudioProps) {
  return (
    <div className="mx-auto w-full max-w-[1680px] px-6 pt-8 pb-20 sm:px-10">
      <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Forms</h1>
      <p className="mt-2 text-sm text-[#69748a]">{initialForms.length} forms</p>
    </div>
  );
}
