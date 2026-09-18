import { FocusToolkitSection } from "../shared/focus-toolkit-section";
import { STUDIO_ROLES } from "@/data/game-focus";

const ACCENT_VARS = [
  "var(--brand-green)",
  "var(--brand-blue)",
  "var(--brand-red)",
  "var(--brand-yellow)",
];

export function StudioToolkitSection() {
  return (
    <FocusToolkitSection
      eyebrow="The studio"
      eyebrowClassName="text-brand-green"
      headline="Every discipline gets a real setup, not a shared PC."
      body="Same PM tooling as every other division — Jira, Figma, Notion — on top of a kit built specifically for making games and new-media work."
      roles={STUDIO_ROLES}
      accentVars={ACCENT_VARS}
      columnsClassName="sm:grid-cols-2"
    />
  );
}
