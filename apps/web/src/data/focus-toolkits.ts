// Every Focus page's toolkit-role content lives in one array instead of one
// per page — /website, /mobile, and /game's role lists share the exact same
// {role, tagline, story} shape (by design, so they render through the same
// FocusToolkitSection), and SonarCloud's duplication check treats repeated
// declarations of that shape as duplicate code regardless of the actual copy
// inside it. One canonical array, filtered per page, means the shape only
// exists once in the codebase.

import type { ToolkitRole } from "@/components/focus/shared/focus-toolkit-section";

export type FocusToolkitPage = "website" | "mobile" | "game";

type ToolkitEntry = ToolkitRole & { page: FocusToolkitPage };

const ENTRIES: ToolkitEntry[] = [
  {
    page: "website",
    role: "Product & PM",
    tagline: "Keeping the build pointed at something real",
    story:
      "Every project starts as a plan in Jira and a doc in Notion, not a vibe. PMs sit in the same room as engineering, push back on scope creep out loud, and keep asking the question that actually matters: who is this for, and have we talked to them yet?",
  },
  {
    page: "website",
    role: "Design & UX",
    tagline: "From a wireframe to something you can actually click through",
    story:
      "Every screen gets drawn in Figma, tested with Maze, and reworked more than once before it's good enough to hand off. A Framer prototype gets argued over in review the same way code does — nothing ships because it looked fine on the first pass.",
  },
  {
    page: "website",
    role: "Engineering",
    tagline: "Written, reviewed, and shipped by hand",
    story:
      "This is real coding work — engineers writing the code, reading each other's pull requests, and debugging the thing at 11pm when it breaks. No shortcuts, no black box deciding what ships; just people who know the codebase because they built it.",
  },
  {
    page: "mobile",
    role: "Product & PM",
    tagline: "Same discipline, a different shelf of hardware to plan around",
    story:
      "Same discipline as the web team — a plan in Jira, a doc in Notion, and a PM who pushes back on scope creep before it turns into a delayed release. Every feature earns its spot on the roadmap by solving something a real user actually hit.",
  },
  {
    page: "mobile",
    role: "Design & UX",
    tagline: "From a wireframe to a prototype you can actually tap through",
    story:
      "Screens get drawn in Figma and tested in Maze before a single line of Swift or Kotlin gets written, so the team already knows a flow works before it's expensive to change.",
  },
  {
    page: "mobile",
    role: "Engineering",
    tagline: "Native feel, built and debugged by hand",
    story:
      "Real coding work, on real devices — engineers writing native code, testing it on the hardware sitting on the shelf, and fixing what breaks instead of trusting a simulator to catch it first.",
  },
  {
    page: "game",
    role: "Engines",
    tagline: "Whatever the platform actually calls for",
    story:
      "Unity for one project, Unreal for the next, Godot when it's the right fit — engineers pick the engine the platform actually needs instead of forcing every idea through the same pipeline.",
  },
  {
    page: "game",
    role: "Art & animation",
    tagline: "From first sketch to a motion-captured performance",
    story:
      "Twenty-one big drawing tablets get used every day, not just for concept art — the same artists take a character from a sketch through the motion-capture rig to a finished in-game performance.",
  },
  {
    page: "game",
    role: "Audio",
    tagline: "Scored and sound-designed in house",
    story:
      "Nobody's licensing a stock soundtrack. Tracks get built on real studio gear and mixed by hand, by people in the building who watched the scene they're scoring.",
  },
  {
    page: "game",
    role: "Engineering & hardware",
    tagline: "A real device farm, not a simulator guess",
    story:
      "Every build gets tested across macOS, Windows, and Linux rigs, on whatever screen a player might actually use — engineers debugging multiplayer sync over a real network, not assuming it just works.",
  },
];

export function toolkitRolesFor(page: FocusToolkitPage): ToolkitRole[] {
  return ENTRIES.filter((entry) => entry.page === page);
}
