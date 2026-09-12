import type { PatternTone } from "@/components/process/pattern-tile";

export type NavLink = { label: string; href: string };

// Dropdown sub-items render as bento cards (see nav-bento.tsx), so they
// carry a short description for the card's hover-revealed back/overlay.
export type NavBentoLink = NavLink & { description: string };

export type NavItem =
  | { kind: "link"; label: string; href: string }
  | { kind: "dropdown"; label: string; items: NavBentoLink[] };

// `accent` cycles the brand palette across the panel so each item's hover
// state pulls from a different color instead of one accent for everything.
export const NAV_ITEMS: (NavItem & { accent: PatternTone })[] = [
  { kind: "link", label: "Home", href: "/", accent: "blue" },
  { kind: "link", label: "About Us", href: "/about", accent: "red" },
  {
    kind: "dropdown",
    label: "Focus",
    accent: "yellow",
    items: [
      {
        label: "Game & XR",
        href: "/game",
        description: "Games and immersive experiences for research and play.",
      },
      {
        label: "Website",
        href: "/website",
        description: "Fast, accessible web products built end to end.",
      },
      { label: "Mobile", href: "/mobile", description: "Native-feel iOS and Android apps." },
      { label: "HCI/UX", href: "/ux", description: "Research-grounded interface design." },
    ],
  },
  {
    kind: "dropdown",
    label: "Our Work",
    accent: "green",
    items: [
      {
        label: "Projects",
        href: "/projects",
        description: "Research-driven products the lab has built end to end.",
      },
      {
        label: "Publications",
        href: "/publications",
        description: "Papers and write-ups from the lab.",
      },
      {
        label: "Research",
        href: "/research",
        description: "Ongoing studies shaping what we build.",
      },
    ],
  },
  { kind: "link", label: "Member", href: "/member", accent: "blue" },
  { kind: "link", label: "Articles", href: "/articles", accent: "red" },
  { kind: "link", label: "Careers", href: "/careers", accent: "yellow" },
  { kind: "link", label: "Contact", href: "/contact", accent: "green" },
];

export const CONTACT_EMAIL = "hello@mgmlaboratory.id";

// Icon-only in the panel — matched to a glyph in nav-menu.tsx by label.
// Placeholder hrefs until real accounts exist.
export const NAV_SOCIALS: NavLink[] = [
  { label: "Instagram", href: "https://instagram.com" },
  { label: "X (Formerly Twitter)", href: "https://x.com" },
  { label: "YouTube", href: "https://youtube.com" },
  { label: "LinkedIn", href: "https://linkedin.com" },
  { label: "Discord", href: "https://discord.com" },
];
