// Content for the /game Focus page. Voice is casual and specific on
// purpose — a pitch to people who already love games and XR, not a
// corporate capability statement. See docs/project-overview.md for how this
// fits the other three Focus pages (/website, /mobile, /ux).

import type { StoryRowItem } from "@/components/focus/shared/focus-story-rows";
import type { ToolkitRole } from "@/components/focus/shared/focus-toolkit-section";
import type { PipelineStage } from "@/components/focus/shared/focus-pipeline-section";

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

export const STUDIO_ROLES: ToolkitRole[] = [
  {
    role: "Engines",
    tagline: "Whatever the platform actually calls for",
    story:
      "Unity for one project, Unreal for the next, Godot when it's the right fit — engineers pick the engine the platform actually needs instead of forcing every idea through the same pipeline.",
  },
  {
    role: "Art & animation",
    tagline: "From first sketch to a motion-captured performance",
    story:
      "Twenty-one big drawing tablets get used every day, not just for concept art — the same artists take a character from a sketch through the motion-capture rig to a finished in-game performance.",
  },
  {
    role: "Audio",
    tagline: "Scored and sound-designed in house",
    story:
      "Nobody's licensing a stock soundtrack. Tracks get built on real studio gear and mixed by hand, by people in the building who watched the scene they're scoring.",
  },
  {
    role: "Engineering & hardware",
    tagline: "A real device farm, not a simulator guess",
    story:
      "Every build gets tested across macOS, Windows, and Linux rigs, on whatever screen a player might actually use — engineers debugging multiplayer sync over a real network, not assuming it just works.",
  },
];

export const RELEASE_STAGES: PipelineStage[] = [
  { label: "Prototype", detail: "Playable in days, not sprints" },
  { label: "Playtest", detail: "Real hands on real hardware before anything ships" },
  { label: "Publish", detail: "Steam, Google Play Console, Apple Developer — ready to go" },
  { label: "Support", detail: "Patches, live-ops, and marketing help after launch" },
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
