import type { PatternTone } from "@/components/process/pattern-tile";

export type NavLink = { label: string; href: string };

export type NavItem =
  | { kind: "link"; label: string; href: string }
  | { kind: "dropdown"; label: string; items: NavLink[] };

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
      { label: "Game & XR", href: "/game" },
      { label: "Website", href: "/website" },
      { label: "Mobile", href: "/mobile" },
      { label: "HCI/UX", href: "/ux" },
    ],
  },
  {
    kind: "dropdown",
    label: "Our Work",
    accent: "green",
    items: [
      { label: "Projects", href: "/projects" },
      { label: "Publications", href: "/publications" },
      { label: "Research", href: "/research" },
    ],
  },
  { kind: "link", label: "Member", href: "/member", accent: "blue" },
  { kind: "link", label: "Articles", href: "/articles", accent: "red" },
  { kind: "link", label: "Careers", href: "/careers", accent: "yellow" },
  { kind: "link", label: "Contact", href: "/contact", accent: "green" },
];

// Icon-only in the panel — matched to a glyph in nav-menu.tsx by label.
// Placeholder hrefs until real accounts exist.
export const NAV_SOCIALS: NavLink[] = [
  { label: "Instagram", href: "https://instagram.com" },
  { label: "X (Formerly Twitter)", href: "https://x.com" },
  { label: "YouTube", href: "https://youtube.com" },
  { label: "LinkedIn", href: "https://linkedin.com" },
  { label: "Discord", href: "https://discord.com" },
];
