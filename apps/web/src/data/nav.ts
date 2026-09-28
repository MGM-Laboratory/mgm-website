import type { PatternKind, PatternTone } from "@/components/process/pattern-tile";

export type NavLink = { label: string; href: string };

// Dropdown sub-items render as bento cards (see focus-bento.tsx /
// work-bento.tsx). `motif` (Focus) reuses the four Core Competency icon
// shapes — Focus is that same set of four areas — while `pattern` (Our
// Work) picks from the general pattern-tile shape set instead, since
// there's no competency-style motif to match there.
export type NavBentoLink = NavLink & {
  color: PatternTone;
  motif?: "ring" | "bracket" | "cross" | "chevron";
  pattern?: PatternKind;
};

export type NavItem =
  | { kind: "link"; label: string; href: string }
  | { kind: "dropdown"; label: string; items: NavBentoLink[] };

// `accent` cycles the brand palette across the panel so each item's hover
// state pulls from a different color instead of one accent for everything.
export const NAV_ITEMS: (NavItem & { accent: PatternTone })[] = [
  { kind: "link", label: "Home", href: "/", accent: "blue" },
  { kind: "link", label: "About Us", href: "/about", accent: "red" },
  { kind: "link", label: "Projects", href: "/projects", accent: "blue" },
  { kind: "link", label: "Publications", href: "/publications", accent: "green" },
  { kind: "link", label: "Member", href: "/member", accent: "blue" },
  { kind: "link", label: "Articles", href: "/articles", accent: "red" },
  { kind: "link", label: "Contact", href: "/contact", accent: "green" },
];

export const CONTACT_EMAIL = "hi@labmgm.org";

// Icon-only in the panel — matched to a glyph in nav-menu.tsx by label.
export const NAV_SOCIALS: NavLink[] = [
  { label: "Instagram", href: "https://www.instagram.com/labmgmfilkomub/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/mgmlab" },
];

export const LEGAL_LINKS: NavLink[] = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Service", href: "/terms-of-services" },
];
