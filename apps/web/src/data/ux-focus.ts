// Content for the /ux Focus page. See docs/project-overview.md for how this
// fits the other three Focus pages (/game, /website, /mobile).

import type { PipelineStage } from "@/components/focus/shared/focus-pipeline-section";

export type ResearchPoint = {
  label: string;
  body: string;
};

export const RESEARCH_POINTS: ResearchPoint[] = [
  {
    label: "Usability studies",
    body: "We hand someone a task, not a script, and watch where they actually get stuck — not where the spec assumed they would.",
  },
  {
    label: "Interviews",
    body: "Fifteen honest minutes with a real user beats a week of internal debate about what they probably think.",
  },
  {
    label: "Iteration",
    body: "A design isn't done at handoff. It's done after it's been watched, broken, and fixed at least once.",
  },
];

// UI/UX research and design has been one of this lab's actual, ongoing
// research areas since at least a 2019 recruitment cycle that hired
// specifically for a UX Designer role — not a function invented for this page.
export const RESEARCH_NOTE =
  "UX research has been a standing focus here since at least 2019, when we first hired specifically for a UX Designer role — not a function bolted on for this page.";

export type EquipmentItem = {
  label: string;
  body: string;
};

export const EQUIPMENT: EquipmentItem[] = [
  { label: "Eye tracker", body: "Where attention actually lands, not where you assumed it would." },
  {
    label: "Heart-rate monitor",
    body: "Frustration shows up in a pulse before it shows up in a survey answer.",
  },
  {
    label: "Webcam sessions",
    body: "Recorded, timestamped, and watched back — the reaction matters as much as the click.",
  },
  { label: "Figma", body: "Where the studies turn into an actual interface." },
  { label: "Maze", body: "Unmoderated testing at a scale a single researcher can't cover alone." },
];

export const PROCESS_STAGES: PipelineStage[] = [
  { label: "Observe", detail: "Real sessions, unscripted tasks" },
  { label: "Analyze", detail: "Heatmaps, transcripts, patterns across sessions" },
  { label: "Design", detail: "Wireframe to a clickable prototype in Figma" },
  { label: "Validate", detail: "Test the fix — don't just ship it and hope" },
];
