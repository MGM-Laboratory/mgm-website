import type { LucideIcon } from "lucide-react";
import { Activity, Cloud, Code2, PenTool, ClipboardList, Workflow } from "lucide-react";

import type { CompetencyColor } from "./competencies";

export type FocusStackCategory = {
  id: string;
  index: string;
  title: string;
  url: string;
  icon: LucideIcon;
  accent: CompetencyColor;
  /** apps/web/public/focus/website/<file> — a generated, transparent-
   *  background Bauhaus illustration (see the PR that added this page for
   *  the generation prompts). */
  image: string;
  tagline: string;
  body: string;
  tools: string[];
};

// The lifecycle a web project actually goes through here, minus the "Ship"
// beat — that one gets its own dramatic, dark, interactive section rather
// than a chip list, since a dedicated IT & Infra division handling CI/CD is
// the one thing on this list that's genuinely unusual for a lab this size.
export const WEBSITE_FOCUS_STACK: FocusStackCategory[] = [
  {
    id: "plan",
    index: "01",
    title: "Plan it",
    url: "plan.mgmlab.dev",
    icon: ClipboardList,
    accent: "blue",
    image: "/focus/website/stack-plan.png",
    tagline: "Before a single line of code",
    body: "Boards that stay current, specs that live in Figma instead of a forgotten doc, and yes — an AI agent or two sitting in on planning now.",
    tools: ["Jira", "Figma", "Notion", "AI Agents"],
  },
  {
    id: "design",
    index: "02",
    title: "Design it",
    url: "design.mgmlab.dev",
    icon: PenTool,
    accent: "red",
    image: "/focus/website/stack-design.png",
    tagline: "Pixels, tested before they ship",
    body: 'Prototyped in Framer, put in front of actual people in Maze — so "looks good in Figma" and "works for humans" get to be the same sentence.',
    tools: ["Figma", "Maze", "Framer"],
  },
  {
    id: "build",
    index: "03",
    title: "Build it",
    url: "build.mgmlab.dev",
    icon: Code2,
    accent: "green",
    image: "/focus/website/stack-build.png",
    tagline: "A whole bench of AI pair programmers",
    body: "Claude, ChatGPT, Kimi, GLM, a local box for what shouldn't leave the building. Pick whichever model gets your problem, not whichever got licensed last.",
    tools: ["Claude", "ChatGPT", "Kimi", "GLM", "Local Inference", "ElevenLabs"],
  },
  {
    id: "watch",
    index: "04",
    title: "Watch it",
    url: "watch.mgmlab.dev",
    icon: Activity,
    accent: "yellow",
    image: "/focus/website/stack-watch.png",
    tagline: "We see it break before you do",
    body: "Sentry catches the exception, Datadog and Grafana catch the trend behind it. Nothing on this list gets to be a surprise at 3am.",
    tools: ["Sentry", "Datadog", "Grafana", "CodeRabbit", "Devin"],
  },
  {
    id: "automate",
    index: "05",
    title: "Automate it",
    url: "automate.mgmlab.dev",
    icon: Workflow,
    accent: "blue",
    image: "/focus/website/stack-automate.png",
    tagline: "The glue work, already wired up",
    body: "Self-hosted, boring-on-purpose infrastructure — n8n, Meilisearch, WhatsApp Business API, and real inbound/outbound email routing.",
    tools: ["n8n", "Meilisearch", "WABA", "SMTP Routing"],
  },
  {
    id: "reach",
    index: "06",
    title: "Go anywhere",
    url: "cloud.mgmlab.dev",
    icon: Cloud,
    accent: "red",
    image: "/focus/website/stack-reach.png",
    tagline: "Scale out, or don't leave the building",
    body: "AWS, GCP, Azure for scale — or our own data center when it doesn't need to leave one. GTM and Meta Ads to make growth measurable, not just loud.",
    tools: ["AWS", "GCP", "Azure", "Google APIs", "GTM", "Meta Ads", "Data Center"],
  },
];

export const ALL_TOOL_NAMES: string[] = WEBSITE_FOCUS_STACK.flatMap((c) => c.tools);
