// Content for the /mobile Focus page. Same rule as website-focus.ts: casual,
// specific, written for a working mobile developer — not a capability deck.
// See docs/project-overview.md for how this fits the other three Focus pages
// (/game, /website, /ux). Toolkit roles and pipeline stages live in
// focus-toolkits.ts / focus-pipelines.ts instead of here — see those files
// for why.

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
