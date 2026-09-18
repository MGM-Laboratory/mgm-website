// Content for the /website Focus page. Copy is written casual and specific
// on purpose — this page is a pitch to working web developers, not a
// corporate capability statement. See docs/project-overview.md for how this
// fits the other three Focus pages (/game, /mobile, /ux).

export type BuildKind = {
  label: string;
  kicker: string;
  body: string;
};

export const BUILD_KINDS: BuildKind[] = [
  {
    label: "Static sites",
    kicker: "Fast by default",
    body: "Marketing pages, docs, landing pages — shipped as close to the edge as the framework allows. If it can be static, we don't make it dynamic just to feel busy.",
  },
  {
    label: "Web apps",
    kicker: "Real product surfaces",
    body: "Dashboards, internal tools, anything with a login and a database behind it. Built to still make sense to whoever opens the codebase a year from now.",
  },
  {
    label: "SaaS & services",
    kicker: "Billing, auth, the unglamorous parts",
    body: "Multi-tenant products, APIs other teams depend on, the plumbing nobody sees. We've done the boring parts enough times that they're not boring anymore.",
  },
  {
    label: "Open source",
    kicker: "Public repos, real maintainers",
    body: "Tools we needed and figured other people probably do too. Issues get triaged, PRs get reviewed — not a repo we uploaded once and abandoned.",
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
      "Every project starts as a plan in Jira and a doc in Notion, not a vibe. PMs sit in the same room as engineering, push back on scope creep out loud, and keep asking the question that actually matters: who is this for, and have we talked to them yet?",
  },
  {
    role: "Design & UX",
    tagline: "From a wireframe to something you can actually click through",
    story:
      "Every screen gets drawn in Figma, tested with Maze, and reworked more than once before it's good enough to hand off. A Framer prototype gets argued over in review the same way code does — nothing ships because it looked fine on the first pass.",
  },
  {
    role: "Engineering",
    tagline: "Written, reviewed, and shipped by hand",
    story:
      "This is real coding work — engineers writing the code, reading each other's pull requests, and debugging the thing at 11pm when it breaks. No shortcuts, no black box deciding what ships; just people who know the codebase because they built it.",
  },
];

export type PipelineStage = {
  label: string;
  detail: string;
};

// Mirrors this repo's actual pipeline (see docs/ci-cd.md) — not a stock
// diagram. Push to main triggers exactly these four stages, in order.
export const PIPELINE_STAGES: PipelineStage[] = [
  { label: "Commit", detail: "Granular, one change at a time" },
  { label: "CI checks", detail: "Lint, typecheck, tests, build — GitHub Actions" },
  { label: "Container build", detail: "Docker images pushed to Docker Hub" },
  { label: "Live", detail: "Railway auto-deploys — about 30 seconds later" },
];

export const INFRA_TOOLS: string[] = [
  "Sentry",
  "Datadog",
  "Grafana",
  "Meilisearch",
  "n8n",
  "Vercel",
  "Supabase",
  "Firebase",
  "AWS",
  "GCP",
  "Azure",
  "WABA",
  "SMTP routing",
  "Google Tag Manager",
  "Meta Ads",
];

// True of this exact codebase — the "built here" section doesn't invent a
// showcase, it points at the page the visitor is already looking at.
export const PROOF_STACK: string[] = [
  "Next.js 16",
  "React 19",
  "Tailwind v4",
  "GSAP",
  "Three.js",
  "NestJS",
  "Prisma",
  "Railway",
];
