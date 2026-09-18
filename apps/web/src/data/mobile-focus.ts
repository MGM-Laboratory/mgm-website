// Content for the /mobile Focus page. Same rule as website-focus.ts: casual,
// specific, written for a working mobile developer — not a capability deck.
// See docs/project-overview.md for how this fits the other three Focus pages
// (/game, /website, /ux).

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
  tools: string[];
};

export const TOOLKIT_ROLES: ToolkitRole[] = [
  {
    role: "Product & PM",
    tagline: "Keeping the build pointed at something real",
    tools: ["Jira", "Notion", "Figma", "AI planning agents"],
  },
  {
    role: "Design & UX",
    tagline: "From wireframe to a prototype you can actually tap through",
    tools: ["Figma", "Maze"],
  },
  {
    role: "Engineering",
    tagline: "Native feel, backed by infra that scales without you thinking about it",
    tools: ["Expo Pro", "Firebase", "Supabase", "Scalable backend tooling"],
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
};

// Real, documented lab history — not invented flavor. Presented as past/
// documented work, never as a currently-live product (see docs/repo-history
// research notes: no audited "still running" status exists for either).
export const HISTORY_HIGHLIGHTS: HistoryHighlight[] = [
  {
    tag: "2016 · iPad",
    title: "Jagoan Indonesia",
    body: 'An educational app about Indonesian culture, launched as a pilot with Mirai Education (Japan). Shipped with "Jelajah" and "Puzzle" at launch — "Kuis" was still in the oven.',
  },
  {
    tag: "2017 · Expo",
    title: "World Puzzle, VR Labyrinth & Jatim Explore",
    body: "Three mobile builds shown off at a university tech expo — Jatim Explore paired local place info with real GPS integration.",
  },
  {
    tag: "Registered project · Android",
    title: "Public Transit@Malang",
    body: "A transit-info app for getting around the city, GPS built in — one of the lab's registered-rights projects.",
  },
];
