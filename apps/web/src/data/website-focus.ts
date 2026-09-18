import type { CompetencyColor } from "./competencies";

export type FocusStackCategory = {
  id: string;
  index: string;
  title: string;
  tagline: string;
  body: string;
  accent: CompetencyColor;
  tools: string[];
  /** apps/web/public/focus/website/photos/<file> — omit for a clean
   *  typographic + logo cell instead of a photo cell; not every category
   *  earns a photo. */
  photo?: string;
};

export const WEBSITE_FOCUS_STACK: FocusStackCategory[] = [
  {
    id: "plan",
    index: "01",
    title: "Plan it",
    tagline: "Before a single line of code",
    body: "Boards that stay current, specs that live in Figma instead of a forgotten doc, and yes — an AI agent or two sitting in on planning now.",
    accent: "blue",
    tools: ["Jira", "Figma", "Notion", "AI Agents"],
  },
  {
    id: "design",
    index: "02",
    title: "Design it",
    tagline: "Pixels, tested before they ship",
    body: 'Prototyped in Framer, put in front of actual people in Maze — so "looks good in Figma" and "works for humans" get to be the same sentence.',
    accent: "red",
    tools: ["Figma", "Maze", "Framer"],
  },
  {
    id: "build",
    index: "03",
    title: "Build it",
    tagline: "A whole bench of AI pair programmers",
    body: "Claude, ChatGPT, Kimi, GLM, a local box for what shouldn't leave the building. Pick whichever model gets your problem, not whichever got licensed last.",
    accent: "green",
    tools: ["Claude", "ChatGPT", "Kimi", "GLM", "Local Inference", "ElevenLabs"],
    photo: "/focus/website/photos/bright-desk.jpg",
  },
  {
    id: "watch",
    index: "04",
    title: "Watch it",
    tagline: "We see it break before you do",
    body: "Sentry catches the exception, Datadog and Grafana catch the trend behind it. Nothing on this list gets to be a surprise at 3am.",
    accent: "yellow",
    tools: ["Sentry", "Datadog", "Grafana", "CodeRabbit", "Devin"],
  },
  {
    id: "automate",
    index: "05",
    title: "Automate it",
    tagline: "The glue work, already wired up",
    body: "Self-hosted, boring-on-purpose infrastructure — n8n, Meilisearch, WhatsApp Business API, and real inbound/outbound email routing.",
    accent: "blue",
    tools: ["n8n", "Meilisearch", "WABA", "SMTP Routing"],
  },
  {
    id: "reach",
    index: "06",
    title: "Go anywhere",
    tagline: "Scale out, or don't leave the building",
    body: "AWS, GCP, Azure for scale — or our own data center when it doesn't need to leave one. GTM and Meta Ads to make growth measurable, not just loud.",
    accent: "red",
    tools: ["AWS", "GCP", "Azure", "Google APIs", "GTM", "Meta Ads", "Data Center"],
    photo: "/focus/website/photos/night-highway.jpg",
  },
];

export const ALL_TOOL_NAMES: string[] = WEBSITE_FOCUS_STACK.flatMap((c) => c.tools);

// The beam-diagram ring — the tools most worth showing a real mark for,
// deduped from the categories above (order is the visual order around the
// diagram, not category order).
export const CONNECTED_TOOLS: string[] = [
  "GitHub",
  "Figma",
  "Claude",
  "Jira",
  "Vercel",
  "Sentry",
  "Docker",
  "n8n",
  "Grafana",
  "Railway",
];
