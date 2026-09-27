export type CompetencyColor = "blue" | "red" | "yellow" | "green";
export type CompetencyMotif = "ring" | "bracket" | "cross" | "chevron";

export type Competency = {
  title: string;
  href: string;
  color: CompetencyColor;
  motif: CompetencyMotif;
  /** Short blurb: the back of the homepage flip card, and the Focus page's meta description. */
  description: string;
  /** Longer intro paragraph for the competency's own page. */
  longDescription: string;
};

export const COMPETENCIES: Competency[] = [
  {
    title: "Website Development",
    href: "/website",
    color: "blue",
    motif: "ring",
    description: "Fast, accessible product sites and web apps, built to launch and built to last.",
    longDescription:
      "We design and build web products end to end: marketing sites, dashboards, and full product platforms. We focus on speed, accessibility, and code that is still easy to change a year later.",
  },
  {
    title: "Mobile Development",
    href: "/mobile",
    color: "red",
    motif: "bracket",
    description: "Native-feel iOS and Android apps, from first prototype to app-store release.",
    longDescription:
      "From early prototypes to app-store releases, we build mobile apps that feel native on both iOS and Android. We tune them on real devices, for the way people really use them.",
  },
  {
    title: "UX Research & Design",
    href: "/ux",
    color: "yellow",
    motif: "cross",
    description:
      "Usability studies and interface design grounded in how people actually use a product.",
    longDescription:
      "Every interface we ship is grounded in research: usability studies, interviews, and iteration. Our design decisions come from watching how people actually use a product.",
  },
  {
    title: "Game & New Media",
    href: "/game",
    color: "green",
    motif: "chevron",
    description: "Game, VR, XR, and MR development for research, play, and new-media experiences.",
    longDescription:
      "We build games and new-media experiences across VR, XR, and MR, from installations and prototypes to playable research tools. We make them for play and for publication.",
  },
];
