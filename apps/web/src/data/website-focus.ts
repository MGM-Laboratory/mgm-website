import type { LucideIcon } from "lucide-react";
import { Activity, Cloud, Code2, PenTool, ClipboardList, Workflow } from "lucide-react";

export type FocusStackCategory = {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
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
    title: "Plan it",
    url: "plan.mgmlab.dev",
    icon: ClipboardList,
    tagline: "Before a single line of code",
    body: "Every build starts as a mess of sticky notes and half-finished Slack threads. We just happen to have really good sticky notes — boards that stay current, specs that live in Figma instead of a forgotten doc, and yes, an AI agent or two sitting in on planning now.",
    tools: ["Jira", "Figma", "Notion", "AI Agents"],
  },
  {
    id: "design",
    title: "Design it",
    url: "design.mgmlab.dev",
    icon: PenTool,
    tagline: "Pixels, tested before they ship",
    body: 'Nobody ships a hunch here. Flows get prototyped in Framer and put in front of actual people in Maze before they\'re allowed anywhere near production — so "looks good in Figma" and "works for humans" get to be the same sentence.',
    tools: ["Figma", "Maze", "Framer"],
  },
  {
    id: "build",
    title: "Build it",
    url: "build.mgmlab.dev",
    icon: Code2,
    tagline: "You, plus a whole bench of AI pair programmers",
    body: "Claude, ChatGPT, Kimi, GLM, a local inference box for the stuff that shouldn't leave the building, ElevenLabs when something needs a voice. Pick whichever model actually gets your problem, not whichever one happened to get licensed last.",
    tools: ["Claude", "ChatGPT", "Kimi", "GLM", "Local Inference", "ElevenLabs"],
  },
  {
    id: "watch",
    title: "Watch it",
    url: "watch.mgmlab.dev",
    icon: Activity,
    tagline: "We see it break before you do",
    body: "Sentry catches the exception, Datadog and Grafana catch the trend behind it, and CodeRabbit's already left a comment on the pull request that caused it. Nothing on this list gets to be a surprise at 3am.",
    tools: ["Sentry", "Datadog", "Grafana", "CodeRabbit", "Devin"],
  },
  {
    id: "automate",
    title: "Automate it",
    url: "automate.mgmlab.dev",
    icon: Workflow,
    tagline: "The glue work, already wired up",
    body: "Self-hosted, boring-on-purpose infrastructure: n8n strings the workflows together, Meilisearch makes search actually fast, and WhatsApp Business API plus real inbound/outbound email routing mean nobody's copy-pasting between tools by hand.",
    tools: ["n8n", "Meilisearch", "WABA", "SMTP Routing"],
  },
  {
    id: "reach",
    title: "Go anywhere",
    url: "cloud.mgmlab.dev",
    icon: Cloud,
    tagline: "Scale out, or don't leave the building",
    body: "AWS, GCP, and Azure for whenever a project needs to scale past what one building can hold — or our own data center for whenever it doesn't need to leave one. Same story with growth: GTM, Meta Ads, and the Google APIs to make it measurable instead of just loud.",
    tools: ["AWS", "GCP", "Azure", "Google APIs", "GTM", "Meta Ads", "Data Center"],
  },
];
