// Content for the /game Focus page. Voice is casual and specific on
// purpose — a pitch to people who already love games and XR, not a
// corporate capability statement. See docs/project-overview.md for how this
// fits the other three Focus pages (/website, /mobile, /ux).

import type { StoryRowItem } from "@/components/focus/shared/focus-story-rows";

// Studio toolkit roles and release stages live in focus-toolkits.ts /
// focus-pipelines.ts instead of here — see those files for why.

export type PlatformItem = { label: string; detail: string };

export const PLATFORM_ITEMS: PlatformItem[] = [
  { label: "PlayStation", detail: "Full library, every generation on the shelf" },
  { label: "Xbox", detail: "Consoles plus the full Kinect rig for motion input" },
  { label: "Wii", detail: "Balance Board, dance pads — the whole peripheral drawer" },
  { label: "Nintendo", detail: "Handheld and home consoles, side by side" },
  { label: "Racing rig", detail: "Wheel, pedals, and a seat built for sim racing" },
  { label: "Flight rig", detail: "Yoke and throttle quadrant for flight sims" },
];

export type XRStat = { value: string; label: string };

export const XR_STATS: XRStat[] = [
  { value: "10+", label: "Meta Quest 3 headsets on the floor" },
  { value: "30", label: "Mac Mini M4s for the team" },
  { value: "VR · AR · MR", label: "Every reality, one team" },
];

export const PUBLISHING_TOOLS: string[] = [
  "Steam",
  "Google Play Console",
  "Apple Developer",
  "Jira",
  "Figma",
  "Notion",
];

// Real, documented work — a lab member's award, not a live product. See
// mgm.md [S11]: BandoAR, presented at the 5th IEEE ICETAS, Bangkok, 22–23
// November 2018, supervised by Herman Tolle, Ahmad Afif Supianto, and Kohei
// Arai. Framed here as a highlight from the division's history, not a
// current release. Shaped as a one-item array so it can render through the
// same FocusStoryRows component the /mobile history section uses.
export const BANDOAR_HIGHLIGHT: StoryRowItem[] = [
  {
    tag: "Best Paper — 5th IEEE ICETAS, Bangkok · November 2018",
    title: "BandoAR",
    body: "A smartphone app that points your camera at Banjar script and hands back Indonesian — AR and OCR doing real-time translation. Built by a lab member, recognized on an international stage.",
    pattern: "quads",
    tone: "green",
  },
];
