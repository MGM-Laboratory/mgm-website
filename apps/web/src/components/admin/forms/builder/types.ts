import type { FormDocument, FormRecord } from "@repo/shared";

import type { DocumentChange } from "@/lib/forms/builder-history";

/**
 * What the builder selects: a block id, `welcome`, `ending:<id>`, or null
 * (the form itself).
 */
export type Selection = string | null;

/** Props every builder tab receives from the workspace. */
export type TabProps = {
  /** The raw document on screen (edits go through `change`). */
  document: FormDocument;
  /**
   * Applies an immutable edit and records it in the undo history. Pass a
   * `coalesce` key (for example `settings.title`) for keystroke-by-keystroke
   * edits of one control so they fold into one undo step.
   */
  change: DocumentChange;
  /** The saved form (slug, status, stats) as the server last answered. */
  record: FormRecord;
  readOnly: boolean;
  selection: Selection;
  select: (selection: Selection) => void;
};

export type PreviewStage = "welcome" | "form" | "ending";
export type PreviewDevice = "phone" | "tablet" | "desktop";
