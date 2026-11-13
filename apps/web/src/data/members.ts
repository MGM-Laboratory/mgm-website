export type MemberDivision =
  | "Professors"
  | "Website"
  | "Mobile"
  | "HCI/UX"
  | "Game & XR"
  | "IT & Infrastructure"
  | "Public Relations"
  | "Media"
  | "Curriculum"
  | "Human Resource";

export type MemberAccent = "blue" | "yellow" | "red" | "green";

export type Member = {
  accent: MemberAccent;
  bio: string;
  division: MemberDivision;
  group: "Research and Development" | "Operations" | "People" | "Professors";
  hasPortrait: boolean;
  /** Pinned to the front of its division (and of "All") on the public directory. Marks division coordinators. */
  highlighted?: boolean;
  labFocus: readonly string[];
  name: string;
  nickname?: string;
  role: "Student Member" | "Professor";
  slug: string;
  unit?: "Assistant Coordinator" | "Secretariat";
};

export const MEMBER_DIVISIONS = [
  "Professors",
  "Website",
  "Mobile",
  "HCI/UX",
  "Game & XR",
  "IT & Infrastructure",
  "Public Relations",
  "Media",
  "Curriculum",
  "Human Resource",
] as const satisfies readonly MemberDivision[];
