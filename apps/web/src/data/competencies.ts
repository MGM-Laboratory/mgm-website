export type CompetencyColor = "blue" | "red" | "yellow" | "green";
export type CompetencyMotif = "ring" | "bracket" | "cross" | "chevron";

export type Competency = {
  title: string;
  href: string;
  color: CompetencyColor;
  motif: CompetencyMotif;
  /** Short blurb — shown on the back of the flip card. */
  description: string;
  /** Longer intro paragraph — shown on the competency's own page. */
  longDescription: string;
};

export const COMPETENCIES: Competency[] = [
  {
    title: "Website Development",
    href: "/website",
    color: "blue",
    motif: "ring",
    description: "Fast, accessible product sites and web apps — built to launch and built to last.",
    longDescription:
      "We design and build web products end to end — marketing sites, dashboards, and full product platforms — with a focus on speed, accessibility, and code that's still easy to change a year later.",
  },
  {
    title: "Mobile Development",
    href: "/mobile",
    color: "red",
    motif: "bracket",
    description: "Native-feel iOS and Android apps, from first prototype to app-store release.",
    longDescription:
      "From early prototypes to app-store releases, we build mobile apps that feel native on both iOS and Android — tuned for real devices and real usage, not just a simulator.",
  },
  {
    title: "UX Research & Design",
    href: "/ux",
    color: "yellow",
    motif: "cross",
    description:
      "Usability studies and interface design grounded in how people actually use a product.",
    longDescription:
      "Every interface we ship is grounded in research — usability studies, interviews, and iteration — so design decisions come from how people actually use a product, not assumptions about them.",
  },
  {
    title: "Game & New Media",
    href: "/game",
    color: "green",
    motif: "chevron",
    description: "Game, VR, XR, and MR development for research, play, and new-media experiences.",
    longDescription:
      "We build games and new-media experiences across VR, XR, and MR — from installations and prototypes to playable research tools, built for both play and publication.",
  },
];
