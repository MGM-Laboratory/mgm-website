/**
 * Every word the homepage story shows, in one typed module (docs/homepage-story.md).
 *
 * The WebGL story, its storybook fallback and the site loader all read from
 * here, so the copy is reviewed in one place. House rules: formal English,
 * written like a friend who is good at the job, short sentences, no dashes,
 * no hype words. Facts come from `data/competencies.ts` and the focus pages,
 * never invented.
 */

export type StoryAccent = "blue" | "red" | "yellow" | "green";

export type StoryCardId = "website" | "mobile" | "game" | "ux";

export type StoryCard = Readonly<{
  id: StoryCardId;
  /** One word, the big title on the card face. */
  title: string;
  /** One line under the title. */
  line: string;
  /** A short headline from the focus page, for a closer look. */
  tagline: string;
  href: string;
  /** The division logo in `public/logo/`. */
  logo: string;
  accent: StoryAccent;
}>;

export type StoryPanel = Readonly<{
  id: string;
  title: string;
  caption: string;
  /** Alt text of the still, once the stills exist (`STILLS_FILES`). */
  alt: string;
}>;

export const STORY_INTRO = {
  title: "Competencies",
  description: "Four things we love to do. Pick a card.",
} as const;

/** The four cards, in the order they are drawn: Website, Mobile, Game, UX. */
export const STORY_CARDS: readonly StoryCard[] = [
  {
    id: "website",
    title: "Website",
    line: "Fast, accessible sites and web apps, built to launch and built to last.",
    tagline: "You dream it. We ship it.",
    href: "/website",
    logo: "/logo/web.svg",
    accent: "blue",
  },
  {
    id: "mobile",
    title: "Mobile",
    line: "iOS and Android apps that feel native, from first prototype to store release.",
    tagline: "Every screen in someone's pocket.",
    href: "/mobile",
    logo: "/logo/mobile.svg",
    accent: "red",
  },
  {
    id: "game",
    title: "Game",
    line: "Games and VR, AR and MR worlds, made for research and for play.",
    tagline: "Press start. Build another world.",
    href: "/game",
    logo: "/logo/game.svg",
    accent: "green",
  },
  {
    id: "ux",
    title: "UX",
    line: "Research and interface design grounded in how people really use a product.",
    tagline: "We notice things you didn't.",
    href: "/ux",
    logo: "/logo/ux.svg",
    accent: "yellow",
  },
];

/** Small overlay lines while the story waits for the visitor. */
export const STORY_HINTS = {
  deckWaiting: "Keep scrolling. The deck is listening.",
  cardsReady: "Your cards are ready.",
  holdToSlow: "Hold to slow time.",
} as const;

/** The toy letters on the coffee table, one line each. */
export const STORY_LETTERS = ["We tell stories", "through interactive media."] as const;

/** HUD captions at the start of each world. */
export const STORY_WORLDS = [
  { id: "w-1", caption: "World 01 · Paper Tide" },
  { id: "w-2", caption: "World 02 · Bauhaus Dunes" },
  { id: "w-3", caption: "World 03 · Signal City" },
  { id: "w-4", caption: "World 04 · Leafhold" },
  { id: "w-5", caption: "World 05 · The Edge" },
] as const;

/** The story after the cards, told as stills in the storybook. */
export const STORY_PANELS: readonly StoryPanel[] = [
  {
    id: "table",
    title: "The table",
    caption: "The deck goes back in its box, and the box drops onto a coffee table.",
    alt: "The blue card box resting on a coffee table in a living room at dusk.",
  },
  {
    id: "toy",
    title: "The toy",
    caption: "Next to it stands a small toy, holding a pose she did not choose.",
    alt: "A small figure on a round stand, frozen in a heroic pose beside the box.",
  },
  {
    id: "spark",
    title: "The spark",
    caption: "A star slips out of the box. She reaches for it, and it pulls her into the air.",
    alt: "A glowing four-point star tugging the figure off the table.",
  },
  {
    id: "screen",
    title: "The screen",
    caption: "She learns to fly. The TV wakes up, and she dives straight into it.",
    alt: "The figure flying toward a television that shows a glowing portal.",
  },
  {
    id: "worlds",
    title: "Five worlds",
    caption:
      "A sea of cards, Bauhaus dunes, a city of light, a garden of giant leaves, and the edge of a black hole.",
    alt: "The figure flying through five different worlds, one after another.",
  },
  {
    id: "fall",
    title: "The fall",
    caption: "At the edge of the last world her glow runs out, and down she goes.",
    alt: "The figure falling, arms flailing, as her glow fades.",
  },
];

export const STORY_FINALE = {
  title: "Let's work together.",
  line: "Bring us an idea. We will build the world around it.",
  action: { label: "Get in touch", href: "/contact" },
  /** Alt text of the waving still in the storybook. */
  alt: "The figure standing on a plain background, waving hello.",
} as const;

/** The overlay control that skips the story, and brings it back in the finale. */
export const STORY_CONTROLS = {
  skip: "Skip the story",
  replay: "Watch again",
} as const;

/** The site loader's words. The loader's own design adds its status lines. */
export const LOADER_COPY = {
  label: "Loading the site",
  started: "Loading the site.",
  ready: "The site is ready.",
  statuses: ["Shuffling the deck.", "Warming up the lamps.", "Waking up a very small hero."],
} as const;
