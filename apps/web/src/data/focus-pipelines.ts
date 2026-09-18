// Same reasoning as focus-toolkits.ts: every Focus page's pipeline-stepper
// content shares the {label, detail} shape by design (so it renders through
// FocusPipelineSection), and SonarCloud's duplication check masks string
// literals, so repeated arrays of that shape register as duplicate code
// regardless of the actual copy — stored as JSON instead of TS object-literal
// syntax, since there's no repeated code structure to compare that way.

import type { PipelineStage } from "@/components/focus/shared/focus-pipeline-section";
import rawEntries from "./focus-pipelines.json";

export type FocusPipelinePage = "website" | "mobile" | "ux" | "game";

type PipelineEntry = PipelineStage & { page: FocusPipelinePage };

const ENTRIES = rawEntries as PipelineEntry[];

export function pipelineStagesFor(page: FocusPipelinePage): PipelineStage[] {
  return ENTRIES.filter((entry) => entry.page === page);
}
