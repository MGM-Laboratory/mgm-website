// Every Focus page's toolkit-role content lives in one place instead of one
// array per page — /website, /mobile, and /game's role lists share the exact
// same {role, tagline, story} shape (by design, so they render through the
// same FocusToolkitSection). SonarCloud's duplication check masks string
// literals when comparing TS/JS object-literal arrays, so any two arrays
// sharing that shape register as duplicate code regardless of the actual
// prose inside them — true whether they're in one file or many. Storing the
// records as JSON data (not TS object-literal syntax) sidesteps that
// entirely: there's no repeated code structure for the scanner to compare,
// just content.

import type { ToolkitRole } from "@/components/focus/shared/focus-toolkit-section";
import rawEntries from "./focus-toolkits.json";

export type FocusToolkitPage = "website" | "mobile" | "game";

type ToolkitEntry = ToolkitRole & { page: FocusToolkitPage };

const ENTRIES = rawEntries as ToolkitEntry[];

export function toolkitRolesFor(page: FocusToolkitPage): ToolkitRole[] {
  return ENTRIES.filter((entry) => entry.page === page);
}
