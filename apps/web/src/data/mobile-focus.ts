// Content for the /mobile Focus page. Same rule as website-focus.ts: casual,
// specific, written for a working mobile developer — not a capability deck.
// See docs/project-overview.md for how this fits the other three Focus pages
// (/game, /website, /ux).

import type { PatternKind, PatternTone } from "@/components/process/pattern-tile";

export type DeviceStat = {
  value: string;
  label: string;
  detail: string;
};

export const DEVICE_STATS: DeviceStat[] = [
  {
    value: "50+",
    label: "Physical phones on hand",
    detail:
      "iOS, Android, iPad, and tablet — every screen size and OS version that actually matters.",
  },
  {
    value: "2",
    label: "Platforms, native feel",
    detail:
      "iOS and Android, tuned on real hardware — not just whatever a simulator lets you get away with.",
  },
  {
    value: "Device farm",
    label: "Virtual Android instances",
    detail: "For parallel, mass-scale testing no shelf of physical phones could cover alone.",
  },
];

export type ToolkitRole = {
  role: string;
  tagline: string;
  story: string;
};

export const TOOLKIT_ROLES: ToolkitRole[] = [
  {
    role: "Product & PM",
    tagline: "Keeping the build pointed at something real",
    story:
      "Same discipline as the web team — a plan in Jira, a doc in Notion, and a PM who pushes back on scope creep before it turns into a delayed release. Every feature earns its spot on the roadmap by solving something a real user actually hit.",
  },
  {
    role: "Design & UX",
    tagline: "From a wireframe to a prototype you can actually tap through",
    story:
      "Screens get drawn in Figma and tested in Maze before a single line of Swift or Kotlin gets written, so the team already knows a flow works before it's expensive to change.",
  },
  {
    role: "Engineering",
    tagline: "Native feel, built and debugged by hand",
    story:
      "Real coding work, on real devices — engineers writing native code, testing it on the hardware sitting on the shelf, and fixing what breaks instead of trusting a simulator to catch it first.",
  },
];

export type PipelineStage = {
  label: string;
  detail: string;
};

export const PIPELINE_STAGES: PipelineStage[] = [
  { label: "Prototype", detail: "Expo Pro — on a real device in minutes, not a build queue" },
  { label: "Internal testing", detail: "TestFlight and Play Console internal tracks" },
  { label: "Store review", detail: "Apple Developer and Google Play Console submissions" },
  { label: "Live", detail: "Shipped to the store, monitored from day one" },
];

export type HistoryHighlight = {
  tag: string;
  title: string;
  body: string;
  pattern: PatternKind;
  tone: PatternTone;
};

// Real, documented lab history — not invented flavor. Presented as past/
// documented work, never as a currently-live product (see docs/repo-history
// research notes: no audited "still running" status exists for either).
export const HISTORY_HIGHLIGHTS: HistoryHighlight[] = [
  {
    tag: "2016 · iPad",
    title: "Jagoan Indonesia",
    body: 'An educational app about Indonesian culture, launched as a pilot with Mirai Education (Japan). Shipped with "Jelajah" and "Puzzle" at launch — "Kuis" was still in the oven.',
    pattern: "arcs",
    tone: "red",
  },
  {
    tag: "2017 · Expo",
    title: "World Puzzle, VR Labyrinth & Jatim Explore",
    body: "Three mobile builds shown off at a university tech expo — Jatim Explore paired local place info with real GPS integration.",
    pattern: "square",
    tone: "blue",
  },
  {
    tag: "Registered project · Android",
    title: "Public Transit@Malang",
    body: "A transit-info app for getting around the city, GPS built in — one of the lab's registered-rights projects.",
    pattern: "leaves",
    tone: "green",
  },
];
