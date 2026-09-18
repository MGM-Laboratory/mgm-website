// Content for the /game Focus page. Voice is casual and specific on
// purpose — a pitch to people who already love games and XR, not a
// corporate capability statement. See docs/project-overview.md for how this
// fits the other three Focus pages (/website, /mobile, /ux).

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

export type StudioRole = {
  role: string;
  tagline: string;
  tools: string[];
};

export const STUDIO_ROLES: StudioRole[] = [
  {
    role: "Engines",
    tagline: "Whatever the platform actually calls for",
    tools: ["Unity", "Unreal", "Godot", "Meta SDK"],
  },
  {
    role: "Art & animation",
    tagline: "From first sketch to a motion-captured performance",
    tools: [
      "Clip Studio Paint",
      "Adobe Creative Cloud",
      "21 large drawing tablets",
      "Motion capture rig",
    ],
  },
  {
    role: "Audio",
    tagline: "Scored and sound-designed in house",
    tools: ["Ableton Live", "Native Instruments gear", "MIDI controllers", "Sample libraries"],
  },
  {
    role: "Engineering & hardware",
    tagline: "A real device farm, not a simulator guess",
    tools: [
      "Photon multiplayer",
      "Cloud multiplayer hosting",
      "macOS · Windows · Linux rigs",
      "Every screen, phone to monitor",
    ],
  },
];

export type ReleaseStage = {
  label: string;
  detail: string;
};

export const RELEASE_STAGES: ReleaseStage[] = [
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
  "AI planning agents",
];

// Real, documented work — a lab member's award, not a live product. See
// mgm.md [S11]: BandoAR, presented at the 5th IEEE ICETAS, Bangkok, 22–23
// November 2018, supervised by Herman Tolle, Ahmad Afif Supianto, and Kohei
// Arai. Framed here as a highlight from the division's history, not a
// current release.
export const BANDOAR_HIGHLIGHT = {
  title: "BandoAR",
  meta: "Best Paper — 5th IEEE ICETAS, Bangkok · November 2018",
  body: "A smartphone app that points your camera at Banjar script and hands back Indonesian — AR and OCR doing real-time translation. Built by a lab member, recognized on an international stage.",
};
