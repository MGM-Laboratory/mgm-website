// Content for the /website Focus page. Copy is written casual and specific
// on purpose — this page is a pitch to working web developers, not a
// corporate capability statement. See docs/project-overview.md for how this
// fits the other three Focus pages (/game, /mobile, /ux). Toolkit roles and
// pipeline stages live in focus-toolkits.ts / focus-pipelines.ts instead of
// here — see those files for why.

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
